/**
 * Server-only platform configuration.
 *
 * Admin-editable values live in `public.system_settings` and take precedence
 * over environment variables, so providers, models and keys can be rotated
 * without a redeploy. Secrets are stored in their own `is_secret` rows and are
 * never returned to the browser in raw form.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ImageConfig } from "@/lib/image-gateway.server";
import { PLANS, type BillingCycle, type PlanKey } from "@/lib/pricing";

export type AiProviderId = "google" | "groq" | "pollinations";

export type AiProviderRuntime = {
  enabled: boolean;
  model: string;
  baseUrl: string;
  /** Resolved secret: DB override first, then environment. */
  apiKey: string;
};

export type AiRuntime = {
  google: AiProviderRuntime;
  groq: AiProviderRuntime;
  pollinations: AiProviderRuntime;
};

export type AiProviderView = {
  enabled: boolean;
  model: string;
  baseUrl: string;
  keyConfigured: boolean;
  keyLast4: string | null;
  keySource: "database" | "environment" | "none";
};

export type AiConfigView = Record<AiProviderId, AiProviderView>;

export type PlatformView = {
  signups_open: boolean;
  maintenance_mode: boolean;
  free_credits_monthly: number;
  announcement: string;
};

type SettingsRow = { key: string; value: unknown; is_secret: boolean };

async function readSettings(): Promise<Map<string, SettingsRow>> {
  const { data, error } = await supabaseAdmin
    .from("system_settings")
    .select("key, value, is_secret");
  if (error) throw new Error(`Could not read system settings: ${error.message}`);
  const map = new Map<string, SettingsRow>();
  for (const row of (data ?? []) as SettingsRow[]) map.set(row.key, row);
  return map;
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function defaultAiRuntime(): AiRuntime {
  const googleKey = process.env["GOOGLE_AI_API_KEY"] ?? "";
  const groqKey = process.env["GROQ_API_KEY"] ?? "";
  const pollinationsKey = process.env["POLLINATIONS_TOKEN"] ?? "";
  const geminiBase =
    process.env["GEMINI_API_BASE_URL"] ?? "https://generativelanguage.googleapis.com/v1beta";
  return {
    google: {
      enabled: Boolean(googleKey),
      model: process.env["GEMINI_CHAT_MODEL"] ?? "gemini-3.5-flash",
      baseUrl: geminiBase,
      apiKey: googleKey,
    },
    groq: {
      enabled: Boolean(groqKey),
      model: process.env["GROQ_MODEL"] ?? "openai/gpt-oss-120b",
      baseUrl: process.env["GROQ_BASE_URL"] ?? "https://api.groq.com/openai/v1",
      apiKey: groqKey,
    },
    pollinations: {
      enabled: true,
      model: process.env["POLLINATIONS_MODEL"] ?? "flux",
      baseUrl: "https://gen.pollinations.ai",
      apiKey: pollinationsKey,
    },
  };
}

/** Resolves provider config (including secrets) for server-side use. */
export async function loadAiRuntime(): Promise<AiRuntime> {
  const runtime = defaultAiRuntime();
  try {
    const settings = await readSettings();
    const merge = (id: AiProviderId) => {
      const cfg = obj(settings.get(`ai.${id}`)?.value);
      if ("enabled" in cfg) runtime[id].enabled = bool(cfg["enabled"], runtime[id].enabled);
      runtime[id].model = str(cfg["model"], runtime[id].model);
      runtime[id].baseUrl = str(cfg["baseUrl"], runtime[id].baseUrl);
      const keyRow = settings.get(`ai.${id}.key`);
      const key = str(obj(keyRow?.value)["key"]);
      if (key) runtime[id].apiKey = key;
    };
    merge("google");
    merge("groq");
    merge("pollinations");
  } catch (error) {
    console.error("[config] falling back to environment only:", error);
  }
  return runtime;
}

/** Masked provider view for the admin UI. Raw secrets are never returned. */
export async function loadAiConfigView(): Promise<AiConfigView> {
  const settings = await readSettings();
  const build = (id: AiProviderId, runtime: AiProviderRuntime): AiProviderView => {
    const cfg = obj(settings.get(`ai.${id}`)?.value);
    const key = str(obj(settings.get(`ai.${id}.key`)?.value)["key"]);
    const envKey =
      id === "google"
        ? process.env["GOOGLE_AI_API_KEY"]
        : id === "groq"
          ? process.env["GROQ_API_KEY"]
          : process.env["POLLINATIONS_TOKEN"];
    const active = key || envKey || "";
    return {
      enabled: bool(cfg["enabled"], runtime.enabled),
      model: str(cfg["model"], runtime.model),
      baseUrl: str(cfg["baseUrl"], runtime.baseUrl),
      keyConfigured: Boolean(active),
      keyLast4: active ? active.slice(-4) : null,
      keySource: key ? "database" : envKey ? "environment" : "none",
    };
  };
  const runtime = defaultAiRuntime();
  return {
    google: build("google", runtime.google),
    groq: build("groq", runtime.groq),
    pollinations: build("pollinations", runtime.pollinations),
  };
}

/** Resolved provider config (including secrets) for the image gateway. */
export async function loadImageConfig(): Promise<ImageConfig> {
  const runtime = await loadAiRuntime();
  const provider = process.env["IMAGE_PROVIDER"] === "gemini" ? "gemini" : "pollinations";
  if (provider === "gemini") {
    return {
      provider: "gemini",
      baseURL: runtime.google.baseUrl,
      model: process.env["GEMINI_IMAGE_MODEL"] ?? "gemini-3.1-flash-image",
      apiKey: runtime.google.apiKey,
      token: runtime.pollinations.apiKey || undefined,
    };
  }
  return {
    provider: "pollinations",
    baseURL: runtime.pollinations.baseUrl,
    model: runtime.pollinations.model,
    apiKey: runtime.google.apiKey,
    token: runtime.pollinations.apiKey || undefined,
  };
}

/* ------------------------------------------------------------------ */
/* Payments: Stripe + PayPal                                            */
/* ------------------------------------------------------------------ */

export type PaymentGatewayId = "stripe" | "paypal";

export type StripeRuntime = {
  enabled: boolean;
  mode: "live" | "test";
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
};

export type PaypalRuntime = {
  enabled: boolean;
  mode: "live" | "sandbox";
  clientId: string;
  clientSecret: string;
  webhookId: string;
};

export type PaymentRuntime = { stripe: StripeRuntime; paypal: PaypalRuntime };

export type PaymentGatewayView = {
  enabled: boolean;
  configured: boolean;
  mode: string;
  keySource: "database" | "environment" | "none";
  /** Non-secret identifiers, shown so an admin can confirm they pasted the right account. */
  publicId: string | null;
  secretConfigured: boolean;
  secretLast4: string | null;
  webhookConfigured: boolean;
};

export type PaymentConfigView = { stripe: PaymentGatewayView; paypal: PaymentGatewayView };

function stripeKeyMode(secretKey: string): "live" | "test" {
  return secretKey.startsWith("sk_live") ? "live" : "test";
}

export async function loadPaymentRuntime(): Promise<PaymentRuntime> {
  const runtime: PaymentRuntime = {
    stripe: {
      enabled: Boolean(process.env["STRIPE_SECRET_KEY"]),
      mode: "test",
      secretKey: process.env["STRIPE_SECRET_KEY"] ?? "",
      publishableKey: process.env["STRIPE_PUBLISHABLE_KEY"] ?? "",
      webhookSecret: process.env["STRIPE_WEBHOOK_SECRET"] ?? "",
    },
    paypal: {
      enabled: Boolean(process.env["PAYPAL_CLIENT_ID"] && process.env["PAYPAL_CLIENT_SECRET"]),
      mode: process.env["PAYPAL_MODE"] === "live" ? "live" : "sandbox",
      clientId: process.env["PAYPAL_CLIENT_ID"] ?? "",
      clientSecret: process.env["PAYPAL_CLIENT_SECRET"] ?? "",
      webhookId: process.env["PAYPAL_WEBHOOK_ID"] ?? "",
    },
  };
  try {
    const settings = await readSettings();

    const stripeCfg = obj(settings.get("payments.stripe")?.value);
    if ("enabled" in stripeCfg)
      runtime.stripe.enabled = bool(stripeCfg["enabled"], runtime.stripe.enabled);
    const stripeKey = obj(settings.get("payments.stripe.key")?.value);
    runtime.stripe.secretKey = str(stripeKey["secretKey"], runtime.stripe.secretKey);
    runtime.stripe.publishableKey = str(stripeKey["publishableKey"], runtime.stripe.publishableKey);
    runtime.stripe.webhookSecret = str(stripeKey["webhookSecret"], runtime.stripe.webhookSecret);
    runtime.stripe.mode =
      str(stripeCfg["mode"]) === "live" || str(stripeCfg["mode"]) === "test"
        ? (str(stripeCfg["mode"]) as "live" | "test")
        : stripeKeyMode(runtime.stripe.secretKey);

    const paypalCfg = obj(settings.get("payments.paypal")?.value);
    if ("enabled" in paypalCfg)
      runtime.paypal.enabled = bool(paypalCfg["enabled"], runtime.paypal.enabled);
    const paypalKey = obj(settings.get("payments.paypal.key")?.value);
    runtime.paypal.clientId = str(paypalKey["clientId"], runtime.paypal.clientId);
    runtime.paypal.clientSecret = str(paypalKey["clientSecret"], runtime.paypal.clientSecret);
    runtime.paypal.webhookId = str(paypalKey["webhookId"], runtime.paypal.webhookId);
    runtime.paypal.mode =
      str(paypalCfg["mode"]) === "live" || str(paypalCfg["mode"]) === "sandbox"
        ? (str(paypalCfg["mode"]) as "live" | "sandbox")
        : runtime.paypal.mode;
  } catch (error) {
    console.error("[config] payment settings unavailable:", error);
  }
  return runtime;
}

/** Masked gateway view for the admin UI. Raw secrets are never returned. */
export async function loadPaymentConfigView(): Promise<PaymentConfigView> {
  const runtime = await loadPaymentRuntime();
  let settings: Map<string, SettingsRow>;
  try {
    settings = await readSettings();
  } catch {
    settings = new Map();
  }

  const stripeDb = obj(settings.get("payments.stripe.key")?.value);
  const paypalDb = obj(settings.get("payments.paypal.key")?.value);
  const stripeSecret = str(stripeDb["secretKey"]) || process.env["STRIPE_SECRET_KEY"] || "";
  const paypalSecret = str(paypalDb["clientSecret"]) || process.env["PAYPAL_CLIENT_SECRET"] || "";

  const stripeConfigured = Boolean(runtime.stripe.secretKey && runtime.stripe.webhookSecret);
  const paypalConfigured = Boolean(runtime.paypal.clientId && runtime.paypal.clientSecret);

  return {
    stripe: {
      enabled: runtime.stripe.enabled,
      configured: stripeConfigured,
      mode: runtime.stripe.mode,
      keySource: str(stripeDb["secretKey"])
        ? "database"
        : process.env["STRIPE_SECRET_KEY"]
          ? "environment"
          : "none",
      publicId: runtime.stripe.publishableKey || null,
      secretConfigured: Boolean(stripeSecret),
      secretLast4: stripeSecret ? stripeSecret.slice(-4) : null,
      webhookConfigured: Boolean(runtime.stripe.webhookSecret),
    },
    paypal: {
      enabled: runtime.paypal.enabled,
      configured: paypalConfigured,
      mode: runtime.paypal.mode,
      keySource: str(paypalDb["clientSecret"])
        ? "database"
        : process.env["PAYPAL_CLIENT_SECRET"]
          ? "environment"
          : "none",
      publicId: runtime.paypal.clientId || null,
      secretConfigured: Boolean(paypalSecret),
      secretLast4: paypalSecret ? paypalSecret.slice(-4) : null,
      webhookConfigured: Boolean(runtime.paypal.webhookId),
    },
  };
}

/** Which gateways can actually take a payment right now (safe for the client). */
export async function loadPaymentAvailability(): Promise<RuntimeAvailability> {
  const runtime = await loadPaymentRuntime();
  return {
    stripe:
      runtime.stripe.enabled && Boolean(runtime.stripe.secretKey && runtime.stripe.webhookSecret),
    paypal:
      runtime.paypal.enabled && Boolean(runtime.paypal.clientId && runtime.paypal.clientSecret),
  };
}

export type RuntimeAvailability = { stripe: boolean; paypal: boolean };

/* ------------------------------------------------------------------ */
/* Plan pricing (source of truth for what we charge)                   */
/* ------------------------------------------------------------------ */

export type CyclePricing = {
  /** Amount to charge for the cycle, in cents (USD). */
  amountCents: number;
  /** Stripe `price_…` id charged for this plan+cycle (empty = not configured). */
  stripePriceId: string;
  /** PayPal billing plan id reused for this plan+cycle (empty = not created yet). */
  paypalPlanId: string;
};

export type PlanPricing = Record<PlanKey, { monthly: CyclePricing; yearly: CyclePricing }>;

/** Immutable default derived from `PLANS`, so behaviour is unchanged until configured. */
export function defaultPlanPricing(): PlanPricing {
  const build = (key: PlanKey): { monthly: CyclePricing; yearly: CyclePricing } => {
    const plan = PLANS.find((p) => p.key === key);
    return {
      monthly: {
        amountCents: Math.round((plan?.monthlyPriceUsd ?? 0) * 100),
        stripePriceId: plan?.stripePriceId ?? "",
        paypalPlanId: "",
      },
      yearly: {
        amountCents: Math.round((plan?.yearlyPriceUsd ?? 0) * 100),
        stripePriceId: plan?.stripeYearlyPriceId ?? "",
        paypalPlanId: "",
      },
    };
  };
  return {
    free: build("free"),
    creator: build("creator"),
    pro: build("pro"),
    agency: build("agency"),
  };
}

function parseCyclePricing(value: unknown, fallback: CyclePricing): CyclePricing {
  const cfg = obj(value);
  return {
    amountCents:
      typeof cfg["amountCents"] === "number" &&
      Number.isFinite(cfg["amountCents"]) &&
      cfg["amountCents"] >= 0
        ? Math.round(cfg["amountCents"])
        : fallback.amountCents,
    stripePriceId: str(cfg["stripePriceId"], fallback.stripePriceId),
    paypalPlanId: str(cfg["paypalPlanId"], fallback.paypalPlanId),
  };
}

/** Resolves the full plan pricing map (DB override over the `PLANS` default). */
export async function loadPlanPricing(): Promise<PlanPricing> {
  const pricing = defaultPlanPricing();
  try {
    const settings = await readSettings();
    const root = obj(settings.get("pricing")?.value);
    for (const key of Object.keys(pricing) as PlanKey[]) {
      const planCfg = obj(root[key]);
      pricing[key].monthly = parseCyclePricing(planCfg["monthly"], pricing[key].monthly);
      pricing[key].yearly = parseCyclePricing(planCfg["yearly"], pricing[key].yearly);
    }
  } catch (error) {
    console.error("[config] pricing settings unavailable:", error);
  }
  return pricing;
}

/** The pricing for one plan+cycle, or null when the plan is not chargeable. */
export async function resolveCyclePricing(
  planKey: PlanKey,
  cycle: BillingCycle,
): Promise<CyclePricing | null> {
  const pricing = await loadPlanPricing();
  const entry = pricing[planKey]?.[cycle];
  if (!entry || entry.amountCents <= 0) return null;
  return entry;
}

/** Persists the PayPal billing plan id created for a plan+cycle so it is reused. */
export async function rememberPaypalPlanId(
  planKey: PlanKey,
  cycle: BillingCycle,
  planId: string,
): Promise<void> {
  if (!planId) return;
  const { data: existing } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "pricing")
    .maybeSingle();
  const root = (
    existing?.value && typeof existing.value === "object" ? existing.value : {}
  ) as Record<string, unknown>;
  const pricing = { ...defaultPlanPricing(), ...root } as Record<string, unknown>;
  const planCfg = { ...(obj(pricing[planKey]) as Record<string, unknown>) };
  planCfg[cycle] = { ...obj(planCfg[cycle]), paypalPlanId: planId };
  pricing[planKey] = planCfg;
  const { error } = await supabaseAdmin
    .from("system_settings")
    .upsert({ key: "pricing", value: pricing as never, is_secret: false });
  if (error) console.error("[config] could not persist paypal plan id:", error.message);
}

/** Public-safe pricing view: amounts + configured flags, never raw provider ids. */
export type PublicPricing = {
  [K in PlanKey]: {
    name: string;
    monthly: { amountCents: number; checkoutAvailable: boolean };
    yearly: { amountCents: number; checkoutAvailable: boolean };
  };
};

export async function loadPublicPricing(): Promise<PublicPricing> {
  const pricing = await loadPlanPricing();
  const build = (key: PlanKey) => ({
    name: PLANS.find((p) => p.key === key)?.name ?? key,
    monthly: {
      amountCents: pricing[key].monthly.amountCents,
      checkoutAvailable: pricing[key].monthly.amountCents > 0,
    },
    yearly: {
      amountCents: pricing[key].yearly.amountCents,
      checkoutAvailable: pricing[key].yearly.amountCents > 0,
    },
  });
  return {
    free: build("free"),
    creator: build("creator"),
    pro: build("pro"),
    agency: build("agency"),
  };
}

export async function loadPlatformView(): Promise<PlatformView> {
  const defaults: PlatformView = {
    signups_open: true,
    maintenance_mode: false,
    free_credits_monthly: 1000,
    announcement: "",
  };
  try {
    const settings = await readSettings();
    const cfg = obj(settings.get("platform")?.value);
    return {
      signups_open: bool(cfg["signups_open"], defaults.signups_open),
      maintenance_mode: bool(cfg["maintenance_mode"], defaults.maintenance_mode),
      free_credits_monthly:
        typeof cfg["free_credits_monthly"] === "number"
          ? (cfg["free_credits_monthly"] as number)
          : defaults.free_credits_monthly,
      announcement: str(cfg["announcement"], defaults.announcement),
    };
  } catch (error) {
    console.error("[config] platform settings unavailable:", error);
    return defaults;
  }
}
