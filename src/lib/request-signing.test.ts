import { describe, expect, it } from "vitest";

import {
  KEY_ID_HEADER,
  NONCE_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  authenticateMutation,
  canonicalPath,
  canonicalString,
  classifyMutationAuth,
  computeSignature,
  loadSignatureConfig,
  sha256Hex,
  signRequest,
  verifySignature,
} from "@/lib/request-signing.server";

const KEY_ID = "integration-a";
const SECRET = "0123456789abcdef0123456789abcdef";
const NOW = 1_800_000_000;
const NONCE = "abcdef1234567890abcdef12";

const config = loadSignatureConfig({ API_SIGNING_KEYS: `${KEY_ID}:${SECRET}` });

function signed(
  input: { path?: string; body?: string; timestamp?: number; nonce?: string; keyId?: string } = {},
) {
  const headers = signRequest({
    method: "POST",
    url: `http://localhost${input.path ?? "/api/v1/generate-image"}`,
    body: input.body ?? '{"prompt":"a"}',
    secret: SECRET,
    keyId: input.keyId ?? KEY_ID,
    timestamp: String(input.timestamp ?? NOW),
    nonce: input.nonce ?? NONCE,
  });
  return headers;
}

async function verify(
  headers: Headers,
  input: { path?: string; body?: string; nowSeconds?: number; config?: typeof config | null } = {},
) {
  return verifySignature({
    headers,
    method: "POST",
    path: input.path ?? "/api/v1/generate-image",
    body: input.body ?? '{"prompt":"a"}',
    config: "config" in input ? (input.config ?? null) : config,
    nowSeconds: input.nowSeconds ?? NOW,
    replayCheck: async () => false,
  });
}

describe("canonicalString", () => {
  it("signs method, path, timestamp, nonce and the body digest", () => {
    const body = '{"prompt":"a"}';
    const canonical = canonicalString({
      method: "post",
      path: "/api/v1/generate-image?x=1",
      timestamp: String(NOW),
      nonce: NONCE,
      body,
    });
    const lines = canonical.split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe("POST");
    expect(lines[1]).toBe("/api/v1/generate-image?x=1");
    expect(lines[2]).toBe(String(NOW));
    expect(lines[3]).toBe(NONCE);
    expect(lines[4]).toBe(sha256Hex(body));
    const [method, path, timestamp, nonce, digest] = lines as [
      string,
      string,
      string,
      string,
      string,
    ];
    expect(digest).toBe(sha256Hex(body));
    expect(computeSignature({ method, path, timestamp, nonce, body }, SECRET)).toBe(
      computeSignature({ method: "POST", path, timestamp, nonce, body }, SECRET),
    );
  });

  it("includes the query string in the signed path", () => {
    expect(canonicalPath(new URL("http://localhost/api/v1/health?a=1&b=2"))).toBe(
      "/api/v1/health?a=1&b=2",
    );
  });
});

describe("loadSignatureConfig", () => {
  it("parses kid:secret pairs", () => {
    const parsed = loadSignatureConfig({
      API_SIGNING_KEYS: "a:0123456789abcdef0123, b:fedcba9876543210fedc",
    });
    expect(parsed?.keys.size).toBe(2);
    expect(parsed?.keys.get("a")).toBe("0123456789abcdef0123");
  });

  it("falls back to a single implicit default key", () => {
    const parsed = loadSignatureConfig({ API_SIGNING_SECRET: SECRET });
    expect(parsed?.keys.get("default")).toBe(SECRET);
  });

  it("returns null when nothing usable is configured", () => {
    expect(loadSignatureConfig({})).toBeNull();
    expect(loadSignatureConfig({ API_SIGNING_KEYS: "nocolon" })).toBeNull();
    expect(loadSignatureConfig({ API_SIGNING_SECRET: "short" })).toBeNull();
  });
});

describe("verifySignature", () => {
  it("accepts a well-formed signature", async () => {
    const result = await verify(signed());
    expect(result).toEqual({ ok: true, keyId: KEY_ID });
  });

  it("rejects a tampered body", async () => {
    const headers = signed({ body: '{"prompt":"a"}' });
    const result = await verify(headers, { body: '{"prompt":"b"}' });
    expect(result).toMatchObject({ ok: false, status: 401, code: "bad_signature" });
  });

  it("rejects a tampered path", async () => {
    const headers = signed({ path: "/api/v1/generate-image" });
    const result = await verify(headers, { path: "/api/v1/other" });
    expect(result).toMatchObject({ ok: false, code: "bad_signature" });
  });

  it("requires every signature header", async () => {
    const headers = new Headers({ [SIGNATURE_HEADER]: "deadbeef" });
    const result = await verify(headers);
    expect(result).toMatchObject({ ok: false, status: 401, code: "missing_signature_headers" });
  });

  it("rejects unknown key ids", async () => {
    const result = await verify(signed({ keyId: "intruder" }));
    expect(result).toMatchObject({ ok: false, status: 401, code: "unknown_key" });
  });

  it("rejects timestamps outside the skew window in both directions", async () => {
    const past = await verify(signed({ timestamp: NOW - 301 }), { nowSeconds: NOW });
    expect(past).toMatchObject({ ok: false, code: "stale_timestamp" });
    const future = await verify(signed({ timestamp: NOW + 301 }), { nowSeconds: NOW });
    expect(future).toMatchObject({ ok: false, code: "stale_timestamp" });
    const edge = await verify(signed({ timestamp: NOW - 300 }), { nowSeconds: NOW });
    expect(edge).toMatchObject({ ok: true });
  });

  it("rejects malformed nonces", async () => {
    const result = await verify(signed({ nonce: "short" }));
    expect(result).toMatchObject({ ok: false, code: "invalid_nonce" });
  });

  it("fails closed when signing is not configured", async () => {
    const result = await verify(signed(), { config: null });
    expect(result).toMatchObject({ ok: false, status: 503, code: "signing_not_configured" });
  });

  it("rejects replayed nonces", async () => {
    const result = await verifySignature({
      headers: signed(),
      method: "POST",
      path: "/api/v1/generate-image",
      body: '{"prompt":"a"}',
      config,
      nowSeconds: NOW,
      replayCheck: async () => true,
    });
    expect(result).toMatchObject({ ok: false, status: 409, code: "replayed_nonce" });
  });

  it("fails closed when the replay store is unavailable", async () => {
    const result = await verifySignature({
      headers: signed(),
      method: "POST",
      path: "/api/v1/generate-image",
      body: '{"prompt":"a"}',
      config,
      nowSeconds: NOW,
      replayCheck: async () => null,
    });
    expect(result).toMatchObject({ ok: false, status: 503, code: "replay_check_unavailable" });
  });
});

describe("authenticateMutation", () => {
  const url = "http://localhost/api/v1/generate-image";
  // This path validates against the real clock, so sign with "now".
  const liveSignature = () => signed({ timestamp: Math.floor(Date.now() / 1000) });

  it("authenticates a signed machine request", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: liveSignature(),
      body: '{"prompt":"a"}',
    });
    const auth = await authenticateMutation(request, '{"prompt":"a"}', {
      config,
      replayCheck: async () => false,
    });
    expect(auth).toEqual({ method: "signature", keyId: KEY_ID });
  });

  it("accepts a session bearer token", async () => {
    const request = new Request(url, {
      method: "POST",
      headers: { Authorization: "Bearer session-jwt" },
      body: "{}",
    });
    const auth = await authenticateMutation(request, "{}", { config });
    expect(auth).toEqual({ method: "session" });
  });

  it("rejects unauthenticated mutations", async () => {
    const request = new Request(url, { method: "POST", body: "{}" });
    const auth = await authenticateMutation(request, "{}", { config });
    expect(auth).toMatchObject({ response: expect.objectContaining({ status: 401 }) });
  });

  it("returns the signature failure response on a bad signature", async () => {
    const headers = liveSignature();
    headers.set(SIGNATURE_HEADER, "0".repeat(64));
    const request = new Request(url, { method: "POST", headers, body: '{"prompt":"a"}' });
    const auth = await authenticateMutation(request, '{"prompt":"a"}', {
      config,
      replayCheck: async () => false,
    });
    expect("response" in auth && auth.response.status).toBe(401);
    expect("response" in auth && auth.response.headers.get("WWW-Authenticate")).toContain(
      'error="bad_signature"',
    );
  });
});

describe("classifyMutationAuth", () => {
  it("reports the credential shape without verifying it", () => {
    expect(classifyMutationAuth(new Headers({ [SIGNATURE_HEADER]: "abc" }))).toBe("signature");
    expect(classifyMutationAuth(new Headers({ [KEY_ID_HEADER]: "a" }))).toBe("signature");
    expect(classifyMutationAuth(new Headers({ Authorization: "Bearer session-jwt" }))).toBe(
      "session",
    );
    expect(classifyMutationAuth(new Headers())).toBeNull();
  });
});

describe("header names", () => {
  it("are stable across the public surface", () => {
    expect([KEY_ID_HEADER, TIMESTAMP_HEADER, NONCE_HEADER, SIGNATURE_HEADER]).toEqual([
      "X-Key-Id",
      "X-Timestamp",
      "X-Nonce",
      "X-Signature",
    ]);
  });
});
