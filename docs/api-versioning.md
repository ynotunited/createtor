# API versioning, deprecation and request signing

Createtor's HTTP API is versioned in the path, deprecation is announced in
headers, and machine callers can authenticate with an HMAC signature instead of
a browser session.

## Surface

| Path                     | Version | Status     | Notes                                     |
| ------------------------ | ------- | ---------- | ----------------------------------------- |
| `/api/v1/health`         | `v1`    | current    | liveness probe                            |
| `/api/v1/generate-image` | `v1`    | current    | image generation (session or signature)   |
| `/api/health`            | `v0`    | deprecated | same behaviour as `v1`, removal scheduled |
| `/api/generate-image`    | `v0`    | deprecated | same behaviour as `v1`, removal scheduled |
| `/api/payments/stripe`   | —       | excluded   | verified with Stripe's own signature      |
| `/api/payments/paypal`   | —       | excluded   | verified with PayPal's own signature      |

Payment webhooks are excluded on purpose: they are provider callbacks with
their own signature schemes, not a public API surface, and they never carry
version headers.

## Negotiation

Order of precedence:

1. **Path** — `/api/v1/…` means `v1`. An unknown segment (`/api/v2/…`) is `404`.
2. **Header** — `Accept-Version: 1` (or the JSON-friendly alias `api-version`)
   selects a version. `*` and `latest` mean "whatever this path serves".
   - versioned path + different version → `406 Not Acceptable`
   - unversioned path + a versioned version (`v1`) → `406` with a
     `Link: </api/v1>; rel="successor-version"` header pointing at the right path
   - unparseable value → `406`
3. **Default** — no header on an unversioned path → `v0` (deprecated).

Error bodies are JSON: `{ "error": "<human readable>" }`, plus
`X-API-Latest-Version` and `Link` when a successor exists. Unknown API paths
(any `/api/…` that matches no route, including unknown version segments) hit a
splat catch-all that returns the same JSON 404 instead of the HTML error page.

## Response headers

Every API response carries:

| Header                 | Meaning                                    |
| ---------------------- | ------------------------------------------ |
| `X-API-Version`        | version actually served (`v1`, `v0`)       |
| `X-API-Latest-Version` | current version (`v1`)                     |
| `Vary: Accept-Version` | response depends on the negotiation header |

Deprecated versions additionally carry:

| Header        | Value                                          |
| ------------- | ---------------------------------------------- |
| `Deprecation` | `true`                                         |
| `Sunset`      | IMF-fixdate after which the version is removed |
| `Link`        | `</api/v1>; rel="successor-version"`           |
| `Warning`     | `299 - "This API version is deprecated…"`      |

## Lifecycle

1. **Current** — shipped under `/api/vN`, no lifecycle headers.
2. **Deprecated** — still served unchanged, but every response announces
   `Deprecation`, a concrete `Sunset` date and the successor path. Docs and
   changelog are updated the same day.
3. **Removed** — after `Sunset`, the path returns `410 Gone` with a link to the
   successor. Nothing is removed inside the announced window.

The unversioned surface (`v0`) is in step 2 since 2026-10-20 with
`Sunset: Sun, 20 Oct 2027 00:00:00 GMT`. The constant lives in
`src/lib/api-versioning.server.ts` (`LEGACY_SUNSET_AT`) — bump it there, in
`.env.example` notes and in the changelog together.

## Machine authentication

Browser traffic signs in with Supabase (`Authorization: Bearer <session jwt>`).
Server-to-server callers may instead sign the request with a shared key:

```
X-Key-Id:     <key id from API_SIGNING_KEYS>
X-Timestamp:  <unix seconds, ±5 min>
X-Nonce:      <8-64 url-safe chars, unique per request>
X-Signature:  hex HMAC-SHA256 of
              METHOD \n path?query \n timestamp \n nonce \n sha256(body)
```

Acceptance rules:

- either a complete signature set **or** a bearer token, never neither
- unknown key id → `401`, bad signature → `401`, stale timestamp → `401`
- replayed nonce inside the 10-minute window → `409`
- replay store or key configuration unavailable → `503` (fail closed)

Configure keys with `API_SIGNING_KEYS="kid1:secret1,kid2:secret2"` (one key per
integration so a single one can be rotated) or `API_SIGNING_SECRET` for one
implicit `default` key. Secrets must be at least 16 characters. Rotate by
adding a new pair, updating the caller, then deleting the old pair.

Example:

```bash
TS=$(date +%s); NONCE=$(openssl rand -hex 16)
BODY='{"prompt":"a rocket launch","workspaceId":"<uuid>"}'
SIG=$(printf 'POST\n/api/v1/generate-image\n%s\n%s\n%s' \
  "$TS" "$NONCE" "$(printf %s "$BODY" | sha256sum | cut -d' ' -f1)" \
  | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

curl -sS -X POST "$BASE/api/v1/generate-image" \
  -H "Content-Type: application/json" \
  -H "X-Key-Id: $KEY_ID" -H "X-Timestamp: $TS" -H "X-Nonce: $NONCE" \
  -H "X-Signature: $SIG" -d "$BODY"
```

## Adding `v2`

1. Add `"v2"` to `API_VERSIONS` and a `v2` entry to `API_VERSION_DESCRIPTORS`
   in `src/lib/api-versioning.server.ts`.
2. Set `LATEST_API_VERSION` to `"v2"`.
3. Retire `v1` in the same edit: give its descriptor
   `status: "deprecated"`, a `sunsetAt` and `successorPath: "/api/v2"`. Every
   response header follows from that table — no route changes needed.
4. Create `src/routes/api/v2/…` handlers (copy `v1`, change behaviour only).
5. Update this document and the changelog.
