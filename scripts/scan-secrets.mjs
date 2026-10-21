#!/usr/bin/env node
/**
 * Secret scanner.
 *
 * Fails the build if a credential-shaped string appears anywhere in source,
 * config, docs, or the built client bundle (`.output/public`). Matching the
 * client bundle specifically is what catches the dangerous case: a server-only
 * module accidentally getting pulled into browser code, which would expose the
 * value to anyone who opens devtools.
 *
 * Rule of thumb for thresholds: real keys are long and random, so require
 * enough characters that human-written placeholders (`sk_live_.`,
 * `whsec_...`) and test fixtures (`whsec_test_secret`) do not match.
 *
 * It prints only the rule name and file:line, never the matched text.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();

/** Extra trees to scan only when present (the build output). */
const CLIENT_BUNDLE = join(".output", "public");

/** Directory names never descended into. */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".wrangler",
  ".tanstack",
  "dist",
  ".output",
  "coverage",
]);

/** Files that are secrets by design or too noisy to be worth scanning. */
const EXCLUDED_FILES = new Set([".env", "package-lock.json", "bun.lock", ".DS_Store"]);

/** Only text-like files are scanned (keeps binary noise out). */
const ALLOWED_EXTENSIONS = [
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".ts",
  ".tsx",
  ".json",
  ".md",
  ".mdx",
  ".html",
  ".css",
  ".sql",
  ".yml",
  ".yaml",
  ".toml",
  ".txt",
];

const RULES = [
  { name: "supabase-service-role", re: /sb_secret_[A-Za-z0-9_-]{20,}/g },
  { name: "stripe-secret-key", re: /\bsk_(?:test|live)_[A-Za-z0-9]{20,}/g },
  { name: "stripe-webhook-secret", re: /\bwhsec_[A-Za-z0-9]{20,}/g },
  { name: "groq-api-key", re: /\bgsk_[A-Za-z0-9]{20,}/g },
  { name: "openai-style-key", re: /\bsk-[A-Za-z0-9_-]{20,}/g },
  { name: "misc-sk-token", re: /\bsk_[A-Za-z0-9]{28,}/g },
  { name: "google-api-key", re: /AIza[0-9A-Za-z_-]{35}/g },
  { name: "google-oauth-token", re: /AQ\.[A-Za-z0-9_-]{20,}/g },
  { name: "aws-access-key-id", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { name: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/g },
  { name: "slack-token", re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "private-key-block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
];

/** Known-benign path + rule pairs (kept tiny and explicit). */
const ALLOWLIST = [
  { path: "stripe.server.test.ts", rule: "stripe-webhook-secret" },
  { path: "stripe.server.test.ts", rule: "misc-sk-token" },
];

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot);
}

function isScannable(name) {
  if (EXCLUDED_FILES.has(name)) return false;
  if (name === ".env.example") return true;
  if (name.endsWith(".log")) return false;
  return ALLOWED_EXTENSIONS.includes(extensionOf(name));
}

function collectFiles(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      collectFiles(join(dir, entry.name), out);
    } else if (entry.isFile() && isScannable(entry.name)) {
      out.push(join(dir, entry.name));
    }
  }
}

function allowed(relativePath, rule) {
  const normalized = relativePath.split(sep).join("/");
  return ALLOWLIST.some((entry) => normalized.endsWith(entry.path) && entry.rule === rule);
}

const roots = ["src", "public", "docs", "supabase", ".github", ".lovable"].map((dir) =>
  join(ROOT, dir),
);
roots.push(join(ROOT, CLIENT_BUNDLE)); // no-op if the build has not run yet
roots.push(ROOT); // root-level config files (depth-limited below)

const files = [];
for (const root of roots) {
  let stats;
  try {
    stats = statSync(root);
  } catch {
    continue;
  }
  if (stats.isDirectory()) {
    collectFiles(root, files);
  } else if (stats.isFile() && isScannable(root)) {
    files.push(root);
  }
}

const unique = [...new Set(files)];
const findings = [];

for (const file of unique) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  const lines = content.split(/\r?\n/);
  const relativePath = relative(ROOT, file);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      if (!rule.re.test(line)) continue;
      if (allowed(relativePath, rule.name)) continue;
      findings.push({ rule: rule.name, file: relativePath, line: i + 1 });
    }
  }
}

if (findings.length > 0) {
  console.error("Secret scan failed. Potential credentials found:\n");
  for (const finding of findings) {
    console.error(`  [${finding.rule}] ${finding.file}:${finding.line}`);
  }
  console.error(
    `\n${findings.length} finding(s). Move the value to a server-only environment variable, ` +
      "or add a narrow entry to ALLOWLIST in scripts/scan-secrets.mjs if it is a false positive.",
  );
  process.exit(1);
}

console.log(`Secret scan passed: ${unique.length} files checked, no credentials found.`);
