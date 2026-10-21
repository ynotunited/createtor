/**
 * Privacy defaults for client-side observation.
 *
 * Session replay (DOM recording / heatmaps / click tracking) is OFF by default
 * and there is no replay SDK in this codebase. If one is ever introduced it must
 * be gated on `SESSION_REPLAY.enabled` and honour the masking flags here.
 *
 * Product analytics never read form fields. As a further guarantee, every event
 * property is passed through `maskEventProps`, which drops anything whose key
 * looks like a secret or personal datum and discards non-primitive values, so a
 * password, email, token, OTP or card value cannot be captured by accident.
 */

export const SESSION_REPLAY = {
  /** Replay is opt-in only; leave false unless a documented decision says otherwise. */
  enabled: false,
  /** Mask every form field in any future replay. */
  maskAllInputs: true,
  /** Never mask body text by default (would break replay usefulness); opt in per screen. */
  maskAllText: false,
  /** Add `ph-no-capture` to elements that must never be recorded. */
  blockClass: "ph-no-capture",
} as const;

/**
 * Keys that look sensitive are never sent. Deliberately broad: false positives
 * (dropping a harmless prop) are preferable to leaking a credential.
 */
const SENSITIVE_KEY =
  /pass|secret|token|otp|card|cvv|cvc|ssn|auth|cookie|credential|email|phone|url|key|name/i;

export type AnalyticsPropValue = string | number | boolean;

const MAX_PROP_STRING = 120;

/**
 * Returns a copy of `props` containing only non-sensitive primitive values.
 * Non-primitive values (objects/arrays) are dropped rather than serialized, and
 * long strings are truncated. Returns undefined when nothing survives.
 */
export function maskEventProps(
  props: Record<string, unknown> | undefined,
): Record<string, AnalyticsPropValue> | undefined {
  if (!props) return undefined;
  const out: Record<string, AnalyticsPropValue> = {};
  for (const [key, value] of Object.entries(props)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (typeof value === "string") out[key] = value.slice(0, MAX_PROP_STRING);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
