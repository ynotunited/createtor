/**
 * Time-zone aware scheduling.
 *
 * Every automated communication in the product (the daily queue, scheduled
 * posts, reminders) is defined in a *wall-clock* schedule -- "Monday at 09:00" --
 * owned by a user who lives somewhere. Stored without a time zone those times
 * are ambiguous, and a 09:00 post goes out at the wrong hour for anyone who is
 * not in the server's zone, or slips by an hour when daylight saving changes.
 *
 * These helpers turn "09:00 in America/New_York on Mondays" into an exact UTC
 * instant, correctly across DST boundaries, using the platform's own IANA
 * database via `Intl`. No dependencies.
 */

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export interface Schedule {
  /** Weekdays the schedule fires on, e.g. ["Mon", "Thu"]. */
  days: readonly string[];
  /** Wall-clock times in "HH:mm", e.g. ["09:00", "18:00"]. */
  times: readonly string[];
  /** IANA time zone, e.g. "Africa/Lagos". */
  timezone: string;
}

const DEFAULT_TIMEZONE = "UTC";

/** True when the runtime recognises the IANA zone. */
export function isValidTimeZone(timezone: unknown): timezone is string {
  if (typeof timezone !== "string" || timezone.length === 0 || timezone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The visitor's IANA time zone from the platform. Safe on server and client;
 * falls back to UTC when unavailable (older runtimes, locked-down browsers).
 */
export function detectTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(zone) ? zone : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function normalizeTimeZone(timezone: unknown): string {
  return isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE;
}

/** A sorted, de-duplicated list of IANA zones for pickers, when the runtime has it. */
export function listTimeZones(): string[] {
  const supportedValuesOf = (Intl as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
  try {
    const zones = supportedValuesOf?.("timeZone");
    if (zones && zones.length > 0) return zones;
  } catch {
    /* fall through */
  }
  return [DEFAULT_TIMEZONE];
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function formatterFor(timezone: string): Intl.DateTimeFormat {
  let formatter = partsCache.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsCache.set(timezone, formatter);
  }
  return formatter;
}

export interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
  weekday: Weekday;
  dayIndex: number; // 0 = Sunday
}

/** Break a UTC instant down into its wall-clock components in `timezone`. */
export function toZonedParts(instant: Date | number, timezone: string): ZonedParts {
  const date = instant instanceof Date ? instant : new Date(instant);
  const parts = formatterFor(timezone).formatToParts(date);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") lookup[part.type] = part.value;
  }
  const year = Number(lookup["year"]);
  const month = Number(lookup["month"]);
  const day = Number(lookup["day"]);
  const dayIndex = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return {
    year,
    month,
    day,
    hour: Number(lookup["hour"]),
    minute: Number(lookup["minute"]),
    second: Number(lookup["second"]),
    weekday: WEEKDAYS[dayIndex]!,
    dayIndex,
  };
}

/** Offset of `timezone` from UTC, in milliseconds, at a given instant. */
function zoneOffsetMs(instantMs: number, timezone: string): number {
  const parts = toZonedParts(instantMs, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const aligned = Math.floor(instantMs / 1000) * 1000;
  return asUtc - aligned;
}

/**
 * Convert a wall-clock time in `timezone` to the exact UTC instant.
 *
 * Two passes handle DST: the first guess may land on the wrong side of a
 * transition, so the offset is re-read at the candidate instant. Times that do
 * not exist (the skipped hour) resolve forward; ambiguous times take the first
 * occurrence, which is what users expect from a scheduler.
 */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string,
): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const firstGuess = target - zoneOffsetMs(target, timezone);
  const secondGuess = target - zoneOffsetMs(firstGuess, timezone);
  return new Date(secondGuess);
}

function parseTime(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function scheduledDayIndexes(days: readonly string[]): Set<number> {
  const indexes = new Set<number>();
  for (const day of days) {
    const index = (WEEKDAYS as readonly string[]).indexOf(day);
    if (index !== -1) indexes.add(index);
  }
  return indexes;
}

/**
 * The first instant strictly after `after` that matches the schedule, or `null`
 * when the schedule is empty / has no valid times or days.
 */
export function nextRunAfter(after: Date | number, schedule: Schedule): Date | null {
  const timezone = schedule.timezone;
  if (!isValidTimeZone(timezone)) return null;

  const dayIndexes = scheduledDayIndexes(schedule.days);
  if (dayIndexes.size === 0) return null;
  const times = schedule.times
    .map(parseTime)
    .filter((t): t is { hour: number; minute: number } => t !== null);
  if (times.length === 0) return null;

  const afterMs = (after instanceof Date ? after : new Date(after)).getTime();
  const start = toZonedParts(afterMs, timezone);

  let best: number | null = null;
  // An 8-day window is always enough to reach the next matching weekday, with
  // slack for a DST shift.
  for (let offset = 0; offset <= 7; offset += 1) {
    const base = new Date(Date.UTC(start.year, start.month - 1, start.day + offset));
    const weekday = base.getUTCDay();
    if (!dayIndexes.has(weekday)) continue;
    const year = base.getUTCFullYear();
    const month = base.getUTCMonth() + 1;
    const day = base.getUTCDate();
    for (const time of times) {
      const instant = zonedTimeToUtc(year, month, day, time.hour, time.minute, timezone).getTime();
      if (instant > afterMs && (best === null || instant < best)) best = instant;
    }
    // The earliest matching day wins; later days can only be later.
    if (best !== null) break;
  }

  return best === null ? null : new Date(best);
}

/** The next `count` run instants, ascending. Stops early on an empty schedule. */
export function nextRuns(after: Date | number, schedule: Schedule, count = 3): Date[] {
  const runs: Date[] = [];
  let cursor = after instanceof Date ? after : new Date(after);
  for (let i = 0; i < count; i += 1) {
    const next = nextRunAfter(cursor, schedule);
    if (!next) break;
    runs.push(next);
    cursor = next;
  }
  return runs;
}

/** Format an instant in the schedule's time zone for display. */
export function formatInTimeZone(
  instant: Date | number,
  timezone: string,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short" },
  locale = "en-US",
): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  return new Intl.DateTimeFormat(locale, {
    timeZone: normalizeTimeZone(timezone),
    ...options,
  }).format(date);
}
