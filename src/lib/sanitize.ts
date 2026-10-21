/**
 * Input sanitisation helpers.
 *
 * These exist for the few places where user text is interpolated into a
 * *structured query string* rather than passed as a bound value. Supabase's
 * PostgREST API builds filters from a small grammar, so a raw search term
 * containing grammar characters (`,`, `(`, `)`, `"`, `\`) can inject extra
 * conditions or break the query. Everything else in the app is parameterised
 * (`.eq`, `.ilike` values, `.rpc`), which SQL-injection-safe.
 */

/** Characters PostgREST treats as grammar inside an `or=(...)` filter. */
const POSTGREST_GRAMMAR = /[",()\\]/g;
/** Unicode "control" category (C0/C1 controls), expressed without escapes. */
const CONTROL_CHARS = /\p{Cc}/gu;

/**
 * Makes a free-text term safe to interpolate into a PostgREST `or=(...)`
 * filter. Grammar characters and control characters are removed, whitespace is
 * collapsed and the result is capped. LIKE wildcards are intentionally kept so
 * search still behaves like search — they are values, not grammar.
 *
 * Returns an empty string when nothing usable remains; callers should then skip
 * the filter entirely rather than query for `%%`.
 */
export function sanitizePostgrestOrTerm(input: string, maxLength = 200): string {
  return input
    .replace(CONTROL_CHARS, " ")
    .replace(POSTGREST_GRAMMAR, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
