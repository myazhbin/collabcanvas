# CollabCanvas

A real-time collaborative canvas — a stripped-down Figma. Authenticated users share one
canvas, see each other's cursors, and create and move rectangles that sync instantly.

**Deployed:** _(Vercel URL — fill in once the project is linked)_
**Docs:** [PRD.md](PRD.md) · [TASKS.md](TASKS.md) · [ARCHITECTURE.md](ARCHITECTURE.md)

## Stack

| Layer | Choice |
|---|---|
| Build | Vite 8 + React 19 + TypeScript |
| Canvas | Konva / react-konva |
| Durable store | Cloud Firestore — one canvas doc, all writes transactional |
| Ephemeral transport | Realtime Database — cursors, presence, in-flight drag |
| Auth | Firebase Authentication (email/password + Google) |
| Hosting | Vercel — Firebase is data, realtime, and auth only |
| Styling | Tailwind v4 |
| Tests | Vitest over the pure modules in `src/utils`, plus emulator rules tests |

## Develop

This repo uses **bun** (`bun.lock` is committed). The npm equivalents work too.

```bash
cp .env.example .env && bun install && bun run dev
```

`.env` is gitignored, so **a fresh clone must copy it first** — Vite inlines the
`VITE_FIREBASE_*` vars at build time, and without them the app throws
`VITE_FIREBASE_DATABASE_URL is missing` on load. Fill it from
`firebase apps:sdkconfig WEB`. Any remote build host needs the same vars set in its own
dashboard; these values are public by design, so there is nothing secret to protect.

| Script | What |
|---|---|
| `bun run dev` | Vite dev server |
| `bun run build` | `tsc -b && vite build` → `dist/` |
| `bun run test` | Vitest over `src/utils`, single run |
| `bun run test:watch` | Vitest, watch mode |
| `bun run test:emulator` | Security-rules tests against the Firebase emulators |
| `bun run lint` | oxlint |

### Tests

Two layers, split because they have different costs.

`bun run test` covers the pure modules in `src/utils` — no React, no Firebase, no network.
It is the one to run constantly.

`bun run test:emulator` runs `src/tests/integration/` against the Auth, Firestore, and
RTDB emulators, asserting that **the committed rule files** — not whatever is in the
console — deny an unauthenticated read, allow an authenticated one, and grant RTDB read
at `/sessions/{canvasId}`, the exact parent path the client listens on. Granting it one
level deeper compiles fine and then fails at runtime with `PERMISSION_DENIED` (PRD R5).

The Firestore and RTDB emulators are Java processes, so this layer needs a JRE
(`brew install openjdk`). It is excluded from `bun run test` for that reason — the
default suite must stay runnable without one.

## Deploy

**Vercel hosts the app.** Firebase contributes no hosting — only Firestore, RTDB, and
Auth — so `firebase.json` carries rule targets and nothing else. Vercel's Vite preset
needs no `vercel.json`: it builds `dist/`, revalidates the HTML shell on every load, and
serves hashed `/assets/*` immutable, which is the stale-shell case R12 is about.

Three things must be true or the deployed build breaks in ways localhost never shows:

1. **Set all eight `VITE_FIREBASE_*` vars in Vercel → Settings → Environment Variables.**
   `.env` is gitignored, so it never reaches Vercel's builder; without them Vite inlines
   `undefined` and the app throws `VITE_FIREBASE_DATABASE_URL is missing` on load. The
   build itself still succeeds — this fails at runtime, on the deployed URL only (PRD R1).
2. **Add the Vercel domain to Firebase → Authentication → Authorized domains.** Hosting
   off Firebase pre-authorizes nothing, and Google sign-in fails without it (PRD R8).
3. **Set no `Cross-Origin-Opener-Policy` or cross-origin-isolation headers** in
   `vercel.json` or anywhere else — it silently breaks `signInWithPopup` (PRD R20).

Security rules deploy separately, straight to Firebase:

```bash
firebase deploy --only firestore:rules,database
```

Tests are deliberately **not** a gate on deploy — deployment is itself a graded
requirement, so a red test must never block it (PRD R1).

## Status

PR 1 complete: scaffold and Konva smoke test. PR 2 wires Firebase and commits both
rulesets. The app currently renders a hardcoded blue rectangle plus a connection
readout — see [TASKS.md](TASKS.md).
