# CollabCanvas

A real-time collaborative canvas — a stripped-down Figma. Authenticated users share one
canvas, see each other's cursors, and create and move rectangles that sync instantly.

**Deployed:** https://collabcanvas-60c5b.web.app
**Docs:** [PRD.md](PRD.md) · [TASKS.md](TASKS.md) · [ARCHITECTURE.md](ARCHITECTURE.md)

## Stack

| Layer | Choice |
|---|---|
| Build | Vite 8 + React 19 + TypeScript |
| Canvas | Konva / react-konva |
| Durable store | Cloud Firestore — one canvas doc, all writes transactional |
| Ephemeral transport | Realtime Database — cursors, presence, in-flight drag |
| Auth | Firebase Authentication (email/password + Google) |
| Hosting | Firebase Hosting |
| Styling | Tailwind v4 |
| Tests | Vitest over the pure modules in `src/utils` |

## Develop

This repo uses **bun** (`bun.lock` is committed). The npm equivalents work too.

```bash
bun install
bun run dev
```

| Script | What |
|---|---|
| `bun run dev` | Vite dev server |
| `bun run build` | `tsc -b && vite build` → `dist/` |
| `bun run test` | Vitest, single run |
| `bun run test:watch` | Vitest, watch mode |
| `bun run lint` | oxlint |

## Deploy

Firebase Hosting serves `dist/` with an SPA rewrite.

`firebase.json` sets `Cache-Control: no-cache` on `**` and then re-grants a long
immutable cache to `/assets/**`. Two Hosting behaviours make that phrasing load-bearing,
both verified against the live site:

1. **Header globs match the request path, not the resolved file.** `**/*.html` — the
   obvious phrasing — leaves `/` on Hosting's default `max-age=3600`, and `/` is exactly
   what a visitor loads. Same for every SPA deep route. That stale shell references purged
   hashed assets, so the symptom is a white screen, not an old version (PRD R12).
2. **On overlapping globs the last match wins.** The `/assets/**` rule must come *after*
   the catch-all, or the catch-all overrides it.

Beyond `Cache-Control` the config sets **no headers at all**: a
`Cross-Origin-Opener-Policy` block silently breaks `signInWithPopup` (PRD R20).

```bash
bun run build && firebase deploy --only hosting
```

Tests are deliberately **not** a gate on deploy — deployment is itself a graded
requirement, so a red test must never block it (PRD R1).

## Status

PR 1 complete: scaffold, Konva smoke test, hosting config. The app currently renders a
single hardcoded blue rectangle. Feature work starts at PR 2 — see [TASKS.md](TASKS.md).
