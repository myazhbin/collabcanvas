# CollabCanvas — Product Requirements Document (MVP)

**Status:** Draft for review
**Scope:** MVP checkpoint only (hard gate)
**Backend:** Firebase — Cloud Firestore (durable) + Realtime Database (ephemeral)
**Canonical architecture:** [ARCHITECTURE.md](ARCHITECTURE.md)
**Last updated:** 2026-07-28

---

## 1. Overview

CollabCanvas is a real-time collaborative canvas — a stripped-down Figma. Multiple
authenticated users share a single canvas, see each other's cursors, and create and
move rectangles that sync instantly across all sessions.

The MVP is not a feature deliverable. It is a **proof that the collaborative
foundation is solid**. Per the brief: *"A simple canvas with bulletproof multiplayer
is worth more than a feature-rich canvas with broken sync."* Shape variety, styling, and
polish come after sync is bulletproof, never before.

### The gate (from the brief, verbatim)

| # | Requirement | Where it's covered |
|---|---|---|
| 1 | Basic canvas with pan/zoom | F1 |
| 2 | At least one shape type | F2 |
| 3 | Ability to create and move objects | F2, F3 |
| 4 | Real-time sync between 2+ users | F4 |
| 5 | Multiplayer cursors with name labels | F5 |
| 6 | Presence awareness (who's online) | F6 |
| 7 | User authentication (accounts/names) | F7 |
| 8 | Deployed and publicly accessible | F9 |

Nothing outside this table ships before all eight are green.

---

## 2. User Stories

### 2.1 Visitor (unauthenticated)

- As a visitor, I want to land on the app and immediately understand what it is, so I
  know why I'm being asked to sign in.
- As a visitor, I want to create an account with an email and password in under 30
  seconds, so I can get to the canvas without friction.
- As a visitor, I want the option to sign in with Google in one click, so I can skip
  inventing a password entirely.
- As a visitor, I want to pick a display name during signup, so other users see a
  human label on my cursor instead of a UUID or raw email.
- As a visitor, I want a demo account I can use instantly, so I can see the thing work
  before deciding to sign up.
- As a visitor, I should not be able to see or modify canvas contents until I'm
  authenticated.

### 2.2 Collaborator (authenticated, primary user)

This is the user the entire MVP is built for.

- As a collaborator, I want to pan and zoom around a large canvas smoothly, so the
  workspace feels spacious rather than cramped.
- As a collaborator, I want to click on the canvas to drop a rectangle, so I can put
  content down quickly.
- As a collaborator, I want to select a shape and drag it to a new position, so I can
  arrange my work.
- As a collaborator, I want to delete a shape I no longer want.
- As a collaborator, I want to see other users' cursors move in real time with their
  names attached, so collaboration feels live rather than turn-based.
- As a collaborator, I want shapes created or moved by others to appear on my canvas
  near-instantly, so we don't collide or duplicate work.
- As a collaborator, I want to see when someone else is holding a shape, so we don't
  fight over the same rectangle.
- As a collaborator, I want a visible list of who is currently on the canvas, so I
  know who I'm working with before I touch anything.
- As a collaborator, I want my own edits to feel instantaneous regardless of network
  latency, so the tool never feels laggy.
- As a collaborator, if my connection drops, I want it to reconnect on its own and
  resync without me refreshing or losing work.

### 2.3 Returning collaborator

- As a returning user, I want to log in and find the canvas exactly as we left it,
  including shapes created by other people while I was away.
- As a returning user, I want a mid-session refresh to restore full canvas state, so a
  reload is never destructive.

### 2.4 Evaluator / grader

Explicitly modeled, because this user determines whether the project passes.

- As an evaluator, I want to open the deployed URL in two different browsers, sign in
  as two users, and see both cursors and both users' edits sync live.
- As an evaluator, I want to refresh one browser mid-edit and confirm state persists.
- As an evaluator, I want to create and drag many shapes rapidly and see sync keep up
  without stalling or dropping objects.
- As an evaluator, I want to sign up with a throwaway account without hitting an email
  confirmation wall, a rate limit, or an invite gate.
- As an evaluator, I want to sign in with Google without seeing an "unverified app"
  warning or a 403.

> **Design implication:** signup must work on the first try, for 5+ unfamiliar users,
> in an unfamiliar browser. Most of §5 exists to protect this path.

---

## 3. MVP Feature Requirements

### F1 — Canvas with pan & zoom `[GATE]`
- Bounded workspace of **5,000 × 5,000 px** world space. Not infinite; should feel spacious.
- Pan: space-drag, middle-mouse drag, or trackpad two-finger scroll.
- Zoom: scroll wheel / pinch, zoom-to-cursor, clamped to ~10%–400%.
- 60 FPS during pan/zoom.
- Viewport transform is **local-only** — never synced.

### F2 — Shape creation `[GATE]`
- **Rectangle is the only shape type in the MVP.** No circles, no lines, no text.
- Toolbar with two modes: Select and Rectangle.
- **Click-to-place:** a single click in Rectangle mode drops a fixed-size rectangle
  (~120 × 80) centered on the click point. No drag-to-size gesture.
- New shapes get a fill cycled from a small preset palette.
- After placing, the tool returns to Select mode and the new shape is selected.
- A placement only fires if the pointer moved <5 px between down and up **and** the
  event target is the empty stage background. Without both guards, finishing a pan drops
  a phantom rectangle and clicking an existing shape stacks one on top. See R13.
- Shape record, stored as an element of the `shapes` array on the canvas document:
  `{ id, x, y, w, h, fill, createdBy, updatedAt, updatedBy, draggedBy }`

### F3 — Selection & movement `[GATE]`
- Click a shape to select; visible selection outline.
- Drag to move. Click empty canvas to deselect.
- Delete/Backspace removes the selected shape.
- Movement is optimistic: the Konva node updates immediately, the network confirms after.
- **Not in MVP:** resize, rotate, multi-select, group.

### F4 — Real-time object sync `[GATE]`
Two channels, because the durable store and the drag stream have opposite cost profiles.

**Durable — Firestore `canvas/global-canvas-v1`:**
- Create, delete, and the **committed** position after a drag release.
- **Every write goes through `runTransaction`.** The shapes array lives in one document,
  so a plain `updateDoc` of the whole array means two users editing *different* rectangles
  clobber each other — last write wins on the entire document, and one user's change simply
  vanishes. The per-shape lock does not help here; it only guards the same shape. See R23.
- Listener: `onSnapshot` on the single document. It returns the **whole array** every time,
  so the client must diff it against previous state rather than replacing wholesale. See R7.
- Propagates to all connected clients in **<100ms**.

**In-flight drag — RTDB `/sessions/global-canvas-v1/{sessionId}`:**
- While dragging, throttled position updates at ~20 Hz go to the session node alongside the
  cursor, **not** to Firestore. Remote clients render the in-flight position from there.
- On release, one transactional Firestore write commits the final position and the drag
  field is cleared.
- Rationale in §4.2 — streaming drag deltas to Firestore exhausts the free write quota in
  roughly 17 minutes of cumulative dragging.

**Both channels:**
- Ignore inbound updates for any shape the local user is actively dragging, or your own
  echo fights your pointer and the rectangle rubber-bands. See R6.
- **Soft locking:** `draggedBy: uid` set on dragstart, cleared on dragend, with an
  `onDisconnect` on the session node so a crashed client can't lock a shape forever. Other
  users cannot drag a held shape, and it renders with a colored outline. See R10.
- **Conflict resolution: last-write-wins at the shape level**, enforced by transaction so
  the array itself is never clobbered. Plain LWW is *not* adequate alone — two users
  dragging one rectangle produces continuous oscillation, not a rare self-correcting jump.
  The `draggedBy` lock is what makes LWW acceptable.

### F5 — Multiplayer cursors `[GATE]`
- Every other connected user's cursor renders with their display name in a colored label.
- Cursor color derived deterministically from uid, stable across sessions.
- Published to `/sessions/global-canvas-v1/{sessionId}` — the **same node** as presence, so
  cursor and identity share one listener and one lifecycle.
- **Keyed by a per-tab `sessionId`, with `uid` as a field** — never keyed by uid. See R2.
- **World coordinates**, via `stage.getRelativePointerPosition()`. Screen coordinates
  drift the moment anyone pans, which is exactly what an evaluator does. See R3.
- Rendered as **absolutely-positioned DOM elements in an overlay above the Konva stage**,
  not as Konva nodes — so cursor ticks never touch the shape render path, and the arrows
  don't grow and shrink with zoom.
- Throttled to 20 Hz with a **trailing flush**, movement-gated, paused on
  `visibilitychange`. Never persisted to Firestore.
- `transition: transform 60ms linear` on the overlay elements. One CSS line gets ~95% of
  the smoothness of a hand-rolled rAF lerp. See R21.
- Target latency **<50ms**. Note that a 20 Hz send rate adds up to 50 ms of sampling
  delay *before* the wire — do not record this target as met on the strength of the send
  interval. Instrument it with a timestamp in the payload.

### F6 — Presence `[GATE]`
- Avatar/initials stack or list showing everyone currently on the canvas.
- Stored on the **same** `/sessions/global-canvas-v1/{sessionId}` node as the cursor:
  `{ uid, name, colour, cursor: {x, y}, drag: {...} | null, lastSeen }`.
- **Keyed by a per-tab `crypto.randomUUID()`, never by uid.** Two tabs of one browser
  share a uid; keying by uid collapses them into one user and makes closing either tab
  delete the other's presence. See R2.
- Online list is derived by uniquing on `uid`; one cursor renders per `sessionId`.
- `onDisconnect().remove()` **re-armed inside the `.info/connected` callback**, and
  awaited before the online value is written. See R9.
- 10-second heartbeat with a server-skew-corrected staleness filter as backstop, because
  Firebase publishes no ungraceful-disconnect timeout. The filter must **fail open**.
  See R17.
- Joins and leaves reflected within ~2s, including tab close and network drop.

### F7 — Authentication `[GATE]`
Two sign-in methods, both required:
- **Email + password** — `createUserWithEmailAndPassword`, no verification gate, no
  email ever sent. Never call `sendEmailVerification`; never gate anything on
  `emailVerified`.
- **Google OAuth** — `signInWithPopup` only, never `signInWithRedirect` (see R20), with
  `prompt: 'select_account'` so a grader's second window doesn't silently reuse the
  first account.

Plus:
- Display name captured from the signup form into React state **before** the network
  call, and written onto the session node directly. `createUserWithEmailAndPassword` cannot
  set a display name, and `updateProfile` doesn't re-fire the auth observer — so the
  session node is the single source of truth for identity, not `auth.currentUser`. See R11.
- **Three-state auth context** (`loading | signedIn | signedOut`) with a neutral splash
  while loading, all Firestore and RTDB listeners mounted inside a `useEffect` keyed on
  `user.uid`, and a 3–5s timeout that force-exits loading. See R4.
- Do **not** call `setPersistence` — the default already survives reloads, and calling it
  explicitly downgrades IndexedDB to localStorage.
- Sign out, in this order: `onDisconnect().cancel()` → `remove()` the session node →
  `signOut()`. Reversing it leaves a ghost user online. See R19.
- **Three seeded demo accounts** printed on the login screen. Gate items 4, 5, and 6 all
  need two identities; this is the highest points-per-minute item in the build.
- Unauthenticated users are redirected to login; canvas data is not readable
  unauthenticated.

### F8 — Persistence & reconnect `[GATE]`
- All shapes stored in the Firestore canvas document. Full canvas state loads on mount in
  **one document read**.
- If every user disconnects and returns, the canvas is intact.
- Client auto-reconnects after network loss. All session-node writes are gated on
  `.info/connected` — RTDB queues writes in memory while offline and flushes a burst of
  stale positions on reconnect, making remote cursors rubber-band through an obsolete path.

### F9 — Deployment `[GATE]`
- **Firebase Hosting**, publicly accessible URL, works in a fresh incognito window.
- Deployed **first, before any feature code** — see R1. This is a gate item; treat it as one.
- Verified from a second machine or phone.

### F10 — Non-functional targets
| Metric | Target |
|---|---|
| Frame rate | 60 FPS during pan, zoom, drag |
| Object sync | <100ms |
| Cursor sync | <50ms |
| Object count | 500+ without FPS degradation |
| Concurrent users | 5+ without degradation |

---

## 4. Tech Stack

### 4.1 The stack

| Layer | Choice | Rationale |
|---|---|---|
| Package manager / build | **npm + Vite** (pin the Vite major) | Standard React SPA tooling, instant HMR. |
| UI | **React 19.2+ / TypeScript** | Typed shape and message contracts prevent an entire class of sync bugs. |
| Canvas | **Konva + react-konva** | Retained-mode 2D scene graph: hit detection, drag, and a built-in `Transformer` for post-MVP resize/rotate. |
| Auth | **Firebase Authentication** | Email/password + Google, no confirmation wall, session persistence with zero config. |
| Durable store | **Cloud Firestore** — `canvas/global-canvas-v1`, shapes array, **all writes transactional** | One document = one read on cold load. Transactions are what stop concurrent edits clobbering the array. |
| Ephemeral transport | **Firebase Realtime Database** — `/sessions/global-canvas-v1/{sessionId}` | Cursor + presence + in-flight drag on one node. `onDisconnect()` is server-side and RTDB-exclusive. |
| Hosting | **Firebase Hosting** | Same console, same CLI, default domains pre-authorized for OAuth. |
| Billing | **Spark (free tier) — billing not enabled** | Two meters now bind: Firestore daily ops **and** RTDB monthly bandwidth. See §4.5. |
| Styling | **Tailwind** | Fast, no design system needed at this scope. |
| Unit tests | **Vitest** | Pure logic in `src/utils`. |
| Integration tests | **Firebase Emulator Suite** (Auth + Firestore + RTDB) | Rules and multi-client scenarios. **Requires a JRE.** |

**Not provisioned:** Cloud Functions (requires a paid plan) · Vercel.

### 4.2 The architectural split: Firestore durable, RTDB ephemeral

Two backend products, each carrying the traffic it's priced for.

**Firestore holds the canvas document.** One document, `canvas/global-canvas-v1`, with a
`shapes` array. The single-document design has a genuine advantage that a
document-per-shape collection does not: **a cold load is one read, not 500.** With a
50,000 reads/day free quota, per-shape documents would cap you at ~100 cold loads per day
total — which a developer iterating on Konva rendering exceeds before lunch. One document
makes that a non-issue.

It costs three things, all of which have specific mitigations:

1. **Concurrent writes clobber the array.** Two users editing *different* rectangles both
   write the full array; last write wins on the whole document and one change vanishes.
   → **Every write goes through `runTransaction`** (R23).
2. **Every `onSnapshot` delivers the whole array.** There is no per-shape delta.
   → **Diff the array against previous state** and update only changed entries, preserving
   referential identity for the rest so memoised components skip re-rendering (R7).
3. **The document has a 1 MiB ceiling.** At ~150 B per rectangle that's roughly 6,500
   shapes — far beyond the 500-object target, but it is a real ceiling (R24).

**RTDB holds the session nodes.** Cursor position, presence, and in-flight drag all live on
one node per session. This is mandatory rather than optional: `onDisconnect()` is
server-side and RTDB-exclusive, and it's the only way to satisfy gate item 6 for a closed
laptop lid without a Cloud Function — which the free tier cannot deploy.

**Why in-flight drag deltas go to RTDB, not Firestore.** This is the decision that makes
the whole design work. Firestore's Spark tier allows **20,000 writes/day**. A 20 Hz drag
stream is 20 writes/second, so streaming drag through Firestore exhausts an entire day's
quota in **about 17 minutes of cumulative dragging**. Routing in-flight positions through
the session node the cursor already occupies costs nothing extra — RTDB has no
per-operation meter — and Firestore sees exactly one transactional write per drag, on
release.

> ⚠️ **Assumption flagged for confirmation.** The architecture diagram does not show a drag
> edge. This document assumes in-flight drag rides the RTDB session node. The alternative —
> committing only on release with nothing streamed — is cheaper to build but means remote
> users see the rectangle *snap* on release rather than move, which fails acceptance test
> item 5. If you'd rather accept the snap, say so and F4 collapses to a single channel.

**The accepted trade:** two products means two listeners, two rulesets, and a handoff
between the in-flight and committed position at drag release. That handoff is the fiddliest
part of the build and every bug in it is visible only in the second browser.

### 4.3 Data architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ONE Firebase project · RTDB region us-central1 (IRREVERSIBLE — pick first)  │
├──────────────────────────────────────────────────────────────────────────────┤
│  FIREBASE AUTH               ─── ID token ───►  both rulesets                │
│    • email + password (no verification gate, no email ever sent)             │
│    • Google OAuth via signInWithPopup                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│  CLOUD FIRESTORE — durable                                                   │
│                                                                              │
│  canvas/global-canvas-v1                                                     │
│    { shapes: [ { id, x, y, w, h, fill,                                       │
│                  createdBy, updatedAt, updatedBy, draggedBy }, … ] }          │
│                                                                              │
│      create  → runTransaction: read doc, push shape, write   [gate 3]        │
│      commit  → runTransaction: read doc, patch by id, write  [gate 4]        │
│      delete  → runTransaction: read doc, filter by id, write                 │
│      lock    → runTransaction: set/clear draggedBy                           │
│                                                                              │
│    listen with onSnapshot → returns the WHOLE array every time               │
│    ── diff against previous state; never setState(wholeArray) (R7)           │
│    ── NEVER updateDoc the array without a transaction (R23)                  │
│                                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  REALTIME DATABASE — ephemeral, never persisted                              │
│                                                                              │
│  /sessions/global-canvas-v1/{sessionId}            ◄── ONE node per TAB       │
│    { uid, name, colour,                                                      │
│      cursor: { x, y },        ← WORLD coords, 20 Hz, movement-gated [gate 5] │
│      drag:   { id, x, y } | null,  ← in-flight only, cleared on release      │
│      lastSeen: serverTimestamp() } ← 10 s heartbeat            [gate 6]      │
│                                                                              │
│      onDisconnect(ref).remove(), RE-ARMED inside .info/connected             │
│      online list = dedupe(subtree, by uid)                                   │
│      one cursor rendered per sessionId                                       │
│                                                                              │
│  /.info/connected        → re-arm onDisconnect · gate writes · badge         │
│  /.info/serverTimeOffset → skew-correct the staleness filter                 │
└──────────────────────────────────────────────────────────────────────────────┘

sessionId = crypto.randomUUID(), generated ONCE PER TAB — never the uid (R2).
uid travels as a FIELD on the node, which is what the online list dedupes on.
```

**Rendered position for a remote shape** = `session.drag` if any session is dragging that
id, otherwise the committed Firestore value. That fallback is the handoff, and clearing
`drag` before the Firestore commit has propagated is what makes a rectangle visibly snap
backward for a frame.

### 4.4 Security rules

Two rulesets now. Paste both into the console **during setup** and Publish.

**Firestore** — `firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /canvas/{canvasId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

**Realtime Database** — `database.rules.json`:

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "sessions": {
      ".read":  "auth != null",
      ".write": "auth != null"
    }
  }
}
```

Between them, four things bite:

1. **The two dialects differ.** Firestore uses `request.auth`; RTDB uses bare `auth`.
   Writing `request.auth != null` in the RTDB file is a silent denial, not a syntax error.
2. **RTDB rules cascade downward and cannot be narrowed deeper.** Child rules can only
   grant additional privileges. The top-level `false` pair is therefore a genuine
   default-deny for any unlisted path — which is what you want.
3. **Grant `.read` at the exact path you listen on.** Granting read only at
   `/sessions/{canvasId}/{sessionId}` makes a listener on `/sessions/{canvasId}` fail with
   `PERMISSION_DENIED` even though every child is individually readable.
4. **`rules_version = '2'` must be the literal first line** of the Firestore file.

**Never accept test mode** — it is world-readable and world-writable to anyone who
extracts your Firebase config from the JS bundle (which is public by design), and it
embeds a dated expiry after which the deployed canvas goes blank for everyone.

Attach `.catch(err => console.error('write rejected', err))` to **every** write. Both SDKs
apply writes locally and fire listeners before the server acknowledges, so a rules
rejection presents as a shape that appears and silently vanishes ~100 ms later, with
nothing logged unless you asked for it.

### 4.5 Free-tier math and the Spark ceiling

Two meters bind now, and they fail differently.

**Firestore Spark:** 50,000 document reads/day · 20,000 writes/day · 20,000 deletes/day ·
1 GiB stored. Resets daily around midnight Pacific.

**RTDB Spark:** 100 simultaneous connections · 1 GB stored · 10 GB downloaded/**month**.
No per-operation billing.

#### Firestore — the daily meter

Because the canvas is one document, the arithmetic is unusually simple:

| Operation | Firestore cost |
|---|---|
| Cold load of 500 shapes | **1 read** |
| Create / delete / drag-commit | 1 write, + 1 read per connected listener (fan-out) |
| In-flight drag frames | **0** — these go to RTDB |

At 5 concurrent users, each shape operation costs 1 write + ~5 reads. The read meter binds
first: 50,000 ÷ 5 ≈ **10,000 shape operations per day**, comfortably above a day of
development and a grading session. The write meter allows 20,000.

**This only holds if drag deltas stay off Firestore.** Stream them at 20 Hz and 20,000
writes is gone in ~17 minutes of cumulative dragging — the single fastest way to kill this
project for a day.

#### RTDB — the monthly meter

Downstream messages/sec = N × f × (N−1); at N=5, f=20 Hz that's 400 msg/s. At an estimated
~200 B/message that's **~300 MB/hour** of continuous 5-user cursor motion, or ~33
hours/month against 10 GB. Movement-gating roughly doubles that, since idle users generate
nothing.

**Projected total:** ~1.4 GB solo dev + ~0.9 GB rehearsals + ~0.6 GB grading ≈
**2–3 GB, or 20–30% of the allowance.**

#### Staying on Spark — what that commits you to

Billing is deliberately not enabled. That is a legitimate call at this projection, but
there is **no safety valve**, and the two meters fail differently:

- **Firestore** resets daily. Blowing it costs you the rest of the day — bad, recoverable.
- **RTDB** is metered monthly. Blowing it shuts the database off **for the remainder of the
  calendar month**, for the whole project. There is no recovery before the month rolls over.

The 2–3 GB projection leaves genuine headroom, but note §9: the per-message wire size
driving it is an *estimate* that could be off by ~2× in either direction. A 2× miss lands
around 6 GB and still fits. A 3× miss does not.

Three consequences:

1. **The conservation measures are gate-critical code, not optimizations.** Movement-gating,
   the `visibilitychange` pause, and the `.info/connected` write guard are the entire
   difference between 2–3 GB and blowing the cap. There is nothing behind them.
2. **Check both Usage tabs daily** — Firestore and Realtime Database. Twenty seconds, and
   it's the only early warning that exists.
3. **Connections cap at 100 and every browser tab counts.** Dev plus grading peaks around
   15–25, so there's headroom — but it's the second-closest limit.

**Tripwire — act on these rather than hoping:**

| Checkpoint | If exceeded | Do |
|---|---|---|
| Any day | 10k Firestore reads by midday | Check for a listener re-subscribing in a loop |
| Early in the month | 1.5 GB RTDB | Verify movement-gating fires; drop cursors to 15 Hz |
| Any time | 4 GB RTDB | Drop to 10 Hz; stop multi-user rehearsals; close idle tabs |
| Any time | 7 GB RTDB | 10 Hz, and freeze all non-grading multi-user testing |

The single realistic way to blow the monthly cap is leaving a tab broadcasting overnight.

### 4.6 Setup order

Load-bearing ordering. Several of these are painful or impossible to reverse.

1. **Create the Firebase project under a personal @gmail.com** — not a Workspace, school,
   or company account. Hardest thing in the build to undo. See R8.
2. **Provision RTDB first**, region `us-central1`. If RTDB is created *after* the web app
   is registered, `databaseURL` is missing from the config snippet and `getDatabase()`
   throws something that looks like a bundler error. See R15.
3. **Provision Firestore**, production mode (never test mode). Co-locate the region.
4. Register the web app; copy the config object.
5. Enable **both** auth providers. Enabling only Google makes the email path throw
   `auth/operation-not-allowed`.
6. Authorized domains: confirm what's actually listed. `localhost` is **not present by
   default** in projects created after 2025-04-28. Firebase Hosting's own domains are
   normally pre-authorized — read the list rather than assuming.
7. Google Cloud Console → confirm Audience = **External**, Publishing status =
   **In production**.
8. Paste **both** rulesets from §4.4 and Publish.
9. `firebase init hosting` — **set the public directory to `dist`, not the default
   `public`**, and answer yes to the single-page-app rewrite. Deploy a near-empty Vite app
   that only calls `initializeApp` and prints auth state. Click a throwaway Google sign-in
   button **on the deployed URL**.
10. Hardcode the Firebase config in `src/services/firebase.ts`. The web API key is
    documented as public and safe to commit, and this deletes the entire env-var failure
    class.

Only then write feature code.

---

## 5. Risks & Pitfalls

Ordered by how likely each is to cost you the gate.

### Critical

**R1 — Deploying for the first time late.** Gate item 8 is the only requirement with no
partial credit, and it depends on a chain that each fail in unfamiliar ways: the
`firebase.json` public directory and SPA rewrite, the production hostname in Authorized
domains, Google OAuth verified from a non-owner account, and index.html caching (R12).
Each is a 5-minute task and a 90-minute debugging session. Attempting them in sequence once
the build is otherwise finished is the single most common way this class of project fails.
*Mitigation:* §4.6, first, before any feature code.

**R2 — Sessions keyed by uid.** Firebase Auth persistence is shared across all tabs of a
browser profile, so two tabs have the same uid. At `/sessions/{uid}` this means two tabs
render as one user with one teleporting cursor, and closing tab A fires A's `onDisconnect`
against the shared node, **deleting live tab B's presence**. Fails gates 5 and 6
simultaneously. *Mitigation:* `sessionId = crypto.randomUUID()` per page load; key the
session node by it, carry uid as a field, dedupe the online list on uid. Also makes React
19 StrictMode double-mount harmless.

**R3 — Cursors broadcast in screen coordinates.** Gate 1 and gate 5 interact: the offset
grows with pan distance and scales with zoom. Two developers on identical viewports at
localhost never see it; it appears the instant a grader scrolls. The inverse mistake is
equally visible — rendering cursor icons inside the zoomable Konva layer makes the arrows
physically grow and shrink. *Mitigation:* publish world coords via
`stage.getRelativePointerPosition()`, convert back with
`stage.getAbsoluteTransform().point()`, draw in an untransformed DOM overlay. Verify by
panning one browser 2000 px from the other.

**R4 — Listeners attached before auth resolves.** `onAuthStateChanged` doesn't fire
synchronously — the SDK rehydrates from IndexedDB asynchronously, so `auth.currentUser`
is null on first render even for a signed-in user. Both the Firestore and RTDB listeners
mounted in that window are denied. Works perfectly on localhost under permissive rules;
fails only on the deployed build with real rules — i.e. the build being graded. Presents as
"the canvas is empty and nobody is online" with one console error. *Mitigation:*
three-state auth context, neutral splash while loading, all listeners inside a `useEffect`
keyed on `user.uid`, plus a 3–5s timeout — `firebase-js-sdk` #7888 reports
`onAuthStateChanged` failing to fire in *normal* Safari due to an IndexedDB `AbortError`,
which would otherwise white-screen the app forever.

**R5 — Rules: locked mode, test-mode expiry, and `firebase deploy` overwrites.** Three traps,
now doubled because there are two rulesets. A database in locked mode denies everything and
you spend 45 minutes suspecting Konva. Test mode works but expires. And `firebase init`
scaffolds local rule files that `firebase deploy` pushes over whatever you edited in the
console — the classic late-stage story where everything 403s and the deploy itself is the
last thing you suspect. **You are running `firebase init` for hosting and emulators
regardless, so this trap is now unavoidable rather than optional.** *Mitigation:* console
during setup, then immediately copy both rulesets into `firestore.rules` and `database.rules.json` and
treat the files as the single source of truth. Flags differ: `--only firestore:rules` and
`--only database`.

**R6 — Your own write echoes back mid-drag.** The Firestore commit or the RTDB drag write
comes back through the listener, your handler sets the node's x/y — but your pointer has
moved on, so the node snaps backward then forward. Nearly invisible on localhost;
pronounced jitter over a real network. *Mitigation:* a ref `Set` of actively-dragged ids,
early-returned in the diff handler. Release the id in `onDragEnd` only after the final
transaction resolves — and remove ids on a delete, or a shape deleted mid-drag stays
permanently suppressed.

**R7 — `onSnapshot` delivers the whole shapes array, every time.** With a single canvas
document there is no per-shape delta: every change hands you all 500 shapes. The naive
`onSnapshot(doc, snap => setShapes(snap.data().shapes))` allocates 500 new objects on every
change — tens of thousands of reconciliations per second during a multi-user drag. Both the
60 FPS and 500-object targets are gone, and it looks like Konva is slow when it's React.
*Mitigation:* diff the incoming array against previous state by id, reuse the previous
object reference for anything unchanged, and memoise `Rectangle`. Also: shapes and cursors
on separate Konva `<Layer>`s (each Layer is its own canvas); `listening={false}` on the
cursor layer; `perfectDrawEnabled={false}` and `shadowForStrokeEnabled={false}` on each
`Rect`; under four layers total.

**R8 — Google OAuth fails for the grader and you cannot reproduce it.** Three distinct
failures with one signature — works for you, 403s for everyone else, while email/password
keeps working so your smoke test passes. (a) The deployed hostname missing from Authorized
domains → `auth/unauthorized-domain`; `localhost` is *not* authorized by default in
projects created after 2025-04-28, so this bites during local development too. (b) If the
project was created under a Google Workspace account, the OAuth consent audience defaults to
**Internal** and every grader with a personal Gmail gets `Error 403 org_internal` — and a
project inside a Workspace org may have External greyed out by policy, which is not a
console click to unwind. (c) An External app left in **Testing** admits only 100
explicitly listed users. *Mitigation:* personal @gmail.com from the very start; verify
Audience = External and Publishing = In production; sign in to the **production** URL from
a non-owner account well before the gate.

### High

**R9 — `onDisconnect` registered outside `.info/connected`.** The documented pattern nests
registration inside the callback so it's re-established on every reconnect. Register once
at startup and after the first network blip the handler is gone — so the *second*
disconnect leaves a permanent ghost. Because it only appears on the second disconnect, it
survives casual testing and surfaces during grading. The mirror-image bug is writing the
online value before awaiting `onDisconnect`; Firebase's docs carry an explicit note to
queue disconnect operations first. A ghost name in a sidebar is a blemish; an orphaned
labeled cursor frozen on the artboard is the first thing an evaluator's eye lands on.
*Mitigation:* await `onDisconnect().remove()` inside the `.info/connected` callback before
writing the session node; gate all session writes on `.info/connected`.

**R10 — Two users grabbing the same rectangle.** With both clients writing their own
pointer position, the rectangle vibrates between two locations many times per second for
*every* observer. It doesn't look like a conflict; it looks like the sync layer is broken.
Evaluators try this within thirty seconds of opening two browsers. *Mitigation:* the
`draggedBy` soft lock in F4, claimed transactionally.

**R11 — Fresh-signup users get a blank or `undefined` cursor label.**
`createUserWithEmailAndPassword` takes exactly three arguments and cannot set a display
name. `onAuthStateChanged` fires immediately with `displayName: null`; `updateProfile`
resolves a few hundred ms later, mutates that same User object *in place*, and does not
re-fire the observer — so React holds an unchanged reference and never re-renders. It never
reproduces on reload, never for Google users, and never for you, because your test account
already has a name. *Mitigation:* capture the name from the controlled input into your own
state before calling `createUser`, write it onto the session node yourself, fire
`updateProfile` unawaited. **Never `setUser({...auth.currentUser})`** — `User` is a class
instance whose methods include `getIdToken()`; spreading it silently loses that.

**R12 — Firebase Hosting serves a stale `index.html` for up to an hour.** Two independent
empirical checks found `cache-control: max-age=3600` on the root HTML of live `*.web.app`
sites — undocumented, but currently reproducible. Redeploying purges the CDN but not
already-populated browser caches, so a grader who loaded the page earlier gets the stale
shell — and because that HTML references purged hashed asset filenames, the usual result is
a **blank white screen**, not merely an old version. *Mitigation:* set
`Cache-Control: no-cache` on `**/*.html` in the `firebase.json` headers block from the start.
Two adjacent traps in the same file: `firebase init hosting` defaults the public directory
to `public`, not Vite's `dist`, and the SPA rewrite question must be answered yes — get
either wrong and you deploy the Firebase welcome page.

**R13 — `Stage draggable` pan makes every pan gesture also place a phantom rectangle.**
Konva fires a click at the end of a drag, so finishing a pan drops a rectangle where you
released. Siblings land at the same moment: clicking an existing shape stacks a new one on
top, and dragging a shape also drags the stage. All three appear in the first minute of
real use. *Mitigation:* the <5 px + empty-background guard in F2, plus
`e.cancelBubble = true` in each Rect's `onDragStart`. 15 minutes if anticipated; 60–90
minutes of confused debugging if not.

**R14 — Two Spark meters, two different failure modes, no safety valve.** Firestore's daily
op quotas reset at midnight — blowing them costs a day. RTDB's bandwidth is metered
*monthly* and blowing it shuts the database off for the **remainder of the calendar month**,
for the whole project, with no recovery before the month rolls over. With billing
deliberately not enabled (Decision 6) there is no option to pay through either. This is the
one risk whose *only* defence is discipline — every other critical risk has a code fix.
*Mitigation:* keep drag deltas off Firestore (§4.2); treat §4.5's conservation measures as
gate-critical code; check both Usage tabs daily; act on the §4.5 tripwire table.

### Medium

**R15 — RTDB exists in only three regions and the choice is irreversible.** `us-central1`,
`europe-west1`, `asia-southeast1`. Region choice is a bigger end-to-end latency lever than
send rate: a US-East demo against `europe-west1` eats ~90 ms of RTT that no tuning
recovers. The URL format also differs between `us-central1` (`DATABASE.firebaseio.com`) and
the other two (`DATABASE.REGION.firebasedatabase.app`), which breaks copy-pasted config.
*Mitigation:* choose the region first, nearest the graders.

**R16 — rAF-throttled cursor writes have no trailing edge.** rAF doesn't fire in
backgrounded tabs, and a leading-edge coalescer never flushes the final position — so every
time a user stops moving, their remote cursor parks tens of pixels behind. Reads as drift
while measured latency looks fine. Worse: a user who alt-tabs mid-drag stays connected, so
`onDisconnect` doesn't fire and their `draggedBy` claim pins a shape at a frozen in-flight
position for everyone. *Mitigation:* timestamp throttle with a trailing `setTimeout` flush;
treat rAF purely as a rendering scheduler. Add a `visibilitychange` handler that clears
`draggedBy` and removes the session node's cursor.

**R17 — Presence staleness filter compares a server timestamp against a skewed client
clock.** If the viewer's machine clock is two minutes fast, every remote user is instantly
stale and the presence panel renders **empty** — gate 6 reads as completely broken, on the
grader's machine, never on yours, because your two browsers share one clock. *Mitigation:*
write `lastSeen` with **RTDB's** `serverTimestamp()` — a different import from Firestore's
identically-named sentinel, and mixing them writes an object that never resolves. Subscribe
to `.info/serverTimeOffset` and compare against `Date.now() + offset`. Never filter your own
sessionId, and **fail open** — a ghost is a blemish, an empty list is a failed gate item.

**R18 — react-konva peer ranges.** `react-konva` declares peers of `react ^19.2.0` and
`konva` separately. If the Vite template scaffolds 19.0.x or 19.1.x you get peer warnings
and possibly a duplicate React copy, surfacing as an opaque reconciler error or "Invalid
hook call" the moment you render a `<Stage>`. Forgetting to install `konva` alongside is the
other common failure. This is the most likely thing to stall you at the very start.
*Mitigation:* pin react/react-dom to ^19.2.0 and install konva explicitly; render one
hardcoded blue `<Rect>` and confirm it paints before writing any Firebase code. Also set
`noUnusedLocals` and `noUnusedParameters` to false in tsconfig **now** — the template's
`tsc -b && vite build` refuses to emit once refactoring leaves unused imports behind.

**R19 — Sign-out leaves a ghost user and a permission-denied storm.** `signOut(auth)`
doesn't close the RTDB websocket, so `onDisconnect` doesn't fire and you remain "online" to
the other browser indefinitely — visibly wrong in the exact demo the grader is running.
Meanwhile every still-mounted Firestore and RTDB listener fails its rule and floods the
console. *Mitigation:* the ordering in F7, plus keying the listener `useEffect` on
`user?.uid` rather than `[]`.

**R20 — A COOP header silently breaks `signInWithPopup`.** If anything sets
`Cross-Origin-Opener-Policy: same-origin` — a `firebase.json` headers block copied from a
"secure your app" post, or a Vite plugin enabling cross-origin isolation — the popup is
severed from `window.opener` and the promise never settles. The user sees consent succeed,
then a dead tab, then an app spinning forever with no error. Confounding this,
`accounts.google.com` emits a *benign* report-only COOP warning even when sign-in works, so
you can burn an hour chasing a non-bug. *Mitigation:* the only header you should add to
`firebase.json` is the `Cache-Control` one from R12. If a COOP block exists, use
`same-origin-allow-popups`. Diagnostic: if the popup *closes* and the promise resolves, the
warning is Google's harmless one; if the popup stays open and the promise never resolves,
it's your header. Also call `signInWithPopup` synchronously as the first statement in the
click handler — any preceding `await` breaks user-gesture attribution and the popup is
blocked.

**R21 — Discrete 20 Hz cursor updates look choppy even when latency is good.** Applying
incoming positions directly means 50 ms jumps, which read as lag. This is a perception
problem, not a latency problem, and gate 5 is judged subjectively. *Mitigation:* the DOM
overlay with `transition: transform 60ms linear` from F5. Do **not** smooth the in-flight
dragged shape — there you want the raw position so the rectangle tracks the remote cursor
exactly.

**R23 — Firestore transaction callbacks can run more than once.** Under contention the SDK
retries the callback, so any side effect inside it — incrementing a counter, pushing to an
external array, firing analytics, `console.log` you're counting on — happens multiple times.
The callback must be a pure read-modify-return. Related: at high contention the transaction
can exhaust its retries and throw, which must be caught, or a failed shape create looks
like a silent no-op. *Mitigation:* keep transaction bodies pure; commit only on drag
release so contention stays low; `.catch` every transaction and surface failures.

**R24 — The canvas document has a 1 MiB ceiling and every read transfers the whole array.**
At ~150 B per rectangle that's roughly 6,500 shapes — well beyond the 500 target, but a
real wall, and the failure at the boundary is a hard write rejection. More immediately: the
"Seed 500" stress button writes ~75 KB in one transaction and every connected client
re-downloads the full array on every subsequent change. *Mitigation:* fine at MVP scale;
know the number. If you ever exceed it, the fix is a shapes *subcollection*, which changes
the read arithmetic in §4.5 completely.

### Low

**R22 — An empty canvas is indistinguishable from a broken one.** A grader opening a fresh
window onto a cleared canvas sees a blank page with no evidence anything works and no hint
about the click-to-place gesture. *Mitigation:* leave 3–5 rectangles permanently in the
canvas document; render a one-line hint that fades after the first placement; add labeled
"Seed 500" / "Clear all" buttons so the grader can trigger the stress test themselves.
Implement seeding as **one transaction writing the whole array**, not 500 sequential
writes — 500 transactions against one document would serialize and take minutes.

---

## 6. Out of Scope for MVP

### Deferred — Phase 2
- **AI canvas agent** — the entire natural-language feature, tool schema, 6+ commands,
  complex multi-step plans. This is the second half of the project; the MVP is explicitly
  the infrastructure half. It needs a server-side endpoint to hold an LLM API key; **where
  that endpoint lives is an open question** (Cloud Functions requires a paid plan). Expose
  `getIdToken()` from the auth context now so whatever host is chosen can verify callers.
- Transformations: resize, rotate, `Transformer` handles.
- Additional shape types: circle, line; text layers with formatting.
- Drag-to-size shape creation (MVP is click-to-place only, per Decision 4).
- Multi-select (shift-click, drag-to-select) and grouping.
- Layer management: z-order, reorder, layers panel.
- Duplicate, copy/paste.
- Color picker, stroke, opacity, styling controls.
- Undo / redo.

### Not planned
- Multiple canvases / rooms / documents — MVP is one global shared canvas.
- Sharing, permissions, roles, invites.
- Comments, chat, reactions.
- Export (PNG / SVG / PDF).
- Version history, snapshots, time travel.
- Images, uploads, external assets.
- Mobile / touch-optimized UI (must not crash on mobile; need not be usable).
- Offline mode; Firestore offline persistence is left at its default.
- Full CRDT / OT conflict resolution — transactional LWW plus the `draggedBy` lock suffices.
- A shapes subcollection — the single document is deliberate (§4.2).
- Follow-mode / viewport following.
- Analytics, telemetry, error monitoring.
- Cloud Functions.
- Per-field security rule validation beyond §4.4.
- Account-linking recovery flows (`linkWithCredential`).
- Custom domain, SEO, marketing site, onboarding flow.
- E2E / Playwright. Unit tests cover pure logic; emulator integration tests cover rules and
  multi-client scenarios; everything else is the manual pass in §7.

---

## 7. Acceptance Test

Executed on the **deployed URL**, not localhost, with production rules.

1. Open two different browsers (not two tabs). Sign up as two distinct users.
2. Both see each other in the presence list within 2s.
3. Move mouse in A → labeled cursor moves in B, no perceptible lag.
4. Place a rectangle in A → appears in B in <100ms.
5. Drag it in A → B sees it move continuously, not just snap on release.
6. Zoom A to 400% and B to 25% → cursors still land in the correct world position.
7. Both users grab the same rectangle → one is locked out, no oscillation.
8. **A and B drag two *different* rectangles simultaneously → both changes survive.** This
   is the transaction working; without it one user's move silently vanishes `[R23]`.
9. Refresh B mid-drag → full state reloads, nothing lost.
10. Create ~50 shapes rapidly in A → all appear in B, no drops, no stall.
11. Click "Seed 500" → 500 shapes appear and pan/zoom still holds 60 FPS.
12. Kill A's network for 10s, restore → A reconnects and resyncs without a refresh.
13. Close A's tab → A disappears from B's presence list within 2s.
14. **Sign out** in A (not just close) → A disappears from B's list, no console errors.
15. **Open two tabs in the same browser** → they appear as two cursors, and closing one
    does not remove the other.
16. A alt-tabs away mid-drag → the held shape does not stay locked.
17. Both users leave entirely. Return 5 minutes later → canvas is intact.
18. Fresh incognito window, brand-new email → signup completes with no email step, and
    the display name appears on the cursor immediately, without a reload.
19. Fresh incognito window → "Sign in with Google" completes from **a non-owner Google
    account**, with no unverified-app warning and no unauthorized-domain error.
20. Repeat 18–19 in **Safari**, not just Chrome.
21. Redeploy, then hard-reload the URL a grader already visited → new build, not a white
    screen `[R12]`.

Twenty-one green = gate passed. Items 7, 8, 14, 15, 16, 19, 20, and 21 exist because each
maps to a risk in §5 that passes a naive test.

---

## 8. Decisions Log

Recorded so the reasoning survives the late stretch of the build, when every one of these
will feel worth reopening.

| # | Decision | Resolution |
|---|---|---|
| 1 | Data split | **Firestore for durable shapes, RTDB for ephemeral sessions** |
| 2 | Auth method | **Email + password *and* Google OAuth** |
| 3 | MVP shape | **Rectangle only** |
| 4 | Creation gesture | **Click-to-place, fixed size** |
| 5 | Canvas scope | **One global canvas, 5,000 × 5,000** |
| 6 | Billing | **Spark free tier — billing not enabled** |
| 7 | Hosting | **Firebase Hosting** |
| 8 | Array writes | **All Firestore writes via `runTransaction`** |
| 9 | In-flight drag | **RTDB session node; Firestore on release** ⚠️ *assumed* |

**1. Firestore durable, RTDB ephemeral.** The canvas lives in one Firestore document so a
cold load costs one read instead of 500. Cursors, presence, and in-flight drag live on RTDB
session nodes because `onDisconnect()` is server-side and RTDB-exclusive — the only way to
satisfy gate 6 for a closed laptop lid without a Cloud Function, which the free tier cannot
deploy. See §4.2 for the full argument and the three costs of the single-document design.

**2. Email + password *and* Google OAuth.** Both ship. Email/password is the fallback that
always works; Google is one click. Two paths also means one auth method failing during a demo
is an inconvenience rather than a gate failure. Firebase does not gate sign-in on email
verification.

**3. Rectangle only.** The gate asks for "at least one shape type" — a second earns zero
additional credit and adds a shape-type branch to every code path the sync layer touches.

**4. Click-to-place, fixed size.** Drag-to-size feels more finished but adds a
gesture-state machine competing for the same mouse events — a genuine source of late-stage
bugs for cosmetic gain. See R13.

**5. One global canvas, 5,000 × 5,000.** No rooms, no routing, no join flow. The evaluator
signs in and is *already* in the shared space with everyone else.

**6. Spark free tier, billing not enabled.** No paid tier, no card on file. Two meters now
bind — Firestore daily ops and RTDB monthly bandwidth — and they fail differently (§4.5).
The trade is accepted; the compensating controls are mandatory.

**7. Firebase Hosting.** One console, one CLI, and the default domains are normally
pre-authorized for OAuth, which removes a step. The cost is the undocumented one-hour
`index.html` cache (R12), fixed with three lines in `firebase.json` — and that Phase 2's AI
endpoint has no free home on Firebase, which is deferred rather than solved.

**8. All Firestore writes via `runTransaction`.** Non-negotiable with a shapes array in one
document: a plain `updateDoc` means two users editing different rectangles clobber each
other and one change silently vanishes. The soft lock does not cover this — it only guards
the same shape. Cost: transaction callbacks may re-run, so they must be pure (R23).

**9. In-flight drag through the RTDB session node.** ⚠️ **Assumed, not confirmed.** The
architecture diagram shows no drag edge. Streaming drag to Firestore would exhaust the
20,000 writes/day quota in ~17 minutes; not streaming at all makes remote rectangles snap
on release and fails acceptance item 5. Routing through the session node the cursor already
occupies costs nothing. Confirm or overrule.

---

## 9. Appendix: What Isn't Verified

Every numeric and behavioral claim above was checked against official documentation by two
independent fact-checking passes. These could **not** be confirmed. They're listed because
a confidently-stated wrong number is worse than an admitted unknown when you're building a
schedule around it.

**Contradicted at the source.** Firebase's pricing page shows "50K MAUs" for Spark Auth,
while its auth limits page shows "Tier 1 Daily Active Users: 3000 per day." Both are
official and they disagree. Immaterial under 20 users; the conservative figure is used
above. Spark's email caps *are* consistent: 150 password resets/day, 5 email-link sign-in
emails/day. (We don't use magic links.)

**Undocumented, treat as folklore.** The "30–60 seconds" ungraceful-disconnect detection
window — Firebase guarantees `onDisconnect` fires but publishes no timeout, keepalive, or
heartbeat interval. The heartbeat backstop in F6 is right *precisely because* the number is
undocumented. Similarly: test-mode's "~30 day" expiry (mechanism real, length unstated);
Firebase Hosting's `max-age=3600` on index.html (R12 — empirically reproduced twice in
independent sessions, not documented anywhere, so set the header explicitly rather than
relying on knowing the default); and `auth/too-many-requests`, which triggers on repeated
*failed* sign-ins — i.e. by you, iterating on the login form.

**Estimated, and it propagates.** Per-message RTDB wire size drives *all* the bandwidth
arithmetic in §4.5. Two research passes disagreed (120 B vs 150–250 B) and neither figure
is documented. The 2–3 GB projection could be off by ~2× in either direction. Measure
it early from the console Usage tab rather than trusting the model. The ~150 B/shape
figure behind R24's 6,500-shape ceiling is likewise an estimate.

**Mechanism unconfirmed, prescription still correct.** The claim that `onDisconnect`
handlers are *consumed* when they fire could not be found in the docs. Nesting registration
inside `.info/connected` is officially exemplified and correct — but the documented
justification is a race-condition note, not handler consumption. Write the code that way;
don't state the mechanism as fact. The same applies to `updateProfile` not re-firing the
auth observer (R11): plausible, undocumented, and the fix is cheap either way.

**Firestore specifics not re-verified for this design.** The all-RTDB draft of this document
made the Firestore case moot, so these were never checked as closely as the RTDB numbers:
the exact fan-out read accounting for `onSnapshot` on a single document with N listeners
(the §4.5 arithmetic assumes 1 read per listener per change), transaction retry limits, and
whether the 1 MiB document ceiling is measured before or after field-name overhead.
**Measure the read counter early** rather than trusting §4.5. Separately, the widely-cited
"~1 sustained write/sec per Firestore document" limit **is no longer in Firebase's
documentation** — two fact-check passes confirmed its absence across four official pages.
Contention on a single document is still real; the published number is not.

**Assumptions worth checking yourself.** That `openid`/`email`/`profile` are classified as
non-sensitive scopes — the load-bearing premise under "a grader won't see an unverified-app
screen," and no official page classifying them was found. Verify with a non-owner Google
account before the gate. That Firebase Hosting's default domains are pre-authorized: the
help page says only "localhost and your Firebase project's hosting domain," singular, and
predates the April 2025 localhost removal — **read the console list during setup rather than
assuming a two-entry default.**

**Untested.** No verification session ran the Firebase Emulator Suite on this machine, and
it requires a JRE — run `java -version` before committing to the integration-test plan.
The bundle-size figures (71 KB gzipped for app+auth+RTDB, 205 KB adding Firestore) were
measured on `firebase@12.16.0` / `vite@7.3.6`; treat the *ratio* as durable and the
absolute numbers as version-specific. Note the Firestore SDK is now in the bundle, so the
205 KB figure is the applicable one.
