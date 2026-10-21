import { describe, expect, it } from "vitest";

import { parsePaypalCustomId } from "@/lib/paypal-custom-id";

const WS = "831665df-2a7f-46af-a4f9-2c6bf3953dbd";

describe("parsePaypalCustomId", () => {
  it("parses a valid monthly custom id", () => {
    expect(parsePaypalCustomId(`${WS}:creator:monthly`)).toEqual({
      workspaceId: WS,
      planKey: "creator",
      cycle: "monthly",
    });
  });

  it("parses a valid yearly custom id", () => {
    expect(parsePaypalCustomId(`${WS}:agency:yearly`)).toEqual({
      workspaceId: WS,
      planKey: "agency",
      cycle: "yearly",
    });
  });

  it("rejects the free plan (never sold via checkout)", () => {
    expect(parsePaypalCustomId(`${WS}:free:monthly`)).toBeNull();
  });

  it("rejects an unknown plan key", () => {
    expect(parsePaypalCustomId(`${WS}:enterprise:monthly`)).toBeNull();
  });

  it("rejects an unknown billing cycle", () => {
    expect(parsePaypalCustomId(`${WS}:creator:weekly`)).toBeNull();
  });

  it("rejects a workspace id that is not a UUID", () => {
    expect(parsePaypalCustomId(`not-a-uuid:creator:monthly`)).toBeNull();
    expect(parsePaypalCustomId(`:creator:monthly`)).toBeNull();
  });

  it("rejects missing or extra segments", () => {
    expect(parsePaypalCustomId(`${WS}:creator`)).toBeNull();
    expect(parsePaypalCustomId(`${WS}:creator:monthly:extra`)).toBeNull();
    expect(parsePaypalCustomId("")).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(parsePaypalCustomId(null)).toBeNull();
    expect(parsePaypalCustomId(undefined)).toBeNull();
    expect(parsePaypalCustomId(42)).toBeNull();
  });
});
