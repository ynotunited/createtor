/**
 * Marketing email footer.
 *
 * CAN-SPAM (15 U.S.C. § 7701 et seq.) requires every commercial/marketing
 * message to include a clear and conspicuous opt-out mechanism and a valid
 * physical postal address. This module is the single place that renders those
 * two elements so no marketing send can omit them.
 *
 * Usage: wrap the body of every *marketing* email with `renderMarketingEmail`.
 * Transactional messages (password reset, receipts, security alerts) are not
 * marketing and do not require an unsubscribe link, but they should still carry
 * the postal address where practical.
 *
 * The address comes from `LEGAL_ADDRESS`; set your registered business address
 * there before launch.
 */

import { LEGAL_ADDRESS, LEGAL_ENTITY, SUPPORT_EMAIL } from "@/lib/legal";

const MAX_URL = 2_048;

export type MarketingEmailFooter = {
  /** Per-recipient, one-click unsubscribe URL (required). */
  unsubscribeUrl: string;
  /** Overrides `LEGAL_ADDRESS` for this send. */
  address?: string;
};

export type MarketingEmail = MarketingEmailFooter & {
  /** Inner HTML for the message body. */
  bodyHtml: string;
  /** Plain-text body (recommended for deliverability). */
  bodyText: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Renders the required unsubscribe + postal address block (HTML and text). */
export function marketingEmailFooter(input: MarketingEmailFooter): {
  html: string;
  text: string;
} {
  const rawUrl = input.unsubscribeUrl.trim().slice(0, MAX_URL);
  const url = escapeHtml(rawUrl);
  const address = escapeHtml((input.address ?? LEGAL_ADDRESS).trim());
  const html = [
    `<hr />`,
    `<p>You are receiving this email because you have a ${escapeHtml(LEGAL_ENTITY)} account or opted in to product updates.</p>`,
    `<p><a href="${url}">Unsubscribe</a> from marketing emails at any time. You will still receive essential account and billing messages.</p>`,
    `<p>${escapeHtml(LEGAL_ENTITY)}<br />${address}</p>`,
    `<p>Questions? Contact <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a>.</p>`,
  ].join("\n");

  const text = [
    "",
    "---",
    `You are receiving this email because you have a ${LEGAL_ENTITY} account or opted in to product updates.`,
    `Unsubscribe: ${rawUrl}`,
    `${LEGAL_ENTITY}`,
    (input.address ?? LEGAL_ADDRESS).trim(),
    `Questions? ${SUPPORT_EMAIL}`,
  ].join("\n");

  return { html, text };
}

/**
 * Wraps a marketing body with the mandated footer. Throws when the unsubscribe
 * URL is missing so a misconfigured send fails loudly rather than shipping non
 * compliant mail.
 */
export function renderMarketingEmail(input: MarketingEmail): { html: string; text: string } {
  if (!input.unsubscribeUrl || !input.unsubscribeUrl.trim()) {
    throw new Error("Marketing emails require an unsubscribeUrl (CAN-SPAM).");
  }
  const footer = marketingEmailFooter(input);
  return {
    html: `${input.bodyHtml}\n${footer.html}`,
    text: `${input.bodyText}\n${footer.text}`,
  };
}
