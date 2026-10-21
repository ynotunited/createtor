/**
 * Lightweight web application firewall (WAF) for the request layer.
 *
 * Runs on every request the Worker handles, before routing. It blocks the
 * high-signal, low-false-positive attacks that reach an application server:
 * path traversal, null bytes, obvious SQL injection, XSS probes, command
 * injection, disallowed methods, oversized bodies and absurd URLs. Body content
 * is never read (streaming request bodies must reach the handler intact), so
 * the rule set deliberately inspects only the URL and a few headers.
 *
 * This complements, and does not replace, the platform edge WAF (Cloudflare
 * dashboard) which can do IP reputation and managed OWASP rules. Keeping a copy
 * in-app means protection still holds in local dev and on any host.
 */

export type WafVerdict = { action: "allow" } | { action: "block"; status: number; reason: string };

const ALLOWED_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);

/** Reject URLs longer than this outright. */
const MAX_URL_LENGTH = 2_048;
/** Reject declared request bodies larger than this (10 MiB). */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Attack signatures. Kept deliberately tight: each pattern needs a distinctive
 * token so ordinary queries ("how to select from a list") are never blocked.
 */
const ATTACK_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: "path_traversal", re: /(^|[/\\.])\.\.([/\\]|%2f|%5c)|%2e%2e([/\\]|%2f|%5c)/i },
  {
    name: "sql_injection",
    re: /(union[\s/*]+select|information_schema|or\s+1\s*=\s*1|'\s*or\s*'|sleep\s*\(|benchmark\s*\(|drop\s+table|insert\s+into|xp_cmdshell)/i,
  },
  { name: "xss_probe", re: /(<script|<\/script|javascript:|onerror\s*=|onload\s*=)/i },
  { name: "command_injection", re: /(\$\(|\|\s*(nc|wget|curl)\b|;\s*(wget|curl|nc)\b)/i },
];

/**
 * Inspects a request and returns a verdict. Never throws and never reads the
 * body. `allow` lets the request proceed untouched.
 */
export function inspectRequest(request: Request): WafVerdict {
  const method = request.method.toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    return { action: "block", status: 405, reason: "method_not_allowed" };
  }

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return { action: "block", status: 400, reason: "bad_url" };
  }

  const target = `${url.pathname}${url.search}`;
  if (target.length > MAX_URL_LENGTH) {
    return { action: "block", status: 414, reason: "url_too_long" };
  }

  let decoded: string;
  try {
    // `+` means space in query strings; normalise before decoding so patterns
    // like "union select" are caught regardless of the encoding used.
    decoded = decodeURIComponent(target.replace(/\+/g, " "));
  } catch {
    return { action: "block", status: 400, reason: "bad_encoding" };
  }

  // Percent-encoded or literal null bytes truncate strings in naive downstream
  // parsers; check the decoded form so both "%00" and a raw NUL are caught.
  if (decoded.includes("\u0000")) {
    return { action: "block", status: 400, reason: "null_byte" };
  }

  for (const pattern of ATTACK_PATTERNS) {
    if (pattern.re.test(decoded)) {
      return { action: "block", status: 403, reason: pattern.name };
    }
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return { action: "block", status: 413, reason: "body_too_large" };
  }

  return { action: "allow" };
}
