# Third-party scripts and Content Security Policy

Createtor is deliberately same-origin. Everything the browser loads is either a
first-party bundle or a fetch to Supabase; the only external **script** is
Cloudflare Turnstile, and it runs on `/auth` alone. A strict Content Security
Policy enforces that shape, and a build-time scan fails the build if the
third-party surface grows without a deliberate decision.

## Audit: every external resource

| Host                                     | Purpose                                                     | Loaded by                                   | Where                                                                  |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| `challenges.cloudflare.com`              | Turnstile CAPTCHA widget script + its challenge requests    | **Browser** (only on `/auth`)               | `src/components/auth/Turnstile.tsx`, rendered at `src/routes/auth.tsx` |
| `VITE_SUPABASE_URL` (`*.supabase.co`)    | Supabase Auth/PostgREST/Storage from the browser            | **Browser** (every dashboard page)          | `src/integrations/supabase/client.ts`                                  |
| `checkout.stripe.com` / PayPal hosted    | Hosted checkout / approval                                  | **Browser** (full-page redirect, no script) | `src/routes/_dash/billing.tsx`                                         |
| `accounts.google.com`                    | Google OAuth (via Supabase)                                 | **Browser** (full-page redirect)            | `src/routes/auth.tsx`                                                  |
| Media rows (`*.supabase.co` or uploaded) | Video/audio/captions fetched with `crossOrigin="anonymous"` | **Browser**                                 | `src/components/studio/renderer.ts`                                    |

Server-only hosts the browser never reaches (SSR / Worker): `generativelanguage.googleapis.com`,
`api.groq.com`, `gen.pollinations.ai`, `image.pollinations.ai`, `openrouter.ai`,
`api.stripe.com`, `api-m.paypal.com`, `queue.fal.run`, and an optional Upstash
Redis host. These are `fetch` calls from `*.server.ts`, not browser resources, so
they are **not** in the CSP.

There are **no** analytics/marketing pixels, no Meta/GA/Hotjar/Segment/PostHog,
no fonts CDN (all fonts are self-hosted in `public/fonts`), no iframes, and no
embedded Stripe.js or PayPal SDK.

## Sensitive routes and third-party scripts

Sensitive routes carry no third-party scripts:

| Route class        | Files                                             | Third-party script    |
| ------------------ | ------------------------------------------------- | --------------------- |
| Auth               | `src/routes/auth.tsx`                             | Turnstile (by design) |
| Billing / payments | `src/routes/_dash/billing.tsx`, admin billing     | none                  |
| Creator studio     | `src/routes/_dash/*studio*`, `create-video`, etc. | none                  |
| Settings / account | `src/routes/_dash/settings.tsx`                   | none                  |
| Admin console      | `src/routes/admin/*`                              | none                  |

Turnstile is on `/auth` because it is the bot-protection gate for sign-in. Every
other sensitive page runs under `script-src 'self'` with no external origin.

## The policy

Built per-request in `src/lib/csp.server.ts` and attached to every response in
`src/server.ts`. It is strict by default and widens only where required:

- `default-src 'self'`, `script-src 'self'` — no external scripts anywhere.
- `script-src`/`frame-src` add `https://challenges.cloudflare.com` **only on
  `/auth`**.
- `connect-src` allows `'self'`, the Turnstile endpoint, and the Supabase origin
  (plus its `wss://` form); `img-src`/`media-src` add the Supabase origin and
  `data:`/`blob:` for generated media.
- `style-src 'self' 'unsafe-inline'` (React inline style props and the chart
  component emit inline CSS).
- `frame-ancestors 'self'` prevents the app from being embedded in any
  third-party frame.
- Violations are reported to `/api/csp-report`, which logs a bounded summary as a
  security event.

## Rollout

The header ships **report-only** by default, so a missed origin is observed
rather than breaking the page:

```
Content-Security-Policy-Report-Only: default-src 'self'; ...
```

Collect reports at `/api/csp-report` (viewable in the admin audit/security log),
confirm there are no violations across all routes, then set `CSP_ENFORCE=true` to
switch the identical policy to the enforcing header:

```
Content-Security-Policy: default-src 'self'; ...
```

## Keeping it clean

`npm run scan:third-party` (`scripts/scan-third-party.mjs`) fails the build if a
new external `<script src>`, analytics/marketing SDK, embedded payment SDK or
captcha script appears outside the allowlist. The allowlist is a single entry:
Turnstile in `src/components/auth/Turnstile.tsx`. It runs as part of
`npm run check`.

To add a legitimate third-party script: add it to the allowlist with a reason,
confirm it does **not** load on a sensitive route, and add its host to
`script-src` in `src/lib/csp.server.ts` (scoped to the routes that need it, not
globally).
