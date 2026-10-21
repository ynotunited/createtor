/**
 * HMAC request signing for machine callers.
 *
 * Browser traffic cannot carry a shared secret (the bundle is public), so
 * mutating API endpoints accept **either**:
 *
 *   - a signed request — `X-Key-Id` + `X-Timestamp` + `X-Nonce` +
 *     `X-Signature` over `METHOD \n path \n timestamp \n nonce \n sha256(body)`,
 *     proving the caller holds `API_SIGNING_KEYS[kid]`; or
 *   - a signed session JWT (`Authorization: Bearer …`) from Supabase, which is
 *     what the browser sends today.
 *
 * Anything else is a 401. Timestamps are capped at ±5 minutes to bound replay
 * windows, and nonces are consumed through the shared fixed-window limiter so a
 * captured request cannot be replayed inside that window.
 *
 * Configure with `API_SIGNING_KEYS="kid1:secret1,kid2:secret2"` (preferred, one
 * key per integration so you can rotate) or `API_SIGNING_SECRET` for a single
 * implicit `default` key.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const KEY_ID_HEADER = "X-Key-Id";
export const TIMESTAMP_HEADER = "X-Timestamp";
export const NONCE_HEADER = "X-Nonce";
export const SIGNATURE_HEADER = "X-Signature";

/** Seconds a signed request stays valid (skew in either direction). */
export const DEFAULT_MAX_SKEW_SECONDS = 300;
/** Seconds a nonce is remembered for replay rejection. Must cover the skew. */
export const DEFAULT_NONCE_WINDOW_SECONDS = 600;

const NONCE_REPLAY_PREFIX = "sig-nonce";
const SIGNATURE_HEADER_NAMES = [KEY_ID_HEADER, TIMESTAMP_HEADER, NONCE_HEADER, SIGNATURE_HEADER];
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export interface SignatureConfig {
  readonly keys: ReadonlyMap<string, string>;
  readonly maxSkewSeconds: number;
}

export type EnvLike = Record<string, string | undefined>;

function parseKeys(raw: string): Map<string, string> {
  const keys = new Map<string, string>();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (trimmed === "") continue;
    const separator = trimmed.indexOf(":");
    if (separator <= 0) continue;
    const keyId = trimmed.slice(0, separator).trim();
    const secret = trimmed.slice(separator + 1);
    if (!KEY_ID_PATTERN.test(keyId)) continue;
    if (secret.length < 16) continue;
    keys.set(keyId, secret);
  }
  return keys;
}

/**
 * Returns `null` when no signing key is configured. Present-but-unusable values
 * also resolve to `null` (logged), so a typo degrades to "signing unavailable"
 * instead of serving a broken key.
 */
export function loadSignatureConfig(env: EnvLike = process.env): SignatureConfig | null {
  const maxSkewSeconds = Number.parseInt(env["API_SIGNING_MAX_SKEW_SECONDS"] ?? "", 10);
  const skew =
    Number.isFinite(maxSkewSeconds) && maxSkewSeconds > 0 && maxSkewSeconds <= 3600
      ? maxSkewSeconds
      : DEFAULT_MAX_SKEW_SECONDS;

  const rawKeys = env["API_SIGNING_KEYS"];
  if (rawKeys && rawKeys.trim() !== "") {
    const keys = parseKeys(rawKeys);
    if (keys.size === 0) {
      console.error("[request-signing] API_SIGNING_KEYS is set but contains no usable key.");
      return null;
    }
    return { keys, maxSkewSeconds: skew };
  }

  const single = env["API_SIGNING_SECRET"];
  if (single && single.length >= 16) {
    return { keys: new Map([["default", single]]), maxSkewSeconds: skew };
  }
  return null;
}

export function sha256Hex(body: string): string {
  return createHash("sha256").update(body, "utf8").digest("hex");
}

/** The exact bytes both sides hash. Stable across clients and versions. */
export function canonicalString(input: {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  body: string;
}): string {
  return [
    input.method.toUpperCase(),
    input.path,
    input.timestamp,
    input.nonce,
    sha256Hex(input.body),
  ].join("\n");
}

export function computeSignature(
  input: Parameters<typeof canonicalString>[0],
  secret: string,
): string {
  return createHmac("sha256", secret).update(canonicalString(input), "utf8").digest("hex");
}

/** `pathname + search` — the query string is signed so it cannot be rewritten. */
export function canonicalPath(url: URL): string {
  return `${url.pathname}${url.search}`;
}

/**
 * Builds the signature headers for an outgoing request. Used by server-to-server
 * integrations and by the tests; browsers never sign.
 */
export function signRequest(input: {
  method: string;
  url: string | URL;
  body?: string;
  secret: string;
  keyId: string;
  timestamp?: string;
  nonce?: string;
}): Headers {
  const url = typeof input.url === "string" ? new URL(input.url) : input.url;
  const timestamp = input.timestamp ?? String(Math.floor(Date.now() / 1000));
  const nonce = input.nonce ?? randomNonce();
  const body = input.body ?? "";
  const signature = computeSignature(
    { method: input.method, path: canonicalPath(url), timestamp, nonce, body },
    input.secret,
  );
  const headers = new Headers();
  headers.set(KEY_ID_HEADER, input.keyId);
  headers.set(TIMESTAMP_HEADER, timestamp);
  headers.set(NONCE_HEADER, nonce);
  headers.set(SIGNATURE_HEADER, signature);
  return headers;
}

export function randomNonce(): string {
  return createHash("sha256")
    .update(`${Date.now()}:${Math.random()}:${Math.random()}`)
    .digest("hex")
    .slice(0, 32);
}

export type SignatureCheck =
  { ok: true; keyId: string } | { ok: false; status: number; code: string; message: string };

/** `true` = already seen, `null` = the replay store is unavailable. */
export type ReplayCheck = (
  keyId: string,
  nonce: string,
  windowSeconds: number,
) => Promise<boolean | null>;

/** Nonce replay store backed by the shared Postgres/Redis fixed-window limiter. */
export const limiterReplayCheck: ReplayCheck = async (keyId, nonce, windowSeconds) => {
  try {
    const { consumeRateLimit } = await import("@/lib/rate-limit-core.server");
    const decision = await consumeRateLimit(
      `${NONCE_REPLAY_PREFIX}:${keyId}:${nonce}`,
      1,
      windowSeconds,
    );
    if (decision === "denied") return true;
    if (decision === "allowed") return false;
    return null;
  } catch {
    return null;
  }
};

function failure(status: number, code: string, message: string): SignatureCheck {
  return { ok: false, status, code, message };
}

export async function verifySignature(input: {
  headers: Headers;
  method: string;
  path: string;
  body: string;
  config: SignatureConfig | null;
  nowSeconds?: number;
  replayCheck?: ReplayCheck;
  nonceWindowSeconds?: number;
}): Promise<SignatureCheck> {
  const { headers, method, path, body, config } = input;
  const missing = SIGNATURE_HEADER_NAMES.filter((name) => !headers.get(name));
  if (missing.length > 0) {
    return failure(
      401,
      "missing_signature_headers",
      `Missing signature header(s): ${missing.join(", ")}.`,
    );
  }
  if (!config) {
    return failure(
      503,
      "signing_not_configured",
      "Request signing is not configured on this server.",
    );
  }

  const keyId = headers.get(KEY_ID_HEADER) ?? "";
  const secret = config.keys.get(keyId);
  if (!secret) return failure(401, "unknown_key", "Unknown signing key id.");

  const timestamp = headers.get(TIMESTAMP_HEADER) ?? "";
  const timestampSeconds = Number.parseInt(timestamp, 10);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(timestampSeconds)) {
    return failure(401, "invalid_timestamp", "X-Timestamp must be unix seconds.");
  }
  if (Math.abs(now - timestampSeconds) > config.maxSkewSeconds) {
    return failure(
      401,
      "stale_timestamp",
      `X-Timestamp is outside the ±${config.maxSkewSeconds}s window.`,
    );
  }

  const nonce = headers.get(NONCE_HEADER) ?? "";
  if (!NONCE_PATTERN.test(nonce)) {
    return failure(401, "invalid_nonce", "X-Nonce must be 8-64 url-safe characters.");
  }

  const expected = computeSignature({ method, path, timestamp, nonce, body }, secret);
  const provided = headers.get(SIGNATURE_HEADER) ?? "";
  const expectedBuffer = Buffer.from(expected, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  const matches =
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer);
  if (!matches) return failure(401, "bad_signature", "Signature does not match this request.");

  const replayCheck = input.replayCheck ?? limiterReplayCheck;
  const windowSeconds = input.nonceWindowSeconds ?? DEFAULT_NONCE_WINDOW_SECONDS;
  let replayed: boolean | null;
  try {
    replayed = await replayCheck(keyId, nonce, windowSeconds);
  } catch {
    replayed = null;
  }
  if (replayed === null) {
    return failure(503, "replay_check_unavailable", "Could not verify request uniqueness.");
  }
  if (replayed) return failure(409, "replayed_nonce", "This request was already received.");

  return { ok: true, keyId };
}

export function signatureErrorResponse(check: Extract<SignatureCheck, { ok: false }>): Response {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  if (check.status === 401) {
    headers.set("WWW-Authenticate", `Signature realm="createtor", error="${check.code}"`);
  }
  return new Response(JSON.stringify({ error: check.message, code: check.code }), {
    status: check.status,
    headers,
  });
}

export type MutationAuth =
  { method: "signature"; keyId: string } | { method: "session" } | { response: Response };

/** True when the caller is attempting HMAC signing rather than a bearer token. */
export function hasSignatureHeaders(headers: Headers): boolean {
  return SIGNATURE_HEADER_NAMES.some((name) => headers.get(name) !== null);
}

/**
 * Authorizes a mutating API request: HMAC signature when the caller presents
 * one, otherwise a signed session bearer token (validated by the route).
 */
export async function authenticateMutation(
  request: Request,
  body: string,
  options?: { replayCheck?: ReplayCheck; config?: SignatureConfig | null },
): Promise<MutationAuth> {
  const config = options?.config !== undefined ? options.config : loadSignatureConfig();

  const kind = classifyMutationAuth(request.headers);
  if (kind === null) return { response: authenticationRequiredResponse() };

  if (kind === "signature") {
    const url = new URL(request.url);
    const check = await verifySignature({
      headers: request.headers,
      method: request.method,
      path: canonicalPath(url),
      body,
      config,
      ...(options?.replayCheck ? { replayCheck: options.replayCheck } : {}),
    });
    if (!check.ok) return { response: signatureErrorResponse(check) };
    return { method: "signature", keyId: check.keyId };
  }

  return { method: "session" };
}

/**
 * Which credential the caller presented, without verifying anything. Lets a
 * handler reject anonymous requests before it buffers (or parses) the body.
 */
export function classifyMutationAuth(headers: Headers): "signature" | "session" | null {
  if (hasSignatureHeaders(headers)) return "signature";
  if (headers.get("authorization")?.replace(/^Bearer\s+/i, "")) return "session";
  return null;
}

export function authenticationRequiredResponse(): Response {
  return signatureErrorResponse({
    ok: false,
    status: 401,
    code: "authentication_required",
    message: "Provide a signed request or an Authorization bearer token.",
  });
}
