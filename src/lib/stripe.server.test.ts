import { describe, expect, it } from "vitest";

import { verifyStripeWebhook } from "@/lib/stripe.server";

async function sign(secret: string, payload: string): Promise<string> {
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

async function signedHeader(
  secret: string,
  body: string,
  timestamp = Math.floor(Date.now() / 1000),
) {
  const signature = await sign(secret, `${timestamp}.${body}`);
  return `t=${timestamp},v1=${signature}`;
}

const SECRET = "whsec_test_secret";
const BODY = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });

describe("verifyStripeWebhook", () => {
  it("accepts a correctly signed, fresh payload", async () => {
    await expect(verifyStripeWebhook(SECRET, await signedHeader(SECRET, BODY), BODY)).resolves.toBe(
      true,
    );
  });

  it("rejects a tampered body", async () => {
    const header = await signedHeader(SECRET, BODY);
    await expect(verifyStripeWebhook(SECRET, header, `${BODY} `)).resolves.toBe(false);
  });

  it("rejects a signature made with the wrong secret", async () => {
    const header = await signedHeader("whsec_other", BODY);
    await expect(verifyStripeWebhook(SECRET, header, BODY)).resolves.toBe(false);
  });

  it("rejects a stale timestamp outside the tolerance window", async () => {
    const old = Math.floor(Date.now() / 1000) - 3600;
    const header = await signedHeader(SECRET, BODY, old);
    await expect(verifyStripeWebhook(SECRET, header, BODY)).resolves.toBe(false);
  });

  it("rejects a far-future timestamp", async () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    const header = await signedHeader(SECRET, BODY, future);
    await expect(verifyStripeWebhook(SECRET, header, BODY)).resolves.toBe(false);
  });

  it("rejects a missing or empty signature header", async () => {
    await expect(verifyStripeWebhook(SECRET, null, BODY)).resolves.toBe(false);
    await expect(verifyStripeWebhook(SECRET, "", BODY)).resolves.toBe(false);
  });

  it("rejects when the secret is not configured", async () => {
    await expect(verifyStripeWebhook("", await signedHeader(SECRET, BODY), BODY)).resolves.toBe(
      false,
    );
  });

  it("rejects a header without a v1 signature or timestamp", async () => {
    const ts = Math.floor(Date.now() / 1000);
    await expect(verifyStripeWebhook(SECRET, `t=${ts}`, BODY)).resolves.toBe(false);
    await expect(verifyStripeWebhook(SECRET, `v1=deadbeef`, BODY)).resolves.toBe(false);
  });
});
