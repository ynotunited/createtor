/**
 * Minimal Stripe REST client. Uses fetch + Web Crypto so it runs on the
 * Cloudflare Workers runtime (no Node-only Stripe SDK). Only the endpoints the
 * billing flow needs are implemented.
 */
import type { StripeRuntime } from "@/lib/platform-config.server";

const API_BASE = "https://api.stripe.com/v1";

type StripeParams = Record<string, string | number | boolean | undefined>;

function encodeForm(params: StripeParams): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) usp.append(key, String(value));
  }
  return usp.toString();
}

async function stripeRequest<T>(
  runtime: StripeRuntime,
  path: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: StripeParams },
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${runtime.secretKey}`,
  };
  const requestInit: RequestInit = { method: init.method, headers };
  if (init.method !== "GET") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    requestInit.body = encodeForm(init.body ?? {});
  }
  const res = await fetch(`${API_BASE}${path}`, requestInit);
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = json["error"] as { message?: string } | undefined;
    throw new Error(err?.message ?? `Stripe request failed (${res.status})`);
  }
  return json as T;
}

export type StripeCheckoutSession = { id: string; url: string | null };

export async function createStripeCheckout(
  runtime: StripeRuntime,
  args: {
    /** Stripe `price_…` id to charge. This is the source of truth for the amount. */
    priceId: string;
    planName: string;
    workspaceId: string;
    planKey: string;
    cycle: string;
    successUrl: string;
    cancelUrl: string;
    email?: string | null;
  },
): Promise<StripeCheckoutSession> {
  if (!args.priceId) throw new Error("No Stripe price is configured for this plan.");
  return stripeRequest<StripeCheckoutSession>(runtime, "/checkout/sessions", {
    method: "POST",
    body: {
      mode: "subscription",
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      client_reference_id: args.workspaceId,
      customer_email: args.email ?? undefined,
      "metadata[workspaceId]": args.workspaceId,
      "metadata[planKey]": args.planKey,
      "metadata[cycle]": args.cycle,
      "line_items[0][quantity]": 1,
      "line_items[0][price]": args.priceId,
    },
  });
}

export type StripeSubscription = {
  id: string;
  status: string;
  current_period_end: number;
  customer: string;
  cancel_at_period_end: boolean;
};

export async function retrieveStripeSubscription(
  runtime: StripeRuntime,
  subscriptionId: string,
): Promise<StripeSubscription> {
  return stripeRequest<StripeSubscription>(
    runtime,
    `/subscriptions/${encodeURIComponent(subscriptionId)}`,
    { method: "GET" },
  );
}

export async function setStripeCancelAtPeriodEnd(
  runtime: StripeRuntime,
  subscriptionId: string,
  cancel: boolean,
): Promise<void> {
  await stripeRequest(runtime, `/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    method: "POST",
    body: { cancel_at_period_end: cancel },
  });
}

export type StripePortalSession = { url: string };

export async function createStripePortal(
  runtime: StripeRuntime,
  customerId: string,
  returnUrl: string,
): Promise<StripePortalSession> {
  return stripeRequest<StripePortalSession>(runtime, "/billing_portal/sessions", {
    method: "POST",
    body: { customer: customerId, return_url: returnUrl },
  });
}

/* ------------------------------------------------------------------ */
/* Webhook signature verification                                       */
/* ------------------------------------------------------------------ */

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/**
 * Verifies the `Stripe-Signature` header against the raw request body.
 * Returns true only for a fresh, correctly signed payload.
 */
export async function verifyStripeWebhook(
  secret: string,
  signatureHeader: string | null,
  rawBody: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!secret || !signatureHeader) return false;
  const parts = signatureHeader.split(",").reduce<Record<string, string>>((acc, part) => {
    const [k, v] = part.split("=");
    if (k && v) acc[k.trim()] = v.trim();
    return acc;
  }, {});
  const timestamp = parts["t"];
  const expected = parts["v1"];
  if (!timestamp || !expected) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > toleranceSeconds) return false;
  const computed = await hmacSha256Hex(secret, `${timestamp}.${rawBody}`);
  return timingSafeEqual(computed, expected);
}
