import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * IDOR / ownership regression tests for the shared workspace membership check.
 * Every billing + payment server function gates on this helper, so an outsider
 * (authenticated user who is neither owner nor member) must always be denied.
 */

const state = vi.hoisted(() => ({
  workspace: null as { owner_id: string } | null,
  member: null as { id: string } | null,
}));

vi.mock("@/integrations/supabase/client.server", () => {
  type Chain = {
    eq: () => Chain;
    maybeSingle: () => Promise<{ data: unknown; error: null }>;
  };

  function builder(table: string) {
    const chain: Chain = {
      eq: () => chain,
      maybeSingle: async () => ({
        data: table === "workspaces" ? state.workspace : state.member,
        error: null,
      }),
    };
    return { select: () => chain };
  }

  return {
    supabaseAdmin: {
      from: (table: string) => builder(table),
    },
  };
});

import { isWorkspaceMember } from "@/lib/billing.server";

beforeEach(() => {
  state.workspace = null;
  state.member = null;
});

describe("isWorkspaceMember (ownership enforcement)", () => {
  it("allows the workspace owner", async () => {
    state.workspace = { owner_id: "user-1" };
    await expect(isWorkspaceMember("user-1", "ws-1")).resolves.toBe(true);
  });

  it("allows an explicit workspace member", async () => {
    state.workspace = { owner_id: "someone-else" };
    state.member = { id: "member-row" };
    await expect(isWorkspaceMember("user-1", "ws-1")).resolves.toBe(true);
  });

  it("denies an authenticated outsider", async () => {
    state.workspace = { owner_id: "someone-else" };
    state.member = null;
    await expect(isWorkspaceMember("user-1", "ws-1")).resolves.toBe(false);
  });

  it("denies when the workspace does not exist", async () => {
    state.workspace = null;
    state.member = null;
    await expect(isWorkspaceMember("user-1", "missing-ws")).resolves.toBe(false);
  });
});
