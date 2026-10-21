import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  consume: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/lib/rate-limit-core.server", () => ({ consumeRateLimit: mocks.consume }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ insert: mocks.insert }) },
}));

import { recordSecurityEvent } from "@/lib/security-events.server";

const USER_ID = "831665df-2a7f-46af-a4f9-2c6bf3953dbd";
const WORKSPACE_ID = "11111111-2222-3333-4444-555555555555";

type InsertRow = {
  kind: string;
  ip: string | null;
  user_id: string | null;
  workspace_id: string | null;
  path: string | null;
  user_agent: string | null;
  metadata: unknown;
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.consume.mockReset().mockResolvedValue("allowed");
  mocks.insert.mockReset().mockResolvedValue({ error: null });
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function firstInsert(): InsertRow {
  const call = mocks.insert.mock.calls[0];
  if (!call) throw new Error("insert was not called");
  return call[0] as InsertRow;
}

describe("recordSecurityEvent", () => {
  it("always logs, then persists extracted columns with bounded extras as metadata", async () => {
    await recordSecurityEvent("rate_limited", {
      bucket: "ai",
      method: "POST",
      ip: "  1.2.3.4  ",
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      path: "/api/generate-image",
      ua: "curl/8",
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("security.rate_limited");

    expect(mocks.insert).toHaveBeenCalledTimes(1);
    const row = firstInsert();
    expect(row).toMatchObject({
      kind: "rate_limited",
      user_id: USER_ID,
      workspace_id: WORKSPACE_ID,
      path: "/api/generate-image",
      user_agent: "curl/8",
    });
    // The raw IP is never persisted; only a pseudonym reaches the column.
    expect(row.ip).toMatch(/^ip_[0-9a-f]{16}$/);
    expect(row.ip).not.toContain("1.2.3.4");
    expect(row.metadata).toEqual({ bucket: "ai", method: "POST" });
  });

  it("gates persistence per kind and a hashed IP (30 per 60s)", async () => {
    await recordSecurityEvent("auth_denied", { ip: "9.9.9.9" });
    const key = mocks.consume.mock.calls[0]?.[0] as string;
    expect(key).toMatch(/^security_store:auth_denied:ip_[0-9a-f]{16}$/);
    expect(key).not.toContain("9.9.9.9");
    expect(mocks.consume).toHaveBeenCalledWith(key, 30, 60);
  });

  it("skips persistence when the store gate denies, but still logs", async () => {
    mocks.consume.mockResolvedValue("denied");
    await recordSecurityEvent("rate_limited", { ip: "1.2.3.4" });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("fails closed (skips persistence) when the gate errors", async () => {
    mocks.consume.mockResolvedValue("error");
    await recordSecurityEvent("https_redirect", { ip: "1.2.3.4" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("never rejects when the insert fails", async () => {
    mocks.insert.mockResolvedValue({ error: { message: "boom" } });
    await expect(recordSecurityEvent("auth_denied", { ip: "1.2.3.4" })).resolves.toBeUndefined();
  });

  it("drops non-UUID ids instead of breaking the insert", async () => {
    await recordSecurityEvent("auth_denied", { userId: "not-a-uuid", workspaceId: "" });
    const row = firstInsert();
    expect(row.user_id).toBeNull();
    expect(row.workspace_id).toBeNull();
  });

  it("caps oversized fields and collapses oversized metadata", async () => {
    await recordSecurityEvent("x".repeat(200), {
      ua: "u".repeat(500),
      path: "p".repeat(900),
      huge: "z".repeat(5000),
    });

    const row = firstInsert();
    expect(row.kind.length).toBe(64);
    expect(row.user_agent?.length).toBe(200);
    expect(row.path?.length).toBe(512);
    expect(row.metadata).toEqual({ truncated: true });
  });
});
