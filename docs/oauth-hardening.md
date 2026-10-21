# OAuth hardening checklist (Google sign-in)

Making "Continue with Google" safe comes down to three things: an exact
allowlisted redirect, a verified `state`, and minimum scopes. The code side is
already done (`src/lib/oauth.ts` and `flowType: "pkce"` in the Supabase client).
This checklist is the **console** side, which is what actually enforces the lock.

Replace `<project-ref>` with your Supabase project ref and `createtor.xyz` with
your real domain throughout.

---

## 0. Environment

Set in the app environment (and in Cloudflare Worker vars for production):

```
VITE_OAUTH_REDIRECT_URL="https://createtor.xyz/auth"
```

Leave it unset locally so dev falls back to `http://localhost:8080/auth`.

---

## 1. Google Cloud Console - redirect URI + scopes

**APIs & Services -> Credentials -> OAuth 2.0 Client IDs -> (your web client)**

1. **Authorized JavaScript origins** - add the app origin only:
   - `https://createtor.xyz`
   - `http://localhost:8080` (dev)

2. **Authorized redirect URIs** - add the **Supabase** callback. Google sends the
   user to Supabase, which then returns them to the app, so the app URL is NOT a
   Google redirect URI:
   - `https://<project-ref>.supabase.co/auth/v1/callback`

   No wildcards. Google rejects them, and a wildcard is the exact hole we are
   closing.

3. **OAuth consent screen -> Scopes** - keep only:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`

   Remove any Drive, Calendar, Contacts, Gmail, or Sheets scopes. If they are not
   on the consent screen, they cannot be requested.

4. **Publishing status** - keep in "Testing" with only your own test users until
   launch, then publish. Verification is required before sensitive scopes.

---

## 2. Supabase - URL allowlist (the real gate)

**Authentication -> URL Configuration**

1. **Site URL**: `https://createtor.xyz`

2. **Redirect URLs** (allowlist) - add each exact URL, no trailing wildcards:
   - `https://createtor.xyz/auth`
   - `http://localhost:8080/auth` (dev only)

   Supabase refuses any `redirectTo` not on this list, so this is what stops an
   attacker redirecting the callback to a host they control.

3. **Authentication -> Providers -> Google** - enable it, paste the Google
   **Client ID** and **Client Secret**, and confirm the callback shown matches the
   redirect URI from step 1.2 exactly.

---

## 3. Where state and PKCE come from

- `state` is generated and verified **by Supabase Auth** as part of the PKCE
  flow. The client uses `flowType: "pkce"` (`src/integrations/supabase/client.ts`),
  which creates a per-attempt code challenge/verifier and checks `state` on
  return. Do not hand-roll `state`; doing so would break Supabase's verification.
- The app sends a **fixed** `redirectTo` from `resolveOAuthRedirect()`
  (`src/lib/oauth.ts`) instead of a drifting `window.location.origin` value.

---

## 4. Verify it is enforced

1. In Supabase logs, confirm the OAuth request carries `code_challenge`.
2. Temporarily add an off-list `redirectTo` in code and confirm Supabase rejects
   it. Revert after.
3. Sign in with Google end to end and confirm you land back on `/auth` and then
   route to the correct landing path (admin -> console, user -> dashboard).

---

## 5. Scopes the app must never request

Asserted by `src/lib/oauth.test.ts`: `drive`, `calendar`, `contacts`, `gmail`,
`sheets`. Any of these appearing in `OAUTH_SCOPES` fails the test.
