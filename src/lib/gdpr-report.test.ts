import { describe, expect, it } from "vitest";

import {
  buildGdprReport,
  buildRemovalConfirmation,
  gdprReportToMarkdown,
  removalConfirmationToMarkdown,
  type GdprReportInput,
} from "@/lib/gdpr-report";

const base: GdprReportInput = {
  userId: "u-1",
  generatedAt: "2026-01-01T00:00:00.000Z",
  profile: { email: "ada@example.com", fullName: "Ada", createdAt: "2025-01-01", timezone: "UTC" },
  auth: { email: "ada@example.com", lastSignInAt: "2026-01-01", banned: false },
  roles: [],
  workspaces: [{ id: "w1", name: "Ada workspace", plan: "pro" }],
  counts: { projects: 2, jobs: 3, published: 1, socials: 1 },
  credits: { balance: 500, consumed: 100 },
  telemetry: { auditLogs: 4, securityEvents: 2, analyticsEvents: 9, errorIssues: 0 },
};

describe("buildGdprReport", () => {
  it("groups data into the expected sections", () => {
    const report = buildGdprReport(base);
    expect(report.sections.map((s) => s.id)).toEqual([
      "identity",
      "content",
      "billing",
      "security",
      "analytics",
      "errors",
    ]);
  });

  it("reports identity fields and workspace list", () => {
    const report = buildGdprReport(base);
    const identity = report.sections.find((s) => s.id === "identity")!;
    expect(identity.items).toContainEqual({ label: "Email", value: "ada@example.com" });
    const content = report.sections.find((s) => s.id === "content")!;
    expect(content.items).toContainEqual({ label: "Workspaces owned", value: "1" });
    expect(content.items.some((i) => i.label.includes("Ada workspace"))).toBe(true);
  });

  it("states card data is never held", () => {
    const report = buildGdprReport(base);
    const billing = report.sections.find((s) => s.id === "billing")!;
    expect(billing.items).toContainEqual({
      label: "Card data",
      value: "none held — processed by Stripe/PayPal",
    });
  });

  it("includes zero counts so absence is visible", () => {
    const report = buildGdprReport(base);
    const errors = report.sections.find((s) => s.id === "errors")!;
    expect(errors.items).toContainEqual({ label: "Error records", value: "0" });
  });

  it("falls back to auth email when the profile email is missing", () => {
    const report = buildGdprReport({ ...base, profile: { ...base.profile, email: null } });
    const identity = report.sections.find((s) => s.id === "identity")!;
    expect(identity.items).toContainEqual({ label: "Email", value: "ada@example.com" });
  });
});

describe("gdprReportToMarkdown", () => {
  it("renders a markdown document with every section heading", () => {
    const md = gdprReportToMarkdown(buildGdprReport(base));
    expect(md).toContain("# Data subject access report");
    expect(md).toContain(`**Subject (user id):** u-1`);
    expect(md).toContain("## Identity & account");
    expect(md).toContain("## Billing & credits");
    expect(md).toContain("_Retention:");
  });

  it("does not leak a raw IP anywhere (only hash language)", () => {
    const md = gdprReportToMarkdown(buildGdprReport(base));
    expect(md).toContain("salted hash");
  });
});

describe("buildRemovalConfirmation", () => {
  it("lists removed counts from the RPC summary", () => {
    const c = buildRemovalConfirmation({
      userId: "12345678-0000-0000-0000-000000000000",
      completedAt: "2026-02-01T00:00:00.000Z",
      summary: { owned_workspaces: 2, memberships: 1, security_events: 5, audit_logs: 9 },
    });
    expect(c.removed).toContainEqual({ label: "Workspaces deleted", value: 2 });
    expect(c.removed).toContainEqual({ label: "Security events de-identified", value: 5 });
  });

  it("always states the retained financial ledger", () => {
    const c = buildRemovalConfirmation({
      userId: "12345678-0000-0000-0000-000000000000",
      completedAt: "2026-02-01T00:00:00.000Z",
      summary: null,
    });
    expect(c.retained.some((r) => r.label === "payment_ledger")).toBe(true);
    expect(c.retained.some((r) => r.label === "payment_events")).toBe(true);
  });

  it("builds a stable reference id", () => {
    const c = buildRemovalConfirmation({
      userId: "12345678-0000-0000-0000-000000000000",
      completedAt: "2026-02-01T00:00:00.000Z",
      summary: null,
    });
    expect(c.header.reference).toBe("ERASURE-12345678-2026-02-01");
  });

  it("tolerates a missing summary (all zeros)", () => {
    const c = buildRemovalConfirmation({
      userId: "12345678-0000-0000-0000-000000000000",
      completedAt: "2026-02-01T00:00:00.000Z",
      summary: null,
    });
    expect(c.removed.every((r) => r.value === 0)).toBe(true);
  });

  it("renders markdown with removed and retained sections", () => {
    const md = removalConfirmationToMarkdown(
      buildRemovalConfirmation({
        userId: "12345678-0000-0000-0000-000000000000",
        completedAt: "2026-02-01T00:00:00.000Z",
        summary: { owned_workspaces: 1 },
      }),
    );
    expect(md).toContain("# Removal confirmation");
    expect(md).toContain("## Removed / de-identified");
    expect(md).toContain("## Deliberately retained");
    expect(md).toContain("payment_ledger");
  });
});
