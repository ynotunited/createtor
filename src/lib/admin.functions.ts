import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { resolveAdminPath } from "@/lib/admin-path.server";
import {
  requireAdmin,
  requireSuperAdmin,
  userIsAdmin,
  userIsSuperAdmin,
} from "@/lib/admin-middleware";
import {
  loadAiConfigView,
  loadPaymentConfigView,
  loadPlanPricing,
  loadPlatformView,
} from "@/lib/platform-config.server";
import { clientIpFromHeaders } from "@/lib/logger.server";
import { PLANS } from "@/lib/pricing";
import { enforceAdminRateLimit } from "@/lib/rate-limit.server";
import { sanitizePostgrestOrTerm } from "@/lib/sanitize";
import { assertSafeUpstreamBaseUrl } from "@/lib/ssrf-guard";

/** Lazily load the service-role client so route bundles never import it eagerly. */
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** The public-facing first path segment of the admin console. */
function adminPath(): string {
  return resolveAdminPath() || "admin";
}

/** Best-effort caller IP for rate-limit keys and audit rows. */
function callerIp(): string | null {
  try {
    const request = getRequest();
    return request ? clientIpFromHeaders(request.headers) : null;
  } catch {
    return null;
  }
}

/** Best-effort caller user agent for audit rows. */
function callerUserAgent(): string | null {
  try {
    return getRequest()?.headers.get("user-agent") ?? null;
  } catch {
    return null;
  }
}

function serviceKeyPresent(): boolean {
  return Boolean(process.env["SUPABASE_SERVICE_ROLE_KEY"]);
}

function requireServiceKey(): void {
  if (!serviceKeyPresent()) {
    throw new Error(
      "Admin data access needs the SUPABASE_SERVICE_ROLE_KEY environment variable. Add your Supabase service role key and try again.",
    );
  }
}

async function writeAudit(entry: {
  userId: string;
  action: string;
  entity?: string | null;
  entityId?: string | null;
  workspaceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { auditEvent } = await import("@/lib/audit.server");
  // Every admin action records who (actorId + user agent) and from where (IP),
  // alongside the server-assigned timestamp on the audit_logs row.
  await auditEvent({
    actorId: entry.userId,
    action: entry.action,
    entity: entry.entity ?? null,
    entityId: entry.entityId ?? null,
    workspaceId: entry.workspaceId ?? null,
    ip: callerIp(),
    userAgent: callerUserAgent(),
    ...(entry.metadata ? { metadata: entry.metadata } : {}),
  });
}

/* ------------------------------------------------------------------ */
/* Access / bootstrap                                                   */
/* ------------------------------------------------------------------ */

export const adminMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as {
      userId: string;
      supabase: never;
      claims?: Record<string, unknown>;
    };
    const isAdmin = await userIsAdmin(ctx);
    const isSuperAdmin = await userIsSuperAdmin(ctx);

    // Bootstrap availability is only disclosed to a caller whose email is on the
    // ADMIN_EMAILS allowlist, so the "claim super admin" screen never appears to
    // (or informs) an arbitrary signed-in user.
    const allowlist = (process.env["ADMIN_EMAILS"] ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    const email =
      typeof ctx.claims?.["email"] === "string" ? ctx.claims["email"].toLowerCase() : "";
    const allowlisted = allowlist.length > 0 && Boolean(email) && allowlist.includes(email);

    let adminCount = 0;
    if (serviceKeyPresent()) {
      try {
        const client = await admin();
        const { count } = await client
          .from("user_roles")
          .select("*", { count: "exact", head: true })
          .in("role", ["admin", "super_admin"]);
        adminCount = count ?? 0;
      } catch {
        adminCount = 0;
      }
    }
    return {
      isAdmin,
      isSuperAdmin,
      userId: ctx.userId,
      email: typeof ctx.claims?.["email"] === "string" ? ctx.claims["email"] : null,
      // Server capabilities and the secret console path are only disclosed to
      // actual admins — a non-admin never learns where the console lives.
      ...(isAdmin ? { hasServiceKey: serviceKeyPresent(), adminPath: adminPath() } : {}),
      needsBootstrap: !isAdmin && adminCount === 0 && allowlisted,
    };
  });

/**
 * Where the signed-in user should land after authenticating. Admins belong in
 * the control panel; everyone else in the creator app. Server-authoritative, so
 * the client never has to guess a role or bounce through the wrong route.
 */
export const getLandingPath = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as {
      userId: string;
      supabase: never;
      claims?: Record<string, unknown>;
    };
    const isAdmin = await userIsAdmin(ctx);
    return { path: isAdmin ? `/${adminPath()}` : "/dashboard", isAdmin };
  });

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    requireServiceKey();
    const ctx = context as unknown as {
      userId: string;
      supabase: never;
      claims?: Record<string, unknown>;
    };

    // Fail-closed per-IP limit on the privilege-escalation path so bootstrap
    // cannot be brute-forced even before the allowlist check.
    await enforceAdminRateLimit("adminClaim", callerIp() ?? "unknown");

    // Bootstrap is fail-closed: without an explicit ADMIN_EMAILS allowlist a
    // fresh deployment must not hand super admin to whoever signs in first.
    const allowlist = (process.env["ADMIN_EMAILS"] ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (allowlist.length === 0) {
      throw new Error(
        "Administrator bootstrap is disabled. Set the ADMIN_EMAILS environment variable to the email(s) allowed to claim admin access.",
      );
    }
    const email =
      typeof ctx.claims?.["email"] === "string" ? ctx.claims["email"].toLowerCase() : "";
    if (!email || !allowlist.includes(email)) {
      throw new Error("Forbidden: this email is not authorized to claim administrator access.");
    }

    const client = await admin();
    // Atomic: the database checks for an existing admin and inserts in one
    // serialized statement, so two concurrent claims cannot both succeed.
    const { data: granted, error } = await client.rpc("claim_first_admin", {
      _user_id: ctx.userId,
    });
    if (error) throw new Error(error.message);
    if (!granted) throw new Error("An administrator already exists.");
    await writeAudit({
      userId: ctx.userId,
      action: "claim_admin",
      entity: "user_roles",
      entityId: ctx.userId,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Admin's own profile                                                  */
/* ------------------------------------------------------------------ */

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    requireServiceKey();
    const ctx = context as unknown as {
      userId: string;
      claims?: Record<string, unknown>;
    };
    const client = await admin();
    const { data: profile } = await client
      .from("profiles")
      .select("id, email, full_name, created_at")
      .eq("id", ctx.userId)
      .maybeSingle();
    const { data: roles } = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", ctx.userId);
    const roleList = (roles ?? []).map((r) => r.role);
    return {
      id: ctx.userId,
      email:
        profile?.email ?? (typeof ctx.claims?.["email"] === "string" ? ctx.claims["email"] : null),
      fullName: profile?.full_name ?? null,
      createdAt: profile?.created_at ?? null,
      isSuperAdmin: roleList.includes("super_admin"),
      isAdmin: roleList.includes("admin") || roleList.includes("super_admin"),
    };
  });

export const updateOwnProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ fullName: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    requireServiceKey();
    const ctx = context as unknown as { userId: string };
    const client = await admin();
    const { error } = await client
      .from("profiles")
      .update({ full_name: data.fullName })
      .eq("id", ctx.userId);
    if (error) throw new Error(error.message);
    await writeAudit({
      userId: ctx.userId,
      action: "update_profile",
      entity: "profiles",
      entityId: ctx.userId,
    });
    return { ok: true };
  });

export const changePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ password: z.string().min(8).max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    requireServiceKey();
    const ctx = context as unknown as {
      userId: string;
      supabase: never;
      claims?: Record<string, unknown>;
    };
    if (!(await userIsAdmin(ctx))) {
      throw new Error("Forbidden: administrator access is required.");
    }
    await enforceAdminRateLimit("adminAction", ctx.userId);
    const client = await admin();
    const { error } = await client.auth.admin.updateUserById(ctx.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await writeAudit({
      userId: ctx.userId,
      action: "change_password",
      entity: "auth.users",
      entityId: ctx.userId,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Overview                                                             */
/* ------------------------------------------------------------------ */

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .handler(async () => {
    requireServiceKey();
    const client = await admin();
    const count = async (
      table:
        "profiles" | "workspaces" | "projects" | "video_jobs" | "published_posts" | "usage_credits",
    ) => {
      const { count: n } = await client.from(table).select("*", { count: "exact", head: true });
      return n ?? 0;
    };
    const [users, workspaces, projects, jobs, published] = await Promise.all([
      count("profiles"),
      count("workspaces"),
      count("projects"),
      count("video_jobs"),
      count("published_posts"),
    ]);

    const { data: creditRows } = await client
      .from("usage_credits")
      .select("balance, lifetime_consumed, reserved");
    const totals = (creditRows ?? []).reduce(
      (acc, row) => {
        acc.balance += row.balance ?? 0;
        acc.consumed += row.lifetime_consumed ?? 0;
        acc.reserved += row.reserved ?? 0;
        return acc;
      },
      { balance: 0, consumed: 0, reserved: 0 },
    );

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: newUsers } = await client
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since);

    return {
      users,
      workspaces,
      projects,
      jobs,
      published,
      credits: totals,
      newUsers: newUsers ?? 0,
    };
  });

/* ------------------------------------------------------------------ */
/* Users + roles                                                        */
/* ------------------------------------------------------------------ */

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    requireServiceKey();
    const client = await admin();
    let query = client
      .from("profiles")
      .select("id, email, full_name, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.search) {
      // The term is interpolated into PostgREST's `or=(...)` grammar, so strip
      // characters that could inject extra filter conditions.
      const term = sanitizePostgrestOrTerm(data.search);
      if (term) {
        const pattern = `%${term}%`;
        query = query.or(`email.ilike.${pattern},full_name.ilike.${pattern}`);
      }
    }
    const { data: profiles, error } = await query;
    if (error) throw new Error(error.message);

    const ids = (profiles ?? []).map((p) => p.id);
    const [{ data: roles }, { data: members }] = await Promise.all([
      client
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
      client
        .from("workspace_members")
        .select("user_id, workspace_id")
        .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const roleMap = new Map<string, string[]>();
    for (const r of roles ?? [])
      roleMap.set(r.user_id, [...(roleMap.get(r.user_id) ?? []), r.role]);
    const wsCount = new Map<string, number>();
    for (const m of members ?? []) wsCount.set(m.user_id, (wsCount.get(m.user_id) ?? 0) + 1);

    return (profiles ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      fullName: p.full_name,
      createdAt: p.created_at,
      roles: roleMap.get(p.id) ?? [],
      workspaces: wsCount.get(p.id) ?? 0,
    }));
  });

export const setUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireSuperAdmin])
  .validator((input: unknown) =>
    z.object({ userId: z.string().uuid(), makeAdmin: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    requireServiceKey();
    const ctx = context as unknown as { userId: string };
    const client = await admin();
    if (data.userId === ctx.userId) throw new Error("You cannot change your own admin access.");

    const { data: targetRoles } = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if ((targetRoles ?? []).some((r) => r.role === "super_admin")) {
      throw new Error("A super administrator's access cannot be changed here.");
    }

    if (data.makeAdmin) {
      const { error } = await client
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await client
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    await writeAudit({
      userId: ctx.userId,
      action: data.makeAdmin ? "grant_admin" : "revoke_admin",
      entity: "user_roles",
      entityId: data.userId,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Workspaces                                                           */
/* ------------------------------------------------------------------ */

export const listWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        search: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    requireServiceKey();
    const client = await admin();
    let query = client
      .from("workspaces")
      .select("id, name, owner_id, plan, white_label, suspended, suspension_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.search) query = query.ilike("name", `%${data.search}%`);
    const { data: workspaces, error } = await query;
    if (error) throw new Error(error.message);

    const ownerIds = [...new Set((workspaces ?? []).map((w) => w.owner_id))];
    const wsIds = (workspaces ?? []).map((w) => w.id);
    const safeOwners = ownerIds.length ? ownerIds : ["00000000-0000-0000-0000-000000000000"];
    const safeWs = wsIds.length ? wsIds : ["00000000-0000-0000-0000-000000000000"];

    const [{ data: owners }, { data: credits }, { data: projectRows }] = await Promise.all([
      client.from("profiles").select("id, email, full_name").in("id", safeOwners),
      client
        .from("usage_credits")
        .select("workspace_id, balance, lifetime_consumed")
        .in("workspace_id", safeWs),
      client.from("projects").select("workspace_id").in("workspace_id", safeWs),
    ]);
    const ownerMap = new Map((owners ?? []).map((o) => [o.id, o]));
    const creditMap = new Map((credits ?? []).map((c) => [c.workspace_id, c]));
    const projectCount = new Map<string, number>();
    for (const p of projectRows ?? [])
      projectCount.set(p.workspace_id, (projectCount.get(p.workspace_id) ?? 0) + 1);

    return (workspaces ?? []).map((w) => ({
      id: w.id,
      name: w.name,
      plan: w.plan,
      whiteLabel: w.white_label,
      suspended: w.suspended,
      suspensionReason: w.suspension_reason,
      createdAt: w.created_at,
      ownerEmail: ownerMap.get(w.owner_id)?.email ?? null,
      ownerName: ownerMap.get(w.owner_id)?.full_name ?? null,
      balance: creditMap.get(w.id)?.balance ?? 0,
      consumed: creditMap.get(w.id)?.lifetime_consumed ?? 0,
      projects: projectCount.get(w.id) ?? 0,
    }));
  });

export const updateWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        plan: z.enum(["free", "creator", "pro", "agency"]).optional(),
        whiteLabel: z.boolean().optional(),
        suspended: z.boolean().optional(),
        suspensionReason: z.string().max(300).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    requireServiceKey();
    const ctx = context as unknown as { userId: string };
    const client = await admin();
    const patch: Database["public"]["Tables"]["workspaces"]["Update"] = {};
    if (data.plan !== undefined) patch.plan = data.plan;
    if (data.whiteLabel !== undefined) patch.white_label = data.whiteLabel;
    if (data.suspended !== undefined) patch.suspended = data.suspended;
    if (data.suspensionReason !== undefined) patch.suspension_reason = data.suspensionReason;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await client.from("workspaces").update(patch).eq("id", data.workspaceId);
    if (error) throw new Error(error.message);
    await writeAudit({
      userId: ctx.userId,
      action: "update_workspace",
      entity: "workspaces",
      entityId: data.workspaceId,
      workspaceId: data.workspaceId,
      metadata: patch,
    });
    return { ok: true };
  });

export const adminGrantCredits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid(),
        amount: z.number().int().min(-1_000_000).max(1_000_000),
        reason: z.string().max(200).default("Admin adjustment"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    requireServiceKey();
    const ctx = context as unknown as { userId: string };
    const client = await admin();
    const { data: current, error: readError } = await client
      .from("usage_credits")
      .select("balance, lifetime_purchased")
      .eq("workspace_id", data.workspaceId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    const balance = Math.max(0, (current?.balance ?? 0) + data.amount);
    const purchased =
      data.amount > 0
        ? (current?.lifetime_purchased ?? 0) + data.amount
        : (current?.lifetime_purchased ?? 0);

    if (current) {
      const { error } = await client
        .from("usage_credits")
        .update({ balance, lifetime_purchased: purchased })
        .eq("workspace_id", data.workspaceId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await client
        .from("usage_credits")
        .insert({ workspace_id: data.workspaceId, balance, lifetime_purchased: purchased });
      if (error) throw new Error(error.message);
    }

    await client.from("credit_transactions").insert({
      workspace_id: data.workspaceId,
      amount: data.amount,
      kind: data.amount >= 0 ? "grant" : "consume",
      reason: data.reason,
    });
    await writeAudit({
      userId: ctx.userId,
      action: "adjust_credits",
      entity: "usage_credits",
      entityId: data.workspaceId,
      workspaceId: data.workspaceId,
      metadata: { amount: data.amount, reason: data.reason, balance },
    });
    return { ok: true, balance };
  });

export const listCreditTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        workspaceId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).default(50),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    requireServiceKey();
    const client = await admin();
    let query = client
      .from("credit_transactions")
      .select("id, workspace_id, amount, kind, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.workspaceId) query = query.eq("workspace_id", data.workspaceId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ------------------------------------------------------------------ */
/* Audit logs                                                           */
/* ------------------------------------------------------------------ */

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z.object({ limit: z.number().int().min(1).max(200).default(100) }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    requireServiceKey();
    const client = await admin();
    const { data: logs, error } = await client
      .from("audit_logs")
      .select("id, user_id, action, entity, entity_id, workspace_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return logs ?? [];
  });

/* ------------------------------------------------------------------ */
/* Security events                                                      */
/* ------------------------------------------------------------------ */

export const listSecurityEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).default(100),
        kind: z.string().trim().min(1).max(64).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    requireServiceKey();
    const client = await admin();
    let query = client
      .from("security_events")
      .select("id, kind, ip, user_id, workspace_id, path, user_agent, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.kind) query = query.eq("kind", data.kind);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ------------------------------------------------------------------ */
/* Settings: AI providers + platform                                   */
/* ------------------------------------------------------------------ */

export const getAdminSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .handler(async () => {
    requireServiceKey();
    const [ai, platform, payments] = await Promise.all([
      loadAiConfigView(),
      loadPlatformView(),
      loadPaymentConfigView(),
    ]);
    return { ai, platform, payments };
  });

export const updateAiProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        id: z.enum(["google", "groq", "pollinations"]),
        enabled: z.boolean().optional(),
        model: z.string().max(200).optional(),
        baseUrl: z.string().url().max(400).optional(),
        apiKey: z.string().max(400).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    requireServiceKey();
    const ctx = context as unknown as { userId: string };
    const client = await admin();

    // A stored base URL is fetched server-side with the provider API key, so it
    // must not be able to point at an internal host (SSRF).
    const safeBaseUrl =
      data.baseUrl !== undefined ? assertSafeUpstreamBaseUrl(data.baseUrl).toString() : undefined;

    const { data: existing } = await client
      .from("system_settings")
      .select("value")
      .eq("key", `ai.${data.id}`)
      .maybeSingle();
    const current = (
      existing?.value && typeof existing.value === "object" ? existing.value : {}
    ) as Record<string, unknown>;
    const next = {
      ...current,
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.model !== undefined ? { model: data.model } : {}),
      ...(safeBaseUrl !== undefined ? { baseUrl: safeBaseUrl } : {}),
    };
    let error = (
      await client
        .from("system_settings")
        .upsert({ key: `ai.${data.id}`, value: next, is_secret: false })
    ).error;
    if (error) throw new Error(error.message);

    if (data.apiKey !== undefined && data.apiKey.trim().length > 0) {
      error = (
        await client
          .from("system_settings")
          .upsert({ key: `ai.${data.id}.key`, value: { key: data.apiKey.trim() }, is_secret: true })
      ).error;
      if (error) throw new Error(error.message);
    }

    await writeAudit({
      userId: ctx.userId,
      action: "update_ai_provider",
      entity: "system_settings",
      entityId: data.id,
      metadata: { enabled: data.enabled, model: data.model, rotatedKey: Boolean(data.apiKey) },
    });
    return { ok: true };
  });

export const updatePaymentGateway = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        id: z.enum(["stripe", "paypal"]),
        enabled: z.boolean().optional(),
        mode: z.enum(["live", "test", "sandbox"]).optional(),
        secretKey: z.string().max(400).optional(),
        publishableKey: z.string().max(400).optional(),
        webhookSecret: z.string().max(400).optional(),
        clientId: z.string().max(400).optional(),
        clientSecret: z.string().max(400).optional(),
        webhookId: z.string().max(400).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    requireServiceKey();
    const ctx = context as unknown as { userId: string };
    const client = await admin();

    const configKey = `payments.${data.id}`;
    const secretKeyName = `payments.${data.id}.key`;

    const { data: existingCfg } = await client
      .from("system_settings")
      .select("value")
      .eq("key", configKey)
      .maybeSingle();
    const currentCfg = (
      existingCfg?.value && typeof existingCfg.value === "object" ? existingCfg.value : {}
    ) as Record<string, unknown>;
    const nextCfg = {
      ...currentCfg,
      ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      ...(data.mode !== undefined ? { mode: data.mode } : {}),
    };
    const cfgError = (
      await client
        .from("system_settings")
        .upsert({ key: configKey, value: nextCfg, is_secret: false })
    ).error;
    if (cfgError) throw new Error(cfgError.message);

    const { data: existingSecret } = await client
      .from("system_settings")
      .select("value")
      .eq("key", secretKeyName)
      .maybeSingle();
    const currentSecret = (
      existingSecret?.value && typeof existingSecret.value === "object" ? existingSecret.value : {}
    ) as Record<string, unknown>;

    const trimmed = (value: string | undefined): string | undefined => {
      const v = value?.trim();
      return v && v.length > 0 ? v : undefined;
    };
    const merged: Record<string, unknown> = { ...currentSecret };
    if (data.id === "stripe") {
      if (trimmed(data.secretKey)) merged["secretKey"] = trimmed(data.secretKey);
      if (trimmed(data.publishableKey)) merged["publishableKey"] = trimmed(data.publishableKey);
      if (trimmed(data.webhookSecret)) merged["webhookSecret"] = trimmed(data.webhookSecret);
    } else {
      if (trimmed(data.clientId)) merged["clientId"] = trimmed(data.clientId);
      if (trimmed(data.clientSecret)) merged["clientSecret"] = trimmed(data.clientSecret);
      if (trimmed(data.webhookId)) merged["webhookId"] = trimmed(data.webhookId);
    }

    if (Object.keys(merged).length > 0) {
      const keyError = (
        await client.from("system_settings").upsert({
          key: secretKeyName,
          value: merged as Database["public"]["Tables"]["system_settings"]["Row"]["value"],
          is_secret: true,
        })
      ).error;
      if (keyError) throw new Error(keyError.message);
    }

    await writeAudit({
      userId: ctx.userId,
      action: "update_payment_gateway",
      entity: "system_settings",
      entityId: data.id,
      metadata: {
        enabled: data.enabled,
        mode: data.mode,
        rotatedSecret: Boolean(trimmed(data.secretKey) ?? trimmed(data.clientSecret)),
      },
    });
    return { ok: true };
  });

export const updatePlatformSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        signups_open: z.boolean().optional(),
        maintenance_mode: z.boolean().optional(),
        free_credits_monthly: z.number().int().min(0).max(1_000_000).optional(),
        announcement: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    requireServiceKey();
    const ctx = context as unknown as { userId: string };
    const client = await admin();
    const { data: existing } = await client
      .from("system_settings")
      .select("value")
      .eq("key", "platform")
      .maybeSingle();
    const current = (
      existing?.value && typeof existing.value === "object" ? existing.value : {}
    ) as Record<string, unknown>;
    const next = { ...current, ...data };
    const { error } = await client
      .from("system_settings")
      .upsert({ key: "platform", value: next, is_secret: false });
    if (error) throw new Error(error.message);
    await writeAudit({
      userId: ctx.userId,
      action: "update_platform_settings",
      entity: "system_settings",
      entityId: "platform",
      metadata: data,
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Plan pricing                                                         */
/* ------------------------------------------------------------------ */

export const getPricingConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .handler(async () => {
    requireServiceKey();
    return loadPlanPricing();
  });

export const updatePlanPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        planKey: z.enum(["free", "creator", "pro", "agency"]),
        cycle: z.enum(["monthly", "yearly"]),
        amountCents: z.number().int().min(0).max(10_000_000),
        stripePriceId: z.string().trim().max(200).optional(),
        // A PayPal plan id is provisioned by the app; it is not admin-editable.
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    requireServiceKey();
    const ctx = context as unknown as { userId: string };
    const client = await admin();

    const { data: existing } = await client
      .from("system_settings")
      .select("value")
      .eq("key", "pricing")
      .maybeSingle();
    const current = (
      existing?.value && typeof existing.value === "object" ? existing.value : {}
    ) as Record<string, unknown>;
    const planCfg = {
      ...((current[data.planKey] as Record<string, unknown> | undefined) ?? {}),
    };
    const cycleCfg = {
      ...((planCfg[data.cycle] as Record<string, unknown> | undefined) ?? {}),
    };
    cycleCfg["amountCents"] = data.amountCents;
    if (data.stripePriceId !== undefined) {
      cycleCfg["stripePriceId"] = data.stripePriceId;
    }
    planCfg[data.cycle] = cycleCfg;
    const next = { ...current, [data.planKey]: planCfg };

    const { error } = await client
      .from("system_settings")
      .upsert({ key: "pricing", value: next as never, is_secret: false });
    if (error) throw new Error(error.message);

    await writeAudit({
      userId: ctx.userId,
      action: "update_plan_pricing",
      entity: "system_settings",
      entityId: "pricing",
      metadata: {
        planKey: data.planKey,
        cycle: data.cycle,
        amountCents: data.amountCents,
        stripePriceSet: data.stripePriceId !== undefined,
      },
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Analytics                                                            */
/* ------------------------------------------------------------------ */

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function lastNDays(days: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export const getAdminAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z.object({ days: z.number().int().min(7).max(90).default(30) }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    requireServiceKey();
    const client = await admin();
    const days = lastNDays(data.days);
    const sinceIso = new Date(Date.now() - data.days * 86_400_000).toISOString();

    const [profiles, projects, jobs, published, txs, workspaces, jobStatuses, analytics] =
      await Promise.all([
        client.from("profiles").select("created_at").gte("created_at", sinceIso),
        client.from("projects").select("created_at").gte("created_at", sinceIso),
        client.from("video_jobs").select("created_at, status").gte("created_at", sinceIso),
        client.from("published_posts").select("published_at").gte("published_at", sinceIso),
        client
          .from("credit_transactions")
          .select("amount, kind, created_at")
          .gte("created_at", sinceIso),
        client.from("workspaces").select("plan"),
        client.from("video_jobs").select("status"),
        client.from("analytics").select("views, watch_time_seconds").gte("metric_date", days[0]),
      ]);

    const buckets = new Map(
      days.map((d) => [
        d,
        { date: d, signups: 0, projects: 0, jobs: 0, published: 0, consumed: 0 },
      ]),
    );
    const bump = (iso: string | null, field: "signups" | "projects" | "jobs" | "published") => {
      if (!iso) return;
      const b = buckets.get(dayKey(iso));
      if (b) b[field] += 1;
    };
    for (const r of profiles.data ?? []) bump(r.created_at, "signups");
    for (const r of projects.data ?? []) bump(r.created_at, "projects");
    for (const r of jobs.data ?? []) bump(r.created_at, "jobs");
    for (const r of published.data ?? []) bump(r.published_at, "published");
    for (const tx of txs.data ?? []) {
      if (tx.kind === "consume" || tx.amount < 0) {
        const b = buckets.get(dayKey(tx.created_at));
        if (b) b.consumed += Math.abs(tx.amount ?? 0);
      }
    }

    const planCounts = new Map<string, number>();
    for (const w of workspaces.data ?? [])
      planCounts.set(w.plan, (planCounts.get(w.plan) ?? 0) + 1);

    const statusCounts = new Map<string, number>();
    for (const j of jobStatuses.data ?? [])
      statusCounts.set(j.status, (statusCounts.get(j.status) ?? 0) + 1);

    const totals = (analytics.data ?? []).reduce(
      (acc, a) => {
        acc.views += a.views ?? 0;
        acc.watchTime += a.watch_time_seconds ?? 0;
        return acc;
      },
      { views: 0, watchTime: 0 },
    );

    return {
      series: [...buckets.values()],
      planDistribution: PLANS.map((p) => ({
        plan: p.name,
        key: p.key,
        count: planCounts.get(p.key) ?? 0,
      })),
      jobStatus: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
      platformViews: totals.views,
      platformWatchTime: totals.watchTime,
    };
  });

/* ------------------------------------------------------------------ */
/* Integrations (social providers + connections)                        */
/* ------------------------------------------------------------------ */

const PLATFORM_LABELS: Record<string, string> = {
  youtube: "YouTube",
  youtube_shorts: "YouTube Shorts",
  tiktok: "TikTok",
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  threads: "Threads",
};

function platformLabel(p: string): string {
  return PLATFORM_LABELS[p] ?? p;
}

export const listIntegrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .handler(async () => {
    requireServiceKey();
    const client = await admin();
    const [{ data: accounts }, { data: workspaces }] = await Promise.all([
      client
        .from("social_accounts")
        .select("id, workspace_id, platform, account_name, status, connected_at, token_expires_at"),
      client.from("workspaces").select("id, name"),
    ]);

    const wsName = new Map((workspaces ?? []).map((w) => [w.id, w.name]));
    const now = Date.now();

    const byPlatform = new Map<
      string,
      {
        platform: string;
        label: string;
        total: number;
        connected: number;
        disconnected: number;
        expiring: number;
      }
    >();
    for (const p of Object.keys(PLATFORM_LABELS)) {
      byPlatform.set(p, {
        platform: p,
        label: platformLabel(p),
        total: 0,
        connected: 0,
        disconnected: 0,
        expiring: 0,
      });
    }
    for (const a of accounts ?? []) {
      let e = byPlatform.get(a.platform);
      if (!e) {
        e = {
          platform: a.platform,
          label: platformLabel(a.platform),
          total: 0,
          connected: 0,
          disconnected: 0,
          expiring: 0,
        };
        byPlatform.set(a.platform, e);
      }
      e.total += 1;
      if (a.status === "connected") e.connected += 1;
      else e.disconnected += 1;
      if (a.token_expires_at && new Date(a.token_expires_at).getTime() < now + 7 * 86_400_000) {
        e.expiring += 1;
      }
    }

    const connections = (accounts ?? [])
      .map((a) => ({
        id: a.id,
        platform: platformLabel(a.platform),
        accountName: a.account_name,
        status: a.status,
        workspaceName: wsName.get(a.workspace_id) ?? "Unknown workspace",
        connectedAt: a.connected_at,
        tokenExpiresAt: a.token_expires_at,
      }))
      .sort((x, y) => (y.connectedAt ?? "").localeCompare(x.connectedAt ?? ""));

    return {
      platforms: [...byPlatform.values()].sort((a, b) => b.total - a.total),
      connections: connections.slice(0, 100),
      totalConnected: connections.filter((c) => c.status === "connected").length,
    };
  });

/* ------------------------------------------------------------------ */
/* Billing & plans                                                      */
/* ------------------------------------------------------------------ */

export const listBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .handler(async () => {
    requireServiceKey();
    const client = await admin();
    const [{ data: subs }, { data: workspaces }] = await Promise.all([
      client
        .from("subscriptions")
        .select(
          "id, workspace_id, plan, status, current_period_end, stripe_subscription_id, provider, provider_subscription_id, billing_cycle, cancel_at_period_end",
        ),
      client.from("workspaces").select("id, name, plan, created_at"),
    ]);

    const wsName = new Map((workspaces ?? []).map((w) => [w.id, w.name]));
    const planCounts = new Map<string, number>();
    for (const w of workspaces ?? []) planCounts.set(w.plan, (planCounts.get(w.plan) ?? 0) + 1);

    const distribution = PLANS.map((p) => ({
      key: p.key,
      name: p.name,
      price: p.monthlyPriceUsd,
      count: planCounts.get(p.key) ?? 0,
    }));

    const mrr = distribution.reduce((sum, d) => sum + d.price * d.count, 0);
    const payingWorkspaces = distribution
      .filter((d) => d.price > 0)
      .reduce((sum, d) => sum + d.count, 0);

    const subscriptions = (subs ?? [])
      .map((s) => ({
        id: s.id,
        workspaceName: wsName.get(s.workspace_id) ?? "Unknown workspace",
        plan: s.plan,
        status: s.status,
        currentPeriodEnd: s.current_period_end,
        provider: s.provider ?? (s.stripe_subscription_id ? "stripe" : null),
        billingCycle: s.billing_cycle,
        cancelAtPeriodEnd: s.cancel_at_period_end,
        linked: Boolean(s.provider_subscription_id || s.stripe_subscription_id),
      }))
      .sort((a, b) => (b.currentPeriodEnd ?? "").localeCompare(a.currentPeriodEnd ?? ""));

    return { distribution, mrr, payingWorkspaces, subscriptions: subscriptions.slice(0, 100) };
  });

/* ------------------------------------------------------------------ */
/* User detail + account actions                                        */
/* ------------------------------------------------------------------ */

export const getUserDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    requireServiceKey();
    const client = await admin();
    const empty = "00000000-0000-0000-0000-000000000000";

    const [{ data: profile }, { data: roles }, { data: owned }, { data: members }] =
      await Promise.all([
        client
          .from("profiles")
          .select("id, email, full_name, created_at")
          .eq("id", data.userId)
          .maybeSingle(),
        client.from("user_roles").select("role").eq("user_id", data.userId),
        client.from("workspaces").select("id, name, plan").eq("owner_id", data.userId),
        client.from("workspace_members").select("workspace_id").eq("user_id", data.userId),
      ]);

    const workspaceIds = [
      ...new Set([
        ...(owned ?? []).map((w) => w.id),
        ...(members ?? []).map((m) => m.workspace_id),
      ]),
    ];
    const inIds = workspaceIds.length ? workspaceIds : [empty];

    const [projects, jobs, published, credits, socials, audit] = await Promise.all([
      client.from("projects").select("*", { count: "exact", head: true }).in("workspace_id", inIds),
      client
        .from("video_jobs")
        .select("*", { count: "exact", head: true })
        .in("workspace_id", inIds),
      client
        .from("published_posts")
        .select("*", { count: "exact", head: true })
        .in("workspace_id", inIds),
      client.from("usage_credits").select("balance, lifetime_consumed").in("workspace_id", inIds),
      client
        .from("social_accounts")
        .select("*", { count: "exact", head: true })
        .in("workspace_id", inIds),
      client
        .from("audit_logs")
        .select("id, action, entity, created_at")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const creditTotals = (credits.data ?? []).reduce(
      (acc, c) => {
        acc.balance += c.balance ?? 0;
        acc.consumed += c.lifetime_consumed ?? 0;
        return acc;
      },
      { balance: 0, consumed: 0 },
    );

    let auth: { email: string | null; banned: boolean; lastSignInAt: string | null } = {
      email: profile?.email ?? null,
      banned: false,
      lastSignInAt: null,
    };
    try {
      const { data: userRes } = await client.auth.admin.getUserById(data.userId);
      const u = userRes?.user as
        | { email?: string | null; banned_until?: string | null; last_sign_in_at?: string | null }
        | undefined;
      if (u) {
        auth = {
          email: u.email ?? auth.email,
          banned: Boolean(u.banned_until && new Date(u.banned_until).getTime() > Date.now()),
          lastSignInAt: u.last_sign_in_at ?? null,
        };
      }
    } catch {
      /* auth lookup best-effort */
    }

    return {
      profile,
      roles: (roles ?? []).map((r) => r.role),
      isAdmin: (roles ?? []).some((r) => r.role === "admin" || r.role === "super_admin"),
      isSuperAdmin: (roles ?? []).some((r) => r.role === "super_admin"),
      workspaces: owned ?? [],
      memberCount: (members ?? []).length,
      workspaceIds,
      counts: {
        projects: projects.count ?? 0,
        jobs: jobs.count ?? 0,
        published: published.count ?? 0,
        socials: socials.count ?? 0,
      },
      credits: creditTotals,
      audit: audit.data ?? [],
      auth,
    };
  });

export const setUserSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z.object({ userId: z.string().uuid(), suspended: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    requireServiceKey();
    const ctx = context as unknown as { userId: string };
    if (data.userId === ctx.userId) throw new Error("You cannot suspend your own account.");
    const client = await admin();
    const { error } = await client.auth.admin.updateUserById(data.userId, {
      ban_duration: data.suspended ? "876000h" : "none",
    });
    if (error) throw new Error(error.message);
    await writeAudit({
      userId: ctx.userId,
      action: data.suspended ? "suspend_user" : "unsuspend_user",
      entity: "auth.users",
      entityId: data.userId,
    });
    return { ok: true };
  });

export const impersonateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireSuperAdmin])
  .validator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    requireServiceKey();
    const ctx = context as unknown as { userId: string };
    const client = await admin();
    const { data: userRes, error: getError } = await client.auth.admin.getUserById(data.userId);
    const email = (userRes?.user as { email?: string } | undefined)?.email;
    if (getError || !email) throw new Error("This user has no email to impersonate.");
    const { data: link, error } = await client.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (error) throw new Error(error.message);
    await writeAudit({
      userId: ctx.userId,
      action: "impersonate_user",
      entity: "auth.users",
      entityId: data.userId,
    });
    return { actionLink: link.properties.action_link };
  });

/**
 * Erases a user's personal data (right to erasure / DSAR). Super-admin only, and
 * refuses to erase the caller or any other super-admin so the console cannot be
 * used to lock itself out. The database work is atomic (`erase_user_data`, 0026);
 * the auth user is removed afterwards.
 */
export const eraseUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireSuperAdmin])
  .validator((input: unknown) =>
    z.object({ userId: z.string().uuid(), confirmEmail: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    requireServiceKey();
    const ctx = context as unknown as { userId: string };
    const client = await admin();

    const { data: roles } = await client
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);

    const { erasureBlockReason, confirmationMatches } = await import("@/lib/account-policy");
    const blockReason = erasureBlockReason({
      targetId: data.userId,
      actorId: ctx.userId,
      targetRoles: (roles ?? []).map((r) => r.role),
    });
    if (blockReason) throw new Error(blockReason);

    // Typed confirmation: the operator must echo the target's current email.
    const { data: profile } = await client
      .from("profiles")
      .select("email")
      .eq("id", data.userId)
      .maybeSingle();
    if (!confirmationMatches(profile?.email, data.confirmEmail)) {
      throw new Error("The confirmation email does not match this user. Aborting.");
    }

    const { data: summary, error } = await client.rpc("erase_user_data", {
      _user_id: data.userId,
    });
    if (error) throw new Error(error.message);

    const { error: authError } = await client.auth.admin.deleteUser(data.userId);
    if (authError) {
      console.error(`[admin] auth user delete failed after erasure: ${authError.message}`);
    }

    const { buildRemovalConfirmation, removalConfirmationToMarkdown } =
      await import("@/lib/gdpr-report");
    const completedAt = new Date().toISOString();
    const confirmation = buildRemovalConfirmation({
      userId: data.userId,
      completedAt,
      summary: (summary as Record<string, unknown> | null) ?? null,
    });

    await writeAudit({
      userId: ctx.userId,
      action: "erase_user",
      entity: "profiles",
      entityId: data.userId,
      metadata: { summary: summary ?? {}, reference: confirmation.header.reference },
    });
    return {
      ok: true,
      summary,
      confirmation,
      confirmationMarkdown: removalConfirmationToMarkdown(confirmation),
    };
  });

/**
 * Builds a data-subject access report (GDPR Art. 15 / CCPA right to know) for a
 * user: everything we hold, grouped by category. Admin-only, audited. The report
 * is generated on demand and returned as markdown so the operator can hand it to
 * the data subject. Read-only.
 */
export const exportUserData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    requireServiceKey();
    const ctx = context as unknown as { userId: string };
    const client = await admin();
    const empty = "00000000-0000-0000-0000-000000000000";

    const [{ data: profile }, { data: roles }, { data: owned }, { data: members }] =
      await Promise.all([
        client
          .from("profiles")
          .select("id, email, full_name, timezone, created_at")
          .eq("id", data.userId)
          .maybeSingle(),
        client.from("user_roles").select("role").eq("user_id", data.userId),
        client.from("workspaces").select("id, name, plan, created_at").eq("owner_id", data.userId),
        client.from("workspace_members").select("workspace_id").eq("user_id", data.userId),
      ]);

    const workspaceIds = [
      ...new Set([
        ...(owned ?? []).map((w) => w.id),
        ...(members ?? []).map((m) => m.workspace_id),
      ]),
    ];
    const inIds = workspaceIds.length ? workspaceIds : [empty];
    const head = { count: "exact" as const, head: true };

    const [projects, jobs, published, socials, credits, auditLogs, sec, analytics, errors] =
      await Promise.all([
        client.from("projects").select("*", head).in("workspace_id", inIds),
        client.from("video_jobs").select("*", head).in("workspace_id", inIds),
        client.from("published_posts").select("*", head).in("workspace_id", inIds),
        client.from("social_accounts").select("*", head).in("workspace_id", inIds),
        client.from("usage_credits").select("balance, lifetime_consumed").in("workspace_id", inIds),
        client.from("audit_logs").select("*", head).eq("user_id", data.userId),
        client.from("security_events").select("*", head).eq("user_id", data.userId),
        client.from("analytics_events").select("*", head).eq("user_id", data.userId),
        client.from("error_issues").select("*", head).eq("user_id", data.userId),
      ]);

    const creditsTotals = (credits.data ?? []).reduce(
      (acc, c) => {
        acc.balance += c.balance ?? 0;
        acc.consumed += c.lifetime_consumed ?? 0;
        return acc;
      },
      { balance: 0, consumed: 0 },
    );

    let auth: { email: string | null; banned: boolean; lastSignInAt: string | null } = {
      email: profile?.email ?? null,
      banned: false,
      lastSignInAt: null,
    };
    try {
      const { data: userRes } = await client.auth.admin.getUserById(data.userId);
      const u = userRes?.user as
        | { email?: string | null; banned_until?: string | null; last_sign_in_at?: string | null }
        | undefined;
      if (u) {
        auth = {
          email: u.email ?? auth.email,
          banned: Boolean(u.banned_until && new Date(u.banned_until).getTime() > Date.now()),
          lastSignInAt: u.last_sign_in_at ?? null,
        };
      }
    } catch {
      /* auth lookup best-effort */
    }

    const { buildGdprReport, gdprReportToMarkdown } = await import("@/lib/gdpr-report");
    const report = buildGdprReport({
      userId: data.userId,
      generatedAt: new Date().toISOString(),
      profile: {
        email: profile?.email ?? null,
        fullName: profile?.full_name ?? null,
        createdAt: profile?.created_at ?? null,
        timezone: profile?.timezone ?? null,
      },
      auth,
      roles: (roles ?? []).map((r) => r.role),
      workspaces: (owned ?? []).map((w) => ({
        id: w.id,
        name: w.name,
        plan: w.plan,
        createdAt: w.created_at,
      })),
      counts: {
        projects: projects.count ?? 0,
        jobs: jobs.count ?? 0,
        published: published.count ?? 0,
        socials: socials.count ?? 0,
      },
      credits: creditsTotals,
      telemetry: {
        auditLogs: auditLogs.count ?? 0,
        securityEvents: sec.count ?? 0,
        analyticsEvents: analytics.count ?? 0,
        errorIssues: errors.count ?? 0,
      },
    });

    await writeAudit({
      userId: ctx.userId,
      action: "export_user_data",
      entity: "profiles",
      entityId: data.userId,
      metadata: { sections: report.sections.map((s) => s.id) },
    });

    return { report, markdown: gdprReportToMarkdown(report) };
  });

/* ------------------------------------------------------------------ */
/* Issue tracking (error_issues, 0020)                                  */
/* ------------------------------------------------------------------ */

export const listErrorIssues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(200).default(100),
        status: z.enum(["open", "resolved", "ignored", "all"]).default("open"),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    requireServiceKey();
    const client = await admin();
    let query = client
      .from("error_issues")
      .select("id, fingerprint, kind, level, message, path, count, status, first_seen, last_seen")
      .order("last_seen", { ascending: false })
      .limit(data.limit);
    if (data.status !== "all") query = query.eq("status", data.status);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateErrorIssueStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["open", "resolved", "ignored"]) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    requireServiceKey();
    const ctx = context as unknown as { userId: string };
    const client = await admin();
    const { error } = await client
      .from("error_issues")
      .update({ status: data.status })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await writeAudit({
      userId: ctx.userId,
      action: "update_error_issue",
      entity: "error_issues",
      entityId: data.id,
      metadata: { status: data.status },
    });
    return { ok: true };
  });

/* ------------------------------------------------------------------ */
/* Product analytics (analytics_events, 0020)                           */
/* ------------------------------------------------------------------ */

export const getProductAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .validator((input: unknown) =>
    z.object({ days: z.number().int().min(7).max(90).default(30) }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    requireServiceKey();
    const client = await admin();
    const sinceIso = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows, error } = await client
      .from("analytics_events")
      .select("event, created_at, workspace_id")
      .gte("created_at", sinceIso)
      .limit(50_000);
    if (error) throw new Error(error.message);

    const byEvent = new Map<string, number>();
    const workspacesByEvent = new Map<string, Set<string>>();
    const byDay = new Map<string, number>();
    for (const row of rows ?? []) {
      byEvent.set(row.event, (byEvent.get(row.event) ?? 0) + 1);
      if (row.workspace_id) {
        const set = workspacesByEvent.get(row.event) ?? new Set<string>();
        set.add(row.workspace_id);
        workspacesByEvent.set(row.event, set);
      }
      const day = row.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }

    return {
      total: rows?.length ?? 0,
      events: [...byEvent.entries()]
        .map(([event, count]) => ({
          event,
          count,
          workspaces: workspacesByEvent.get(event)?.size ?? 0,
        }))
        .sort((a, b) => b.count - a.count),
      series: [...byDay.entries()]
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  });

/* ------------------------------------------------------------------ */
/* Duplicate user detection (window function, 0021)                     */
/* ------------------------------------------------------------------ */

export const findDuplicateUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth, requireAdmin])
  .handler(async () => {
    requireServiceKey();
    const client = await admin();
    const { data: rows, error } = await client.rpc("find_duplicate_users");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
