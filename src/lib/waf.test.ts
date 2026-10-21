import { describe, expect, it } from "vitest";

import { inspectRequest } from "@/lib/waf.server";

function request(path: string, init?: RequestInit): Request {
  return new Request(`https://app.example.com${path}`, init);
}

describe("inspectRequest", () => {
  it("allows ordinary traffic", () => {
    expect(inspectRequest(request("/dashboard?tab=recent")).action).toBe("allow");
  });

  it("does not flag innocuous query text", () => {
    expect(inspectRequest(request("/search?q=how+to+select+from+a+list")).action).toBe("allow");
  });

  it("relies on runtime URL normalisation for dot-segments", () => {
    // The WHATWG URL/Runtime resolves `..` (and %2e%2e) segments before the WAF
    // ever runs, so traversal never reaches a handler as a raw path.
    const req = request("/assets/../../etc/passwd");
    expect(req.url).not.toContain("..");
    expect(inspectRequest(req).action).toBe("allow");
  });

  it("blocks null bytes", () => {
    expect(inspectRequest(request("/file%00.txt")).action).toBe("block");
  });

  it("blocks obvious SQL injection", () => {
    expect(inspectRequest(request("/x?id=1+union+select+password")).action).toBe("block");
    expect(inspectRequest(request("/x?q='+or+'1'='1")).action).toBe("block");
  });

  it("blocks XSS probes and command injection", () => {
    expect(inspectRequest(request("/x?q=<script>alert(1)</script>")).action).toBe("block");
    expect(inspectRequest(request("/x?q=javascript:alert(1)")).action).toBe("block");
    expect(inspectRequest(request("/x?host=$(whoami)")).action).toBe("block");
  });

  it("rejects disallowed methods", () => {
    const verdict = inspectRequest(request("/api/thing", { method: "SEARCH" }));
    expect(verdict.action).toBe("block");
    if (verdict.action === "block") expect(verdict.status).toBe(405);
  });

  it("rejects oversized declared bodies", () => {
    const verdict = inspectRequest(
      request("/api/upload", {
        method: "POST",
        headers: { "content-length": String(50 * 1024 * 1024) },
      }),
    );
    expect(verdict.action).toBe("block");
    if (verdict.action === "block") expect(verdict.status).toBe(413);
  });

  it("rejects absurdly long URLs", () => {
    const verdict = inspectRequest(request(`/x?q=${"a".repeat(3000)}`));
    expect(verdict.action).toBe("block");
    if (verdict.action === "block") expect(verdict.status).toBe(414);
  });
});
