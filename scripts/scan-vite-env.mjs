#!/usr/bin/env node
/**
 * Vite env-prefix guard.
 *
 * Vite inlines every `VITE_*` variable into the client bundle at build time. So
 * if a secret is ever accidentally named with a `VITE_` prefix, it is silently
 * shipped to every browser. This scan reads the local `.env*` files and fails
 * when a `VITE_`-prefixed variable either:
 *   - has a name that reads like a secret (SECRET, TOKEN, PASSWORD, PRIVATE,
 *     SERVICE_ROLE, API_KEY, WEBHOOK), or
 *   - has a value that matches a known credential shape (sb_secret_, sk_,
 *     whsec_, gsk_, AIza, PRIVATE KEY block).
 *
 * It prints variable names and file:line, never values.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

const SECRET_NAME = /(SECRET|TOKEN|PASSWORD|PRIVATE|SERVICE_ROLE|API_KEY|WEBHOOK|CREDENTIAL)/i;
const SECRET_VALUE = [
  { name: "supabase-service-role", re: /sb_secret_[A-Za-z0-9_-]{10,}/ },
  { name: "stripe-secret-key", re: /\bsk_(?:test|live)_[A-Za-z0-9]{10,}/ },
  { name: "stripe-webhook-secret", re: /\bwhsec_[A-Za-z0-9]{10,}/ },
  { name: "groq-api-key", re: /\bgsk_[A-Za-z0-9]{10,}/ },
  { name: "openai-style-key", re: /\bsk-[A-Za-z0-9_-]{10,}/ },
  { name: "google-api-key", re: /AIza[0-9A-Za-z_-]{20,}/ },
  { name: "private-key-block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

/** Find `.env`, `.env.*` at the repo root (skip `.env.example`, which is docs). */
function envFiles() {
  const out = [];
  for (const name of readdirSync(ROOT)) {
    if (!name.startsWith(".env")) continue;
    if (name.endsWith(".example")) continue;
    const full = join(ROOT, name);
    try {
      if (statSync(full).isFile()) out.push(full);
    } catch {
      /* ignore */
    }
  }
  return out;
}

const findings = [];

for (const file of envFiles()) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split(/\r?\n/);
  const relativePath = relative(ROOT, file);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line
      .slice(0, eq)
      .replace(/^export\s+/, "")
      .trim();
    if (!key.startsWith("VITE_")) continue;
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");

    if (SECRET_NAME.test(key)) {
      findings.push({ file: relativePath, line: i + 1, key, reason: "secret-shaped name" });
      continue;
    }
    for (const rule of SECRET_VALUE) {
      if (rule.re.test(value)) {
        findings.push({
          file: relativePath,
          line: i + 1,
          key,
          reason: `credential-shaped value (${rule.name})`,
        });
        break;
      }
    }
  }
}

if (findings.length > 0) {
  console.error("Vite env scan failed. A `VITE_`-prefixed variable looks like a secret:\n");
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line}  ${finding.key}  (${finding.reason})`);
  }
  console.error(
    "\n`VITE_*` variables are inlined into the client bundle and sent to browsers. " +
      "Rename the variable without the `VITE_` prefix so it stays server-only.",
  );
  process.exit(1);
}

console.log(
  `Vite env scan passed: ${envFiles().length} env file(s) checked, no secret-shaped VITE_ vars.`,
);
