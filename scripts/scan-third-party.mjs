#!/usr/bin/env node
/**
 * Third-party script guard.
 *
 * The app is deliberately same-origin: the only external script is Cloudflare
 * Turnstile, and only on the `/auth` page. This scan fails the build if a new
 * external script, analytics/marketing SDK, embedded payment SDK or captcha
 * script appears outside the explicit allowlist below, so the small
 * third-party surface cannot silently grow.
 *
 * It scans source files (not node_modules or build output) for external script
 * URLs and known SDK signatures. Only hosts/patterns matter, never values.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
// Also check the raw HTML we ship (service worker offline page).
const EXTRA_FILES = [join(ROOT, "public", "offline.html"), join(ROOT, "public", "sw.js")];

/**
 * Allowed third-party script: Cloudflare Turnstile, loaded only in this file.
 * Anything else external must be added here deliberately, with a reason.
 */
const ALLOWLIST = [
  {
    file: join("src", "components", "auth", "Turnstile.tsx"),
    host: "challenges.cloudflare.com",
  },
];

const SCRIPT_URL = /<script[^>]+src\s*=\s*["'](https?:\/\/[^"']+)["']/gi;
const ANY_SCRIPT_SRC = /src\s*=\s*["'](https?:\/\/[^"']+)["']/gi;

/** Known third-party SDK / analytics signatures that must never appear. */
const SDK_SIGNATURES = [
  { name: "google-analytics", re: /googletagmanager\.com|google-analytics\.com|\bgtag\(|\bga\(/ },
  { name: "meta-pixel", re: /connect\.facebook\.net|\bfbq\(/ },
  { name: "hotjar", re: /static\.hotjar\.com|\bhj\(/ },
  { name: "mixpanel", re: /cdn\.mixpanel\.com|mixpanel\.init/ },
  { name: "segment", re: /cdn\.segment\.com|analytics\.load\(/ },
  { name: "posthog", re: /posthog\.com|posthog\.init/ },
  { name: "clarity", re: /clarity\.ms/ },
  { name: "sentry-cdn", re: /browser\.sentry-cdn\.com/ },
  { name: "plausible", re: /plausible\.io/ },
  { name: "stripe-js", re: /js\.stripe\.com|@stripe\/stripe-js/ },
  { name: "paypal-sdk", re: /paypalobjects\.com|paypal\.com\/sdk/ },
  { name: "recaptcha", re: /google\.com\/recaptcha|gstatic\.com\/recaptcha/ },
  { name: "font-cdn", re: /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net/ },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx?|jsx?|html)$/.test(name)) out.push(full);
  }
  return out;
}

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

const files = [...walk(SRC), ...EXTRA_FILES].filter((f) => {
  try {
    return statSync(f).isFile();
  } catch {
    return false;
  }
});

const findings = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    // External script src attributes.
    for (const re of [SCRIPT_URL, ANY_SCRIPT_SRC]) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(line)) !== null) {
        const host = hostOf(match[1]);
        if (!host) continue;
        const allowed = ALLOWLIST.some(
          (a) => rel.split(sep).join("/").endsWith(a.file.split(sep).join("/")) && host === a.host,
        );
        if (!allowed) {
          findings.push({ file: rel, line: i + 1, reason: `external script host "${host}"` });
        }
      }
    }

    // Known SDK signatures (skip comment lines).
    if (!line.trim().startsWith("//") && !line.trim().startsWith("*")) {
      for (const sig of SDK_SIGNATURES) {
        if (sig.re.test(line)) {
          findings.push({ file: rel, line: i + 1, reason: `third-party SDK: ${sig.name}` });
        }
      }
    }
  }
}

if (findings.length > 0) {
  // De-duplicate identical file:line:reason rows.
  const seen = new Set();
  console.error("Third-party script scan failed. Disallowed external scripts or SDKs found:\n");
  for (const f of findings) {
    const key = `${f.file}:${f.line}:${f.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    console.error(`  ${f.file}:${f.line}  ${f.reason}`);
  }
  console.error(
    "\nThird-party scripts expand the attack and privacy surface. If one is truly " +
      "needed, add it to the ALLOWLIST in scripts/scan-third-party.mjs with a reason, " +
      "and confirm it does not load on sensitive routes (auth, billing, studio, settings).",
  );
  process.exit(1);
}

console.log(
  `Third-party script scan passed: ${files.length} file(s) checked, no disallowed external scripts.`,
);
