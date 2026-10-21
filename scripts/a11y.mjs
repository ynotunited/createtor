/**
 * WCAG accessibility audit against the production build.
 *
 * Boots the built server (`.output/server/index.mjs`), fetches every public
 * marketing/auth route, parses the SSR HTML with jsdom and runs axe-core in
 * that document. Fails the build on any violation.
 *
 * Why jsdom: axe needs a DOM, not a browser. jsdom gives us the parsed SSR
 * markup without a real browser runtime. The trade-off is that rules needing a
 * layout engine cannot run here:
 *   - `color-contrast` is disabled (jsdom has no layout/paint). Contrast is
 *     covered by the token contrast analysis in `src/styles.css` instead.
 *
 * Usage:
 *   npm run build && node scripts/a11y.mjs
 *   node scripts/a11y.mjs --json
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { JSDOM } = require("jsdom");
const axe = require("axe-core");

const ROOT = path.resolve(import.meta.dirname, "..");
const ENTRY = path.join(ROOT, ".output", "server", "index.mjs");
const JSON_OUT = process.argv.includes("--json");

/** Public routes that must ship accessible markup. */
const ROUTES = [
  "/",
  "/features",
  "/how-it-works",
  "/pricing",
  "/results",
  "/about",
  "/contact",
  "/auth",
  "/legal",
  "/terms",
  "/privacy",
  "/cookies",
  "/refunds",
  "/compliance",
  "/acceptable-use",
  "/copyright",
];

/** Rules that require a real layout engine (jsdom cannot compute them). */
const DISABLED_RULES = ["color-contrast"];

/** WCAG tags to report on. */
const RUN_OPTIONS = {
  runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] },
  rules: Object.fromEntries(DISABLED_RULES.map((id) => [id, { enabled: false }])),
};

function fail(message) {
  console.error(`\x1b[31m✖ ${message}\x1b[0m`);
  process.exit(1);
}

if (!fs.existsSync(ENTRY)) {
  fail(`Missing build output at ${ENTRY}. Run \`npm run build\` first.`);
}

async function loadServer() {
  const mod = await import(pathToFileURL(ENTRY).href);
  const server = mod.default;
  const ctx = {
    waitUntil() {},
    passThroughOnException() {},
    context: { waitUntil() {} },
  };
  return (route) => server.fetch(new Request(`http://localhost${route}`), ctx);
}

async function auditRoute(fetchRoute, route) {
  const response = await fetchRoute(route);
  const status = response.status;
  if (status !== 200) {
    return { route, status, skipped: true, violations: [] };
  }
  const html = await response.text();
  const dom = new JSDOM(html, {
    url: `http://localhost${route}`,
    pretendToBeVisual: true,
    runScripts: "outside-only",
  });
  dom.window.eval(axe.source);
  const results = await dom.window.axe.run(dom.window.document, RUN_OPTIONS);
  dom.window.close();
  return { route, status, skipped: false, violations: results.violations };
}

function printViolations(violations) {
  for (const v of violations) {
    const nodes = v.nodes
      .slice(0, 4)
      .map((n) => `      ${n.target.join(" ")}`)
      .join("\n");
    const more = v.nodes.length > 4 ? `\n      … and ${v.nodes.length - 4} more` : "";
    console.log(`    • [${v.impact ?? "n/a"}] ${v.id}: ${v.help}`);
    console.log(`      ${v.helpUrl}`);
    console.log(`${nodes}${more}`);
  }
}

async function main() {
  const started = Date.now();
  const fetchRoute = await loadServer();
  let total = 0;
  let failed = 0;
  const report = [];

  for (const route of ROUTES) {
    const result = await auditRoute(fetchRoute, route);
    if (result.skipped) {
      console.log(`\x1b[33m- ${route} (HTTP ${result.status}, skipped)\x1b[0m`);
      report.push({ route, status: result.status, violations: [] });
      continue;
    }
    total += 1;
    if (result.violations.length > 0) {
      failed += 1;
      console.log(`\x1b[31m✖ ${route} — ${result.violations.length} violation(s)\x1b[0m`);
      printViolations(result.violations);
    } else {
      console.log(`\x1b[32m✓ ${route}\x1b[0m`);
    }
    report.push({ route, status: result.status, violations: result.violations });
  }

  const summary = {
    checked: total,
    failed,
    disabledRules: DISABLED_RULES,
    results: report,
  };
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "artifacts", "a11y.json"), JSON.stringify(summary, null, 2));

  if (JSON_OUT) console.log(JSON.stringify(summary, null, 2));

  console.log(
    `\n${total} routes audited — ${failed} with violations (${Date.now() - started}ms) [rules disabled: ${DISABLED_RULES.join(", ")}]`,
  );
  if (failed > 0) {
    console.log("Report: artifacts/a11y.json");
    fail(`${failed} route(s) have accessibility violations.`);
  }
  console.log("Accessibility audit passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
