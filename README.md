# CollabCanvas

A real-time collaborative canvas — a stripped-down Figma. Authenticated users share one
bounded 10,000 × 10,000 canvas, see each other's cursors live, and create and move
rectangles that sync between browsers in well under a second.

**Deployed:** <https://collabcanvas-pi.vercel.app/>
**Docs:** [ARCHITECTURE.md](ARCHITECTURE.md) · [PRD.md](PRD.md) · [TASKS.md](TASKS.md)

## Try it instantly

Three demo identities are printed on the sign-in screen and wired to one-click buttons.
Everything interesting about this project needs **two** people signed in at once, so:

| Name | Email | Password |
|---|---|---|
| Ada | `ada@demo.collabcanvas.invalid` | `demo1234` |
| Grace | `grace@demo.collabcanvas.invalid` | `demo1234` |
| Alan | `alan@demo.collabcanvas.invalid` | `demo1234` |

Open the URL, click **Ada**. Open a second browser — a different browser, or an incognito
window — and click **Grace**. You should see the other cursor move, labelled, within a
frame or two of it moving.

Those passwords are public on purpose. They guard three throwaway identities on a canvas
whose entire contents are shared with everyone signed in; treat them as usernames that
happen to need a second field. The accounts are **created on first use** — the first click
signs up if the account does not exist yet — so a fresh Firebase project needs no console
setup to make the demo work.

Sign-in is per tab, not per browser: a new tab starts signed out. That is deliberate, and
it is what lets one browser hold two identities — see the persistence note in
`src/services/firebase.ts`.

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

## Conflict resolution

The short version: **transactional last-write-wins, with a per-shape soft lock.** The long
version is the part that matters, because each half fixes something the other cannot.

### Every write is a transaction, never `updateDoc`

All shapes live in a single Firestore document, `canvas/global-canvas-v1`, as one array.
That makes a plain `updateDoc` actively dangerous: two users editing **different**
rectangles both write the whole array, and one of the two changes silently vanishes. So
every mutation is a `runTransaction` read-modify-write through
[`src/services/transactionService.ts`](src/services/transactionService.ts), and the
transaction bodies themselves are pure functions of the array in
[`src/utils/shapeOps.ts`](src/utils/shapeOps.ts) — Firestore re-runs a callback whenever
the document moves underneath it, so a body with a side effect in it runs an unpredictable
number of times.

That is what makes "two people drag two different rectangles simultaneously, both survive"
true rather than lucky.

### A soft lock, for the same rectangle

Last-write-wins is the wrong answer when two people grab the *same* rectangle: you get
oscillation, each client yanking the shape back toward its own pointer. So each shape
carries a `draggedBy` field, claimed transactionally on drag start and released in the
**same** transaction that commits the position — one write per drag, not two.

- A claim never steals. If the lock is held, the claim is refused, and the loser's shape
  stops following their pointer immediately. Clean lockout, not a tug of war.
- The lock is **authoritative, not advisory**. The Konva node's `draggable` prop is what a
  user feels, but it derives from state that can be briefly stale — so `commitPosition`
  itself refuses to write when someone else holds the lock. Without that, the loser of a
  contested grab still commits on release.
- Held shapes render with the holder's colour as an outline.

### Stale locks cannot outlive their owner

`draggedBy` lives in Firestore, which `onDisconnect` cannot reach — so a client that
crashes, loses power, or has its lid closed mid-drag would otherwise leave a rectangle
nobody can ever move again. The RTDB session node vanishing *is* the liveness signal:
[`canDrag`](src/utils/shapeLocks.ts) treats a lock whose holder has no live session as
free. A tab merely hidden mid-drag stays connected, so that case is handled separately, by
releasing the user's locks on `visibilitychange`.

### Two channels, because durability and smoothness want different things

An in-flight drag streams at 20 Hz to the dragging user's **RTDB session node**, never to
Firestore — 20 Hz of Firestore writes would exhaust the free tier's 20,000 writes/day in
about seventeen minutes of cumulative dragging. Remote clients render `session.drag` for a
shape if present and the committed Firestore value otherwise. Exactly one durable write
happens per drag, on release.

### What this design costs

One document means every write carries the whole array, so the array's size is the size of
every write. Measured: at ~1,456 shapes, two thirds of one user's drags were lost to
transaction contention. `MAX_SHAPES` caps the canvas at 4,000 — under Firestore's hard
1 MiB document ceiling — but drags get slow well before that. The fix, past MVP scale,
is a shapes *subcollection*, which changes the read arithmetic completely.

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
It is the one to run constantly. The modules under test were deliberately split out of
their services so the risks that are *invisible on localhost* — coordinate drift, echo
suppression, fail-open staleness filters, transaction-body purity — reduce to pure logic
that can be asserted in milliseconds instead of reproduced with two browsers.

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

Security rules deploy separately, straight to Firebase — and the committed files are the
source of truth, so a rule edited in the console will be overwritten by the next deploy:

```bash
firebase deploy --only firestore:rules,database
```

Tests are deliberately **not** a gate on deploy — deployment is itself a graded
requirement, so a red test must never block it (PRD R1).

## Status

The MVP is feature-complete: auth, presence, live cursors, shape creation, drag, and
transactional sync all work against the deployed URL. **Seed 500** and **Clear all** in the
toolbar drive the 500-object performance profile. What remains is PR 11 — the twenty-item
acceptance pass in PRD §7, run in fresh incognito windows against the deployed build. See
[TASKS.md](TASKS.md) for the per-PR record, including the bugs each verification pass
turned up.
