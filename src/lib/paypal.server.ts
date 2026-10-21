/**
 * Minimal PayPal REST client (Subscriptions v1 + Catalogs). Uses fetch so it
 * runs on the Workers runtime. Product/Plan ids are cached in system_settings
 * so a plan is only provisioned once per (plan, cycle, amount).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { PaypalRuntime } from "@/lib/platform-config.server";

function baseUrl(runtime: PaypalRuntime): string {
  return runtime.mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function getAccessToken(runtime: PaypalRuntime): Promise<string> {
  const basic = btoa(`${runtime.clientId}:${runtime.clientSecret}`);
  const res = await fetch(`${baseUrl(runtime)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description ?? `PayPal auth failed (${res.status})`);
  }
  return json.access_token;
}

async function paypalRequest<T>(
  runtime: PaypalRuntime,
  token: string,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
): Promise<T> {
  const requestInit: RequestInit = {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
  if (init.body !== undefined) requestInit.body = JSON.stringify(init.body);
  const res = await fetch(`${baseUrl(runtime)}${path}`, requestInit);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message =
      (json["message"] as string) ??
      (json["error_description"] as string) ??
      `PayPal request failed (${res.status})`;
    throw new Error(message);
  }
  return json as T;
}

type PaypalPlanRecord = { productId: string; planId: string; amountUsd: number };
type PaypalPlanStore = Record<string, PaypalPlanRecord>;

async function readPlanStore(): Promise<PaypalPlanStore> {
  const { data } = await supabaseAdmin
    .from("system_settings")
    .select("value")
    .eq("key", "payments.paypal.plan")
    .maybeSingle();
  const value = data?.value;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as PaypalPlanStore)
    : {};
}

async function writePlanStore(store: PaypalPlanStore): Promise<void> {
  await supabaseAdmin
    .from("system_settings")
    .upsert({ key: "payments.paypal.plan", value: store, is_secret: false });
}

/** Provisions a PayPal Product + Plan on first use, then reuses the cached ids. */
export async function ensurePaypalPlan(
  runtime: PaypalRuntime,
  args: { planKey: string; cycle: "monthly" | "yearly"; planName: string; amountUsd: number },
): Promise<string> {
  const storeKey = `${args.planKey}_${args.cycle}`;
  const store = await readPlanStore();
  const cached = store[storeKey];
  if (cached && cached.amountUsd === args.amountUsd) return cached.planId;

  const token = await getAccessToken(runtime);
  const product = await paypalRequest<{ id: string }>(runtime, token, "/v1/catalogs/products", {
    method: "POST",
    body: {
      name: "Createtor",
      description: "Createtor subscription plans",
      type: "SERVICE",
      category: "SOFTWARE",
    },
  });
  const plan = await paypalRequest<{ id: string }>(runtime, token, "/v1/billing/plans", {
    method: "POST",
    body: {
      product_id: product.id,
      name: `${args.planName} (${args.cycle})`,
      billing_cycles: [
        {
          frequency: {
            interval_unit: args.cycle === "yearly" ? "YEAR" : "MONTH",
            interval_count: 1,
          },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: args.amountUsd.toFixed(2), currency_code: "USD" },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        payment_failure_threshold: 3,
      },
    },
  });

  store[storeKey] = { productId: product.id, planId: plan.id, amountUsd: args.amountUsd };
  await writePlanStore(store);
  return plan.id;
}

export type PaypalSubscriptionCreate = { id: string; approveUrl: string | null };

export async function createPaypalSubscription(
  runtime: PaypalRuntime,
  args: { planId: string; customId: string; origin: string },
): Promise<PaypalSubscriptionCreate> {
  const token = await getAccessToken(runtime);
  const result = await paypalRequest<{
    id: string;
    links?: { href: string; rel: string }[];
  }>(runtime, token, "/v1/billing/subscriptions", {
    method: "POST",
    body: {
      plan_id: args.planId,
      custom_id: args.customId,
      application_context: {
        brand_name: "Createtor",
        user_action: "SUBSCRIBE_NOW",
        return_url: `${args.origin}/billing?checkout=success`,
        cancel_url: `${args.origin}/billing?checkout=cancelled`,
      },
    },
  });
  const approveUrl = result.links?.find((l) => l.rel === "approve")?.href ?? null;
  return { id: result.id, approveUrl };
}

export type PaypalSubscriptionDetail = {
  id: string;
  status: string;
  plan_id: string;
  custom_id?: string;
  billing_info?: { next_billing_time?: string };
};

export async function getPaypalSubscription(
  runtime: PaypalRuntime,
  subscriptionId: string,
): Promise<PaypalSubscriptionDetail> {
  const token = await getAccessToken(runtime);
  return paypalRequest<PaypalSubscriptionDetail>(
    runtime,
    token,
    `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "GET" },
  );
}

export async function cancelPaypalSubscription(
  runtime: PaypalRuntime,
  subscriptionId: string,
  reason: string,
): Promise<void> {
  const token = await getAccessToken(runtime);
  await paypalRequest(
    runtime,
    token,
    `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
    { method: "POST", body: { reason } },
  );
}

/* ------------------------------------------------------------------ */
/* Webhook verification                                                 */
/* ------------------------------------------------------------------ */

export async function verifyPaypalWebhook(
  runtime: PaypalRuntime,
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  if (!runtime.webhookId) return false;
  const token = await getAccessToken(runtime);
  const verification = await paypalRequest<{ verification_status?: string }>(
    runtime,
    token,
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: {
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_time: headers.get("paypal-transmission-time"),
        cert_url: headers.get("paypal-cert-url"),
        auth_algo: headers.get("paypal-auth-algo"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        webhook_id: runtime.webhookId,
        webhook_event: JSON.parse(rawBody),
      },
    },
  );
  return verification.verification_status === "SUCCESS";
}
