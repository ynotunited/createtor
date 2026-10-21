# Createtor

AI video creation platform: scripting, storyboarding, voiceover, and rendering
for creators and small businesses.

## Development

You need Node.js (v22+) and npm.

```sh
npm i
cp .env.example .env   # then fill in the values
npm run dev            # http://localhost:8080
```

Stop the dev server before running `npm run build` (the dev client bundle and the
production build share `.output/`).

## Verification

```sh
npm run check   # typecheck, lint, tests, build, a11y, e2e, scans
```

Individual steps: `npm run typecheck`, `npm run lint`, `npm run test`,
`npm run build`, `npm run test:a11y`, `npm run test:e2e`.

## Stack

- TanStack Start (Vite + Nitro, Cloudflare target)
- TypeScript, React 19, Tailwind CSS v4
- Supabase (Postgres, Auth, Storage)
- Drizzle migrations under `drizzle/` (see `docs/migrations.md`)

## Docs

- `docs/migrations.md` - applying database migrations
- `docs/data-map.md` - data cascade and retention model
- `docs/oauth-hardening.md` - Google sign-in hardening checklist
- `docs/third-party-scripts.md` - external scripts and CSP
