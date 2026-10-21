import { describe, expect, it } from "vitest";

import {
  detectTimeZone,
  formatInTimeZone,
  isValidTimeZone,
  normalizeTimeZone,
  nextRunAfter,
  nextRuns,
  toZonedParts,
  zonedTimeToUtc,
} from "./schedule";

describe("isValidTimeZone", () => {
  it("accepts IANA zones", () => {
    expect(isValidTimeZone("Africa/Lagos")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects junk", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone("x".repeat(80))).toBe(false);
  });
});

describe("normalizeTimeZone / detectTimeZone", () => {
  it("falls back to UTC for invalid input", () => {
    expect(normalizeTimeZone("nope")).toBe("UTC");
    expect(normalizeTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it("detectTimeZone always returns a valid zone", () => {
    expect(isValidTimeZone(detectTimeZone())).toBe(true);
  });
});

describe("zonedTimeToUtc", () => {
  it("converts wall-clock time to the correct UTC instant", () => {
    // New York is UTC-5 in winter.
    expect(zonedTimeToUtc(2026, 1, 15, 9, 0, "America/New_York").getTime()).toBe(
      Date.UTC(2026, 0, 15, 14, 0),
    );
    // ... and UTC-4 in summer.
    expect(zonedTimeToUtc(2026, 7, 15, 9, 0, "America/New_York").getTime()).toBe(
      Date.UTC(2026, 6, 15, 13, 0),
    );
    // India is a half-hour zone with no DST.
    expect(zonedTimeToUtc(2026, 1, 15, 9, 0, "Asia/Kolkata").getTime()).toBe(
      Date.UTC(2026, 0, 15, 3, 30),
    );
    // UTC is identity.
    expect(zonedTimeToUtc(2026, 1, 15, 9, 0, "UTC").getTime()).toBe(Date.UTC(2026, 0, 15, 9, 0));
  });
});

describe("nextRunAfter", () => {
  it("finds the next matching weekday", () => {
    // Thu 15 Jan 2026 10:00Z -> next Monday 19 Jan 2026 09:00Z.
    const next = nextRunAfter(Date.UTC(2026, 0, 15, 10, 0), {
      days: ["Mon"],
      times: ["09:00"],
      timezone: "UTC",
    });
    expect(next?.getTime()).toBe(Date.UTC(2026, 0, 19, 9, 0));
  });

  it("is strictly after the reference instant", () => {
    const next = nextRunAfter(Date.UTC(2026, 0, 19, 9, 0), {
      days: ["Mon"],
      times: ["09:00"],
      timezone: "UTC",
    });
    expect(next?.getTime()).toBe(Date.UTC(2026, 0, 26, 9, 0));
  });

  it("picks the earliest time that is still ahead", () => {
    const next = nextRunAfter(Date.UTC(2026, 0, 19, 12, 0), {
      days: ["Mon"],
      times: ["09:00", "18:00"],
      timezone: "UTC",
    });
    expect(next?.getTime()).toBe(Date.UTC(2026, 0, 19, 18, 0));
  });

  it("is correct across the spring-forward transition", () => {
    // US DST starts Sun 8 Mar 2026; 09:00 is then EDT (UTC-4).
    const next = nextRunAfter(Date.UTC(2026, 2, 7, 0, 0), {
      days: ["Sun"],
      times: ["09:00"],
      timezone: "America/New_York",
    });
    expect(next?.getTime()).toBe(Date.UTC(2026, 2, 8, 13, 0));
  });

  it("is correct across the fall-back transition", () => {
    // US DST ends Sun 1 Nov 2026; 09:00 is then EST (UTC-5).
    const next = nextRunAfter(Date.UTC(2026, 9, 31, 0, 0), {
      days: ["Sun"],
      times: ["09:00"],
      timezone: "America/New_York",
    });
    expect(next?.getTime()).toBe(Date.UTC(2026, 10, 1, 14, 0));
  });

  it("returns null for empty or invalid schedules", () => {
    expect(nextRunAfter(Date.now(), { days: [], times: ["09:00"], timezone: "UTC" })).toBeNull();
    expect(nextRunAfter(Date.now(), { days: ["Mon"], times: [], timezone: "UTC" })).toBeNull();
    expect(
      nextRunAfter(Date.now(), { days: ["Mon"], times: ["09:00"], timezone: "Mars" }),
    ).toBeNull();
    expect(
      nextRunAfter(Date.now(), { days: ["Funday"], times: ["09:00"], timezone: "UTC" }),
    ).toBeNull();
  });
});

describe("nextRuns", () => {
  it("returns consecutive weekly instants", () => {
    const runs = nextRuns(Date.UTC(2026, 0, 15, 10, 0), {
      days: ["Mon"],
      times: ["09:00"],
      timezone: "UTC",
    });
    expect(runs.map((d) => d.getTime())).toEqual([
      Date.UTC(2026, 0, 19, 9, 0),
      Date.UTC(2026, 0, 26, 9, 0),
      Date.UTC(2026, 1, 2, 9, 0),
    ]);
  });
});

describe("toZonedParts / formatInTimeZone", () => {
  it("reports the wall clock and weekday in the target zone", () => {
    const parts = toZonedParts(Date.UTC(2026, 0, 19, 14, 0), "America/New_York");
    expect(parts.hour).toBe(9);
    expect(parts.dayIndex).toBe(1);
    expect(parts.weekday).toBe("Mon");
  });

  it("formats an instant in the given zone", () => {
    const text = formatInTimeZone(Date.UTC(2026, 0, 19, 14, 0), "America/New_York", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    });
    expect(text).toContain("09:00");
    expect(text).toMatch(/EST|GMT-5/);
  });
});
