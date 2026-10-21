import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import { ensureMonthlyFreeCredits } from "@/lib/credits.server";
import { FREE_PLAN_MONTHLY_CREDITS } from "@/lib/pricing";

const WORKSPACE_ID = "11111111-2222-3333-4444-555555555555";

function clientWith(error: { code?: string; message: string } | null) {
  const rpc = vi.fn().mockResolvedValue({ data: null, error });
  return { supabase: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ensureMonthlyFreeCredits", () => {
  it("claims the free monthly allotment for the workspace", async () => {
    const { supabase, rpc } = clientWith(null);
    await ensureMonthlyFreeCredits(supabase, WORKSPACE_ID);

    expect(rpc).toHaveBeenCalledWith("claim_free_monthly_credits", {
      _workspace_id: WORKSPACE_ID,
      _credits: FREE_PLAN_MONTHLY_CREDITS,
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("stays silent when the RPC is missing (migration not applied)", async () => {
    for (const code of ["PGRST202", "42883"]) {
      const { supabase } = clientWith({ code, message: "function not found" });
      await expect(ensureMonthlyFreeCredits(supabase, WORKSPACE_ID)).resolves.toBeUndefined();
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs but never throws on unexpected errors", async () => {
    const { supabase } = clientWith({ code: "57014", message: "timeout" });
    await expect(ensureMonthlyFreeCredits(supabase, WORKSPACE_ID)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("never throws when the RPC rejects", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network down"));
    const supabase = { rpc } as unknown as SupabaseClient<Database>;
    await expect(ensureMonthlyFreeCredits(supabase, WORKSPACE_ID)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
