#!/usr/bin/env node
/**
 * Client-bundle secret leak check (build-output assertion).
 *
 * Runs after `build` and asserts that none of the real secret values from the
 * local `.env` appear anywhere in the built client output (`.output/public`).
 * `scan-secrets.mjs` matches credential *shapes*; this compares against the
 * actual configured values, so it catches a leak even for a token whose shape
 * the pattern rules do not recognise.
 *
 * Only server-only variables are checked (a `VITE_`-prefixed value is public by
 * definition and is skipped). Short values are ignored to avoid false matches.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const CLIENT_BUNDLE = join(ROOT, ".output", "public");

/** Env names whose values must never appear in the client bundle. */
const SERVER_SECRET_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "PAYPAL_CLIENT_SECRET",
  "GOOGLE_AI_API_KEY",
  "GROQ_API_KEY",
  "POLLINATIONS_TOKEN",
  "API_SIGNING_SECRET",
  "OPENROUTER_API_KEY",
];

function readEnvValues() {
  const values = [];
  for (const name of readdirSync(ROOT)) {
    if (!name.startsWith(".env") || name.endsWith(".example")) continue;
    const full = join(ROOT, name);
    let content;
    try {
      if (!statSync(full).isFile()) continue;
      content = readFileSync(full, "utf8");
    } catch {
      continue;
    }
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed
        .slice(0, eq)
        .replace(/^export\s+/, "")
        .trim();
      if (!SERVER_SECRET_KEYS.includes(key)) continue;
      const value = trimmed
        .slice(eq + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (value.length >= 16) values.push({ key, value });
    }
  }
  return values;
}

function collectBundleFiles(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) collectBundleFiles(join(dir, entry.name), out);
    else if (entry.isFile()) out.push(join(dir, entry.name));
  }
}

let bundleExists = false;
try {
  bundleExists = statSync(CLIENT_BUNDLE).isDirectory();
} catch {
  bundleExists = false;
}

if (!bundleExists) {
  console.error(
    `Client-bundle check skipped: ${relative(ROOT, CLIENT_BUNDLE)} not found. Run \`npm run build\` first.`,
  );
  process.exit(1);
}

const secrets = readEnvValues();
if (secrets.length === 0) {
  console.log("Client-bundle check passed: no server secret values configured to compare.");
  process.exit(0);
}

const files = [];
collectBundleFiles(CLIENT_BUNDLE, files);

const findings = [];
for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "latin1");
  } catch {
    continue;
  }
  for (const secret of secrets) {
    if (content.includes(secret.value)) {
      findings.push({ key: secret.key, file: relative(ROOT, file) });
    }
  }
}

if (findings.length > 0) {
  console.error("Client-bundle leak check FAILED. Server secrets found in the client build:\n");
  for (const finding of findings) {
    console.error(`  ${finding.key}  ->  ${finding.file}`);
  }
  console.error(
    "\nA server-only module is being bundled into the browser. Move the secret behind " +
      "a `.server.ts` boundary or a server function.",
  );
  process.exit(1);
}

console.log(
  `Client-bundle check passed: ${files.length} file(s) scanned, ${secrets.length} server secret(s) not exposed.`,
);
