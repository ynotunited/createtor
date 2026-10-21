import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import {
  assertProjectInWorkspace,
  assertRowInWorkspace,
  assertScenesAccessible,
  assertWorkspaceMember,
} from "@/lib/ownership";

const PROJECT_ID = "831665df-2a7f-46af-a4f9-2c6bf3953dbd";
const WORKSPACE_ID = "11111111-2222-4333-8444-555555555555";
const SCENE_A = "aaaaaaaa-1111-4222-8333-444444444444";
const SCENE_B = "bbbbbbbb-1111-4222-8333-444444444444";

function fakeProjectClient(
  result: { id: string } | null,
  error: { message: string } | null = null,
) {
  const filters: Array<[string, string]> = [];
  const chain = {
    eq: (col: string, val: string) => {
      filters.push([col, val]);
      return chain;
    },
    maybeSingle: async () => ({ data: result, error }),
  };
  const client = { from: () => ({ select: () => chain }) };
  return { client: client as unknown as SupabaseClient<Database>, filters };
}

function fakeScenesClient(rows: Array<{ id: string }>, error: { message: string } | null = null) {
  const captured: { ids?: string[] } = {};
  const chain = {
    in: (_col: string, ids: string[]) => {
      captured.ids = ids;
      return Promise.resolve({ data: rows, error });
    },
  };
  const client = { from: () => ({ select: () => chain }) };
  return { client: client as unknown as SupabaseClient<Database>, captured };
}

describe("assertProjectInWorkspace", () => {
  it("resolves when the project belongs to the workspace and scopes the query by both keys", async () => {
    const { client, filters } = fakeProjectClient({ id: PROJECT_ID });

    await expect(
      assertProjectInWorkspace(client, PROJECT_ID, WORKSPACE_ID),
    ).resolves.toBeUndefined();

    // The query must be narrowed by the claimed workspace, not just the id —
    // otherwise a member of workspace A could target a project in workspace B.
    expect(filters).toEqual([
      ["id", PROJECT_ID],
      ["workspace_id", WORKSPACE_ID],
    ]);
  });

  it("throws a generic error when the project is not in the workspace", async () => {
    const { client } = fakeProjectClient(null);

    await expect(assertProjectInWorkspace(client, PROJECT_ID, WORKSPACE_ID)).rejects.toThrow(
      "Project not found in this workspace.",
    );
  });

  it("propagates a database error rather than treating it as a denial", async () => {
    const { client } = fakeProjectClient(null, { message: "connection reset" });

    await expect(assertProjectInWorkspace(client, PROJECT_ID, WORKSPACE_ID)).rejects.toThrow(
      "connection reset",
    );
  });
});

function fakeRowClient(result: { id: string } | null, error: { message: string } | null = null) {
  const captured: { table?: string; filters: Array<[string, string]> } = { filters: [] };
  const chain = {
    eq: (col: string, val: string) => {
      captured.filters.push([col, val]);
      return chain;
    },
    maybeSingle: async () => ({ data: result, error }),
  };
  const client = {
    from: (table: string) => {
      captured.table = table;
      return { select: () => chain };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, captured };
}

describe("assertRowInWorkspace", () => {
  it("scopes the read to the row id and the claimed workspace", async () => {
    const { client, captured } = fakeRowClient({ id: PROJECT_ID });

    await expect(
      assertRowInWorkspace(client, "characters", PROJECT_ID, WORKSPACE_ID, "Character"),
    ).resolves.toBeUndefined();

    expect(captured.table).toBe("characters");
    expect(captured.filters).toEqual([
      ["id", PROJECT_ID],
      ["workspace_id", WORKSPACE_ID],
    ]);
  });

  it("throws a labelled, non-enumerating error when out of scope", async () => {
    const { client } = fakeRowClient(null);

    await expect(
      assertRowInWorkspace(client, "scripts", PROJECT_ID, WORKSPACE_ID, "Script"),
    ).rejects.toThrow("Script not found in this workspace.");
  });

  it("propagates a database error rather than treating it as a denial", async () => {
    const { client } = fakeRowClient(null, { message: "connection reset" });

    await expect(
      assertRowInWorkspace(client, "voices", PROJECT_ID, WORKSPACE_ID, "Voice"),
    ).rejects.toThrow("connection reset");
  });
});

function fakeMembershipClient(
  workspace: { owner_id: string } | null,
  member: { id: string } | null,
) {
  const chain = (result: unknown) => ({
    eq: () => chain(result),
    maybeSingle: async () => ({ data: result, error: null }),
  });
  const client = {
    from: (table: string) => ({
      select: () => chain(table === "workspaces" ? workspace : member),
    }),
  };
  return { client: client as unknown as SupabaseClient<Database> };
}

describe("assertWorkspaceMember", () => {
  const USER = "99999999-2222-4333-8444-555555555555";

  it("resolves when the caller owns the workspace", async () => {
    const { client } = fakeMembershipClient({ owner_id: USER }, null);
    await expect(assertWorkspaceMember(client, USER, WORKSPACE_ID)).resolves.toBeUndefined();
  });

  it("resolves when the caller is an explicit member", async () => {
    const { client } = fakeMembershipClient({ owner_id: "someone-else" }, { id: "m1" });
    await expect(assertWorkspaceMember(client, USER, WORKSPACE_ID)).resolves.toBeUndefined();
  });

  it("rejects when the caller is neither owner nor member", async () => {
    const { client } = fakeMembershipClient({ owner_id: "someone-else" }, null);
    await expect(assertWorkspaceMember(client, USER, WORKSPACE_ID)).rejects.toThrow(
      "You do not have access to this workspace.",
    );
  });

  it("rejects when the workspace is not visible to the caller", async () => {
    const { client } = fakeMembershipClient(null, null);
    await expect(assertWorkspaceMember(client, USER, WORKSPACE_ID)).rejects.toThrow(
      "You do not have access to this workspace.",
    );
  });
});

describe("assertScenesAccessible", () => {
  it("resolves when every requested scene is reachable", async () => {
    const { client, captured } = fakeScenesClient([{ id: SCENE_A }, { id: SCENE_B }]);

    await expect(assertScenesAccessible(client, [SCENE_A, SCENE_B])).resolves.toBeUndefined();
    expect(captured.ids).toEqual([SCENE_A, SCENE_B]);
  });

  it("rejects when any requested scene is out of scope (RLS returned fewer rows)", async () => {
    const { client } = fakeScenesClient([{ id: SCENE_A }]);

    await expect(assertScenesAccessible(client, [SCENE_A, SCENE_B])).rejects.toThrow(
      "Scene not found.",
    );
  });

  it("rejects an empty id list without querying", async () => {
    const { client, captured } = fakeScenesClient([]);

    await expect(assertScenesAccessible(client, [])).rejects.toThrow("No scenes specified.");
    expect(captured.ids).toBeUndefined();
  });

  it("propagates a database error", async () => {
    const { client } = fakeScenesClient([], { message: "permission denied" });

    await expect(assertScenesAccessible(client, [SCENE_A])).rejects.toThrow("permission denied");
  });
});
