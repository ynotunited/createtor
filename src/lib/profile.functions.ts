/**
 * Persists the signed-in user's IANA time zone. Called at signup, on settings
 * save, and once when an existing account first reports a zone. The value is
 * validated against the runtime's IANA database so a bogus string never reaches
 * the scheduler, and the update is scoped to the caller's own profile by RLS.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidTimeZone } from "@/lib/schedule";

const timezoneInput = z.object({
  timezone: z.string().min(1).max(64),
});

const profileInput = z.object({
  fullName: z.string().trim().min(1).max(120),
  timezone: z.string().min(1).max(64),
});

/**
 * Updates the signed-in user's own profile (name + time zone) through the
 * user-scoped client, so RLS confines the write to their row and the column
 * grants from migrations 0009/0023 allow exactly these fields. The previous
 * UI wrote straight to `profiles` with no validator; this keeps the same UX
 * while making the server the place the values are validated.
 */
export const updateOwnProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => profileInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as {
      userId: string;
      supabase: {
        from: (table: string) => {
          update: (values: Record<string, unknown>) => {
            eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    };

    const timezone = isValidTimeZone(data.timezone) ? data.timezone : "UTC";

    const { error } = await ctx.supabase
      .from("profiles")
      .update({ full_name: data.fullName, timezone })
      .eq("id", ctx.userId);
    if (error) throw new Error("Could not save your profile.");

    return { ok: true, fullName: data.fullName, timezone };
  });

export const setUserTimezone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => timezoneInput.parse(input))
  .handler(async ({ data, context }) => {
    const ctx = context as unknown as {
      userId: string;
      supabase: {
        from: (table: string) => {
          update: (values: Record<string, unknown>) => {
            eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
    };

    if (!isValidTimeZone(data.timezone)) {
      throw new Error("That time zone is not recognised.");
    }

    const { error } = await ctx.supabase
      .from("profiles")
      .update({ timezone: data.timezone })
      .eq("id", ctx.userId);
    if (error) throw new Error("Could not save your time zone.");

    return { ok: true, timezone: data.timezone };
  });
