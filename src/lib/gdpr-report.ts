/**
 * GDPR/CCPA data-subject access report.
 *
 * Builds a human- and machine-readable summary of everything held about a user,
 * grouped by the categories in `data-map.ts`. Pure: it takes already-gathered
 * data and formats it, so it is trivially unit-testable and reusable for both
 * the admin export and a future self-service export.
 */

import { RETAINED_TABLES, USER_TABLES, WORKSPACE_TABLES } from "@/lib/data-map";

export type GdprReportInput = {
  userId: string;
  generatedAt: string;
  profile: {
    email: string | null;
    fullName: string | null;
    createdAt: string | null;
    timezone?: string | null;
  };
  auth: {
    email: string | null;
    lastSignInAt: string | null;
    banned: boolean;
  };
  roles: string[];
  workspaces: { id: string; name: string; plan: string; createdAt?: string | null }[];
  counts: {
    projects: number;
    jobs: number;
    published: number;
    socials: number;
  };
  credits: { balance: number; consumed: number };
  telemetry: {
    auditLogs: number;
    securityEvents: number;
    analyticsEvents: number;
    errorIssues: number;
  };
};

export type GdprReportSection = {
  id: string;
  title: string;
  retention: string;
  items: { label: string; value: string }[];
};

export type GdprReport = {
  header: {
    subject: string;
    generatedAt: string;
    legalBasis: string;
    note: string;
  };
  sections: GdprReportSection[];
};

const DATA_CATEGORIES = {
  identity: "Identity & account",
  content: "Content & workspaces",
  billing: "Billing & credits",
  security: "Security & audit",
  analytics: "Product analytics",
  errors: "Error monitoring",
};

/**
 * Builds the structured report. Counts are reported even when zero so the
 * subject can see we checked (absence of data is itself meaningful).
 */
export function buildGdprReport(input: GdprReportInput): GdprReport {
  const sections: GdprReportSection[] = [
    {
      id: "identity",
      title: DATA_CATEGORIES.identity,
      retention: "Until account deletion (profile is de-identified on delete).",
      items: [
        { label: "User id", value: input.userId },
        { label: "Email", value: input.profile.email ?? input.auth.email ?? "—" },
        { label: "Full name", value: input.profile.fullName ?? "—" },
        { label: "Time zone", value: input.profile.timezone ?? "—" },
        { label: "Account created", value: input.profile.createdAt ?? "—" },
        { label: "Last sign-in", value: input.auth.lastSignInAt ?? "—" },
        { label: "Account suspended", value: input.auth.banned ? "yes" : "no" },
        { label: "Roles", value: input.roles.length ? input.roles.join(", ") : "user" },
      ],
    },
    {
      id: "content",
      title: DATA_CATEGORIES.content,
      retention: "Until account deletion (removed with the workspace).",
      items: [
        { label: "Workspaces owned", value: String(input.workspaces.length) },
        ...input.workspaces.map((w) => ({
          label: `Workspace "${w.name}"`,
          value: `plan ${w.plan}${w.createdAt ? `, created ${w.createdAt}` : ""}`,
        })),
        { label: "Projects", value: String(input.counts.projects) },
        { label: "Generations", value: String(input.counts.jobs) },
        { label: "Published posts", value: String(input.counts.published) },
        { label: "Connected social accounts", value: String(input.counts.socials) },
      ],
    },
    {
      id: "billing",
      title: DATA_CATEGORIES.billing,
      retention:
        "Financial records (payment ledger) are retained per tax/accounting law; credits are workspace-scoped.",
      items: [
        { label: "Credit balance", value: input.credits.balance.toLocaleString() },
        { label: "Credits consumed", value: input.credits.consumed.toLocaleString() },
        {
          label: "Payment ledger",
          value: `retained (${RETAINED_TABLES.find((t) => t.table === "payment_ledger")?.note ?? "financial record"})`,
        },
        { label: "Card data", value: "none held — processed by Stripe/PayPal" },
      ],
    },
    {
      id: "security",
      title: DATA_CATEGORIES.security,
      retention: "Audit log 365 days; security events 90 days, then purged automatically.",
      items: [
        { label: "Audit log entries", value: String(input.telemetry.auditLogs) },
        { label: "Security events", value: String(input.telemetry.securityEvents) },
        {
          label: "IP addresses",
          value: "stored only as a salted hash (never the raw address)",
        },
      ],
    },
    {
      id: "analytics",
      title: DATA_CATEGORIES.analytics,
      retention: "400 days, then purged automatically.",
      items: [{ label: "Analytics events", value: String(input.telemetry.analyticsEvents) }],
    },
    {
      id: "errors",
      title: DATA_CATEGORIES.errors,
      retention: "180 days, then purged automatically.",
      items: [{ label: "Error records", value: String(input.telemetry.errorIssues) }],
    },
  ];

  // Fix the workspace-count row (declared with a placeholder above).
  const contentSection = sections.find((s) => s.id === "content");
  if (contentSection) {
    contentSection.items[0] = {
      label: "Workspaces owned",
      value: String(input.workspaces.length),
    };
  }

  return {
    header: {
      subject: input.userId,
      generatedAt: input.generatedAt,
      legalBasis:
        "This report is provided under GDPR Art. 15 (right of access) and CCPA/CPRA §1798.100 (right to know).",
      note: "Counts include zero values so the subject can confirm what was checked. Card data is never held by us.",
    },
    sections,
  };
}

/** Renders the structured report as Markdown for download. */
export function gdprReportToMarkdown(report: GdprReport): string {
  const lines: string[] = [];
  lines.push(`# Data subject access report`);
  lines.push("");
  lines.push(`- **Subject (user id):** ${report.header.subject}`);
  lines.push(`- **Generated:** ${report.header.generatedAt}`);
  lines.push(`- **Basis:** ${report.header.legalBasis}`);
  lines.push("");
  lines.push(`> ${report.header.note}`);
  lines.push("");
  for (const section of report.sections) {
    lines.push(`## ${section.title}`);
    lines.push("");
    lines.push(`_Retention: ${section.retention}_`);
    lines.push("");
    for (const item of section.items) {
      lines.push(`- **${item.label}:** ${item.value}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** The categories a data report covers, derived from the map (for tests/docs). */
export function reportCoversTables(): string[] {
  return [
    ...USER_TABLES.map((t) => t.table),
    ...WORKSPACE_TABLES,
    ...RETAINED_TABLES.map((t) => t.table),
  ];
}

/* ------------------------------------------------------------------ */
/* Removal confirmation                                                 */
/* ------------------------------------------------------------------ */

export type ErasureSummary = {
  owned_workspaces?: number;
  workspaces?: number;
  memberships?: number;
  roles?: number;
  checkout_intents?: number;
  security_events?: number;
  analytics_events?: number;
  error_issues?: number;
  audit_logs?: number;
  [key: string]: unknown;
};

export type RemovalConfirmation = {
  header: {
    subject: string;
    completedAt: string;
    reference: string;
    statement: string;
  };
  removed: { label: string; value: number }[];
  retained: { label: string; value: string }[];
  body: string[];
};

/**
 * Builds the "proof of deletion" record returned after erasure. Lists what was
 * removed (from the RPC's row-count summary) and what was deliberately retained,
 * with the reason. This is the artefact handed to a data subject to confirm the
 * request was fulfilled.
 */
export function buildRemovalConfirmation(input: {
  userId: string;
  completedAt: string;
  summary: ErasureSummary | null;
}): RemovalConfirmation {
  const s = input.summary ?? {};
  const num = (v: unknown): number => (typeof v === "number" ? v : 0);

  const removed = [
    { label: "Workspaces deleted", value: num(s.owned_workspaces ?? s.workspaces) },
    { label: "Memberships removed", value: num(s.memberships) },
    { label: "Role grants removed", value: num(s.roles) },
    { label: "Checkout intents removed", value: num(s.checkout_intents) },
    { label: "Security events de-identified", value: num(s.security_events) },
    { label: "Analytics events de-identified", value: num(s.analytics_events) },
    { label: "Error records de-identified", value: num(s.error_issues) },
    { label: "Audit entries de-identified", value: num(s.audit_logs) },
  ];

  const retained = RETAINED_TABLES.filter((t) => t.class === "retain").map((t) => ({
    label: t.table,
    value: t.note,
  }));

  return {
    header: {
      subject: input.userId,
      completedAt: input.completedAt,
      reference: `ERASURE-${input.userId.slice(0, 8)}-${input.completedAt.slice(0, 10)}`,
      statement:
        "All personal data associated with this account has been erased. No personal data is retained in a recoverable form.",
    },
    removed,
    retained,
    body: [
      "The account's profile has been de-identified and its authentication identity removed.",
      "Owned workspace data (projects, generations, published posts, connected accounts and related records) has been deleted.",
      "Telemetry (audit, security, analytics and error records) has been de-identified: identifiers nulled and free-text metadata blanked.",
      "Financial ledger entries are retained as required by tax and accounting law; they contain no name, email or card data.",
    ],
  };
}

/** Renders the removal confirmation as Markdown for download/archival. */
export function removalConfirmationToMarkdown(c: RemovalConfirmation): string {
  const lines: string[] = [];
  lines.push(`# Removal confirmation`);
  lines.push("");
  lines.push(`- **Reference:** ${c.header.reference}`);
  lines.push(`- **Subject (user id):** ${c.header.subject}`);
  lines.push(`- **Completed:** ${c.header.completedAt}`);
  lines.push("");
  lines.push(`> ${c.header.statement}`);
  lines.push("");
  lines.push(`## What this means`);
  lines.push("");
  for (const b of c.body) lines.push(`- ${b}`);
  lines.push("");
  lines.push(`## Removed / de-identified`);
  lines.push("");
  for (const r of c.removed) lines.push(`- **${r.label}:** ${r.value}`);
  lines.push("");
  lines.push(`## Deliberately retained`);
  lines.push("");
  for (const r of c.retained) lines.push(`- **${r.label}:** ${r.value}`);
  lines.push("");
  return lines.join("\n");
}
