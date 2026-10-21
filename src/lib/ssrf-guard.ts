/**
 * Server-side request forgery (SSRF) guard for stored upstream base URLs.
 *
 * An administrator can point the AI / image / TTS gateways at a custom base URL.
 * That URL is fetched from the server (with the provider API key attached), so
 * an unrestricted value could be used to reach internal metadata endpoints,
 * loopback services or the private network. There is no legitimate reason for a
 * public model gateway to live on a private host, so those are refused outright.
 */

/** Hostnames that always resolve to the local machine or a reserved zone. */
const BLOCKED_HOST_SUFFIXES = [".local", ".localhost", ".internal", ".home.arpa"];

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return false;
  const octets = parts.map((p) => Number(p));
  if (octets.some((n) => n > 255)) return false;
  const [a, b] = octets as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  // Unique local (fc00::/7) and link-local (fe80::/10).
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9")) return true;
  if (normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  // IPv4-mapped addresses. `new URL` normalises these to hex, e.g.
  // "::ffff:127.0.0.1" becomes "::ffff:7f00:1"; both forms are decoded here.
  const mappedDotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (mappedDotted?.[1]) return isPrivateIpv4(mappedDotted[1]);
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
  if (mappedHex?.[1] && mappedHex[2]) {
    const high = parseInt(mappedHex[1], 16);
    const low = parseInt(mappedHex[2], 16);
    const ipv4 = `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`;
    return isPrivateIpv4(ipv4);
  }
  return false;
}

/**
 * Validates an admin-supplied upstream base URL. Throws a descriptive error
 * when the URL is not `https:` or points at a private/loopback/link-local host.
 * Returns the parsed URL so callers can normalise before storing.
 */
export function assertSafeUpstreamBaseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That base URL is not a valid URL.");
  }

  if (url.protocol !== "https:") {
    throw new Error("The base URL must use https://.");
  }

  const host = url.hostname.toLowerCase();
  if (host === "localhost" || BLOCKED_HOST_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new Error("The base URL must not point at a local or private host.");
  }
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new Error("The base URL must not point at a private or loopback address.");
  }

  return url;
}
