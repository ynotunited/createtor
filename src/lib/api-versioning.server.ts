/**
 * API version negotiation and lifecycle headers.
 *
 * Path wins over headers, headers over defaults:
 *
 *   1. `/api/v1/...`  → the version in the path.
 *   2. `Accept-Version: 1` (or `api-version`) → that version, if this path
 *      serves it; otherwise `406 Not Acceptable`.
 *   3. Otherwise → `v0`, the unversioned surface (`/api/health`,
 *      `/api/generate-image`).
 *
 * `v1` is current. `v0` (any path without a version segment) is served but
 * marked deprecated with `Deprecation` / `Sunset` / successor `Link` headers so
 * machine clients can migrate without reading docs. Provider webhooks
 * (`/api/payments/*`) are excluded: they are verified with the provider's own
 * signature scheme and are not part of this version surface.
 */

export const API_VERSIONS = ["v1"] as const;
export type ApiVersion = (typeof API_VERSIONS)[number];

/** Version responses advertise as the one to move to. */
export const LATEST_API_VERSION: ApiVersion = "v1";

/** RFC 8288-style content negotiation header (plus a JSON-friendly alias). */
export const API_VERSION_HEADER = "Accept-Version";
export const API_VERSION_HEADER_ALIAS = "api-version";

export interface ApiVersionDescriptor {
  /** Wire form, e.g. `v1`. */
  readonly version: string;
  readonly status: "current" | "deprecated";
  /** ISO instant after which this version must be removed (410). */
  readonly sunsetAt: string | null;
  /** Path clients should migrate to, if any. */
  readonly successorPath: string | null;
}

/**
 * Lifecycle state per versioned path. To retire a version: set
 * `status: "deprecated"` with a `sunsetAt` and a `successorPath` here, bump
 * `LATEST_API_VERSION`, and add the new version to `API_VERSIONS` — every
 * response header follows from this table.
 */
const API_VERSION_DESCRIPTORS = {
  v1: { version: "v1", status: "current", sunsetAt: null, successorPath: null },
} as const satisfies Record<string, ApiVersionDescriptor>;

/**
 * Deprecation clock for the unversioned surface: announced now, removed on
 * this date. Bump the date (and the docs) rather than silently keeping `v0`
 * alive forever.
 */
export const LEGACY_SUNSET_AT = "2027-10-20T00:00:00.000Z";

export const LEGACY_API: ApiVersionDescriptor = Object.freeze({
  version: "v0",
  status: "deprecated",
  sunsetAt: LEGACY_SUNSET_AT,
  successorPath: "/api/v1",
});

const VERSIONED_PATH = /^\/api\/(v\d+)(?=\/|$)/;

/** `1`, `v1`, `V1`, `latest` → `v1`; anything unparseable → `null`. */
export function normalizeApiVersion(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === "") return null;
  if (trimmed === "latest") return LATEST_API_VERSION;
  const match = /^(?:v)?(\d+)$/.exec(trimmed);
  return match ? `v${match[1]}` : null;
}

export function isSupportedApiVersion(value: string | null): value is ApiVersion {
  return value !== null && (API_VERSIONS as readonly string[]).includes(value);
}

export type VersionResolution =
  | { ok: true; descriptor: ApiVersionDescriptor }
  | { ok: false; status: 404 | 406; message: string; successorPath: string | null };

function unsupported(status: 404 | 406, message: string, successorPath: string | null = null) {
  return { ok: false as const, status, message, successorPath };
}

export function resolveApiVersion(input: {
  pathname: string;
  headers: Headers;
}): VersionResolution {
  const { pathname, headers } = input;
  const rawHeader = headers.get(API_VERSION_HEADER) ?? headers.get(API_VERSION_HEADER_ALIAS);
  const header = rawHeader === null ? null : rawHeader.trim();
  const isWildcard = header !== null && (header === "" || header === "*");
  const requested = isWildcard ? null : normalizeApiVersion(header);

  const pathMatch = VERSIONED_PATH.exec(pathname);
  if (pathMatch) {
    const pathVersion = normalizeApiVersion(pathMatch[1]);
    if (!isSupportedApiVersion(pathVersion)) {
      return unsupported(
        404,
        `Unknown API version "${pathMatch[1]}".`,
        `/api/${LATEST_API_VERSION}`,
      );
    }
    if (header !== null && !isWildcard && requested !== pathVersion) {
      return unsupported(
        406,
        `This endpoint is served as ${pathVersion}; "${header}" is not available here.`,
        `/api/${pathVersion}`,
      );
    }
    return { ok: true, descriptor: API_VERSION_DESCRIPTORS[pathVersion] };
  }

  if (header !== null && !isWildcard) {
    // `v0` names exactly what this unversioned path serves; every other
    // version only exists under a versioned path.
    if (requested === LEGACY_API.version) return { ok: true, descriptor: LEGACY_API };
    if (requested === null) {
      return unsupported(406, `Unsupported API version "${header}".`, `/api/${LATEST_API_VERSION}`);
    }
    return unsupported(
      406,
      `This endpoint is unversioned (deprecated); version ${requested} lives under /api/${requested}.`,
      `/api/${requested}`,
    );
  }

  return { ok: true, descriptor: LEGACY_API };
}

/** Response headers describing the version being served. */
export function versionHeaders(descriptor: ApiVersionDescriptor): Record<string, string> {
  const headers: Record<string, string> = {
    "X-API-Version": descriptor.version,
    "X-API-Latest-Version": LATEST_API_VERSION,
    Vary: API_VERSION_HEADER,
  };
  if (descriptor.status === "deprecated") {
    const sunset = descriptor.sunsetAt ? new Date(descriptor.sunsetAt) : null;
    headers["Deprecation"] = "true";
    if (sunset && !Number.isNaN(sunset.getTime())) {
      headers["Sunset"] = sunset.toUTCString();
      headers["Warning"] =
        `299 - "This API version is deprecated and will be removed on ${sunset.toISOString()}"`;
    }
    if (descriptor.successorPath) {
      headers["Link"] = `<${descriptor.successorPath}>; rel="successor-version"`;
    }
  }
  return headers;
}

/** Copies `response` with version headers merged in (existing `Vary` kept). */
export function applyVersioning(descriptor: ApiVersionDescriptor, response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(versionHeaders(descriptor))) {
    if (key.toLowerCase() === "vary" && headers.has("Vary")) {
      const existing = headers.get("Vary") ?? "";
      const values = new Set(
        [...existing.split(","), ...value.split(",")]
          .map((v) => v.trim())
          .filter((v) => v.length > 0),
      );
      headers.set("Vary", [...values].join(", "));
      continue;
    }
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** JSON error body that always advertises the latest version to move to. */
export function jsonApiError(
  status: number,
  message: string,
  successorPath: string | null = null,
): Response {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "X-API-Latest-Version": LATEST_API_VERSION,
    Vary: API_VERSION_HEADER,
  });
  if (successorPath) headers.set("Link", `<${successorPath}>; rel="successor-version"`);
  return new Response(JSON.stringify({ error: message }), { status, headers });
}

function resolutionErrorResponse(resolution: Extract<VersionResolution, { ok: false }>): Response {
  return jsonApiError(resolution.status, resolution.message, resolution.successorPath);
}

export type ApiHandler = (ctx: { request: Request }) => Response | Promise<Response>;

/**
 * Wraps an API route handler with negotiation (404/406) and lifecycle headers.
 * The version is derived from the request path, so the same wrapper serves both
 * `/api/v1/*` (current) and `/api/*` (deprecated legacy) routes.
 */
export function withApiVersion(handler: ApiHandler): ApiHandler {
  return async (ctx) => {
    const pathname = new URL(ctx.request.url).pathname;
    const resolution = resolveApiVersion({ pathname, headers: ctx.request.headers });
    if (!resolution.ok) return resolutionErrorResponse(resolution);
    const response = await handler(ctx);
    return applyVersioning(resolution.descriptor, response);
  };
}
