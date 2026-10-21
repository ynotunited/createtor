import { describe, expect, it } from "vitest";

import {
  API_VERSION_HEADER,
  LEGACY_API,
  LATEST_API_VERSION,
  applyVersioning,
  normalizeApiVersion,
  resolveApiVersion,
  versionHeaders,
  withApiVersion,
} from "@/lib/api-versioning.server";

function resolve(pathname: string, headers: Record<string, string> = {}) {
  return resolveApiVersion({ pathname, headers: new Headers(headers) });
}

describe("normalizeApiVersion", () => {
  it("accepts bare, prefixed and friendly forms", () => {
    expect(normalizeApiVersion("1")).toBe("v1");
    expect(normalizeApiVersion("v1")).toBe("v1");
    expect(normalizeApiVersion("V1")).toBe("v1");
    expect(normalizeApiVersion(" latest ")).toBe(LATEST_API_VERSION);
  });

  it("rejects everything else", () => {
    expect(normalizeApiVersion("v2")).toBe("v2");
    expect(normalizeApiVersion("nope")).toBeNull();
    expect(normalizeApiVersion("")).toBeNull();
    expect(normalizeApiVersion(null)).toBeNull();
    expect(normalizeApiVersion(undefined)).toBeNull();
  });
});

describe("resolveApiVersion", () => {
  it("takes the version from a versioned path", () => {
    const result = resolve("/api/v1/health");
    expect(result).toEqual({
      ok: true,
      descriptor: expect.objectContaining({ version: "v1", status: "current" }),
    });
  });

  it("accepts a matching Accept-Version on a versioned path", () => {
    expect(resolve("/api/v1/health", { [API_VERSION_HEADER]: "1" })).toMatchObject({ ok: true });
    expect(resolve("/api/v1/health", { [API_VERSION_HEADER]: "*" })).toMatchObject({ ok: true });
  });

  it("rejects a version this path does not serve with 406", () => {
    const result = resolve("/api/v1/health", { [API_VERSION_HEADER]: "2" });
    expect(result).toMatchObject({ ok: false, status: 406, successorPath: "/api/v1" });
  });

  it("404s unknown versions in the path", () => {
    expect(resolve("/api/v2/health")).toMatchObject({ ok: false, status: 404 });
  });

  it("treats unversioned paths as deprecated v0", () => {
    const result = resolve("/api/generate-image");
    expect(result).toEqual({ ok: true, descriptor: LEGACY_API });
    expect(result.ok && result.descriptor.status).toBe("deprecated");
    expect(result.ok && result.descriptor.sunsetAt).not.toBeNull();
  });

  it("serves legacy paths with an explicit v0 header", () => {
    expect(resolve("/api/health", { [API_VERSION_HEADER]: "v0" })).toMatchObject({ ok: true });
  });

  it("points clients asking for v1 at the versioned path", () => {
    expect(resolve("/api/health", { [API_VERSION_HEADER]: "v1" })).toMatchObject({
      ok: false,
      status: 406,
      successorPath: "/api/v1",
    });
  });

  it("406s unparseable version headers", () => {
    expect(resolve("/api/health", { [API_VERSION_HEADER]: "banana" })).toMatchObject({
      ok: false,
      status: 406,
    });
  });

  it("reads the JSON-friendly alias header", () => {
    expect(resolve("/api/v1/health", { "api-version": "v1" })).toMatchObject({ ok: true });
  });
});

describe("versionHeaders", () => {
  it("marks current versions without lifecycle headers", () => {
    const headers = versionHeaders({
      version: "v1",
      status: "current",
      sunsetAt: null,
      successorPath: null,
    });
    expect(headers["X-API-Version"]).toBe("v1");
    expect(headers["X-API-Latest-Version"]).toBe(LATEST_API_VERSION);
    expect(headers["Vary"]).toBe(API_VERSION_HEADER);
    expect(headers["Deprecation"]).toBeUndefined();
    expect(headers["Sunset"]).toBeUndefined();
  });

  it("emits Deprecation, Sunset and the successor link for deprecated versions", () => {
    const headers = versionHeaders(LEGACY_API);
    expect(headers["Deprecation"]).toBe("true");
    expect(headers["Sunset"]).toBe(new Date(LEGACY_API.sunsetAt!).toUTCString());
    expect(headers["Link"]).toBe('</api/v1>; rel="successor-version"');
    expect(headers["Warning"]).toContain("deprecated");
  });
});

describe("applyVersioning", () => {
  it("merges version headers into the response and preserves Vary", async () => {
    const response = applyVersioning(
      LEGACY_API,
      new Response("ok", { headers: { "Content-Type": "text/plain", Vary: "Origin" } }),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(response.headers.get("X-API-Version")).toBe("v0");
    expect(response.headers.get("Vary")).toBe("Origin, Accept-Version");
    expect(response.headers.get("Deprecation")).toBe("true");
  });
});

describe("withApiVersion", () => {
  const handler = withApiVersion(async () => Response.json({ ok: true }));

  it("stamps versioned responses", async () => {
    const response = await handler({ request: new Request("http://localhost/api/v1/health") });
    expect(response.status).toBe(200);
    expect(response.headers.get("X-API-Version")).toBe("v1");
    expect(response.headers.get("Deprecation")).toBeNull();
    expect(await response.json()).toEqual({ ok: true });
  });

  it("deprecates unversioned responses", async () => {
    const response = await handler({ request: new Request("http://localhost/api/health") });
    expect(response.headers.get("X-API-Version")).toBe("v0");
    expect(response.headers.get("Deprecation")).toBe("true");
    expect(response.headers.get("Sunset")).toBeTruthy();
  });

  it("answers 404 for unknown versions without calling the handler", async () => {
    let called = false;
    const guarded = withApiVersion(async () => {
      called = true;
      return new Response("nope");
    });
    const response = await guarded({ request: new Request("http://localhost/api/v9/health") });
    expect(response.status).toBe(404);
    expect(called).toBe(false);
    expect(response.headers.get("X-API-Latest-Version")).toBe(LATEST_API_VERSION);
  });

  it("answers 406 when the caller asks for a version this path lacks", async () => {
    const response = await handler({
      request: new Request("http://localhost/api/v1/health", {
        headers: { [API_VERSION_HEADER]: "2" },
      }),
    });
    expect(response.status).toBe(406);
    expect(response.headers.get("Link")).toBe('</api/v1>; rel="successor-version"');
  });
});
