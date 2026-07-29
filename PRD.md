# CollabCanvas — Product Requirements Document (MVP)

**Status:** Draft for review
**Scope:** MVP checkpoint only (Tuesday, 24-hour hard gate)
**Backend:** Firebase
**Last updated:** 2026-07-28

---

## 1. Overview

CollabCanvas is a real-time collaborative canvas — a stripped-down Figma. Multiple
authenticated users share a single canvas, see each other's cursors, and create and
move rectangles that sync instantly across all sessions.

The MVP is not a feature deliverable. It is a **proof that the collaborative
foundation is solid**. Per the brief: *"A simple canvas with bulletproof multiplayer
is worth more than a feature-rich canvas with broken sync."* Every hour spent on
shape variety, styling, or polish before sync is bulletproof is an hour spent wrong.

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
- Large finite workspace that feels spacious (target ~10,000 × 10,000 px world space).
  Not required to be truly infinite.
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
- After placing, the tool returns to Select mode and the new shape is selected — so the
  natural next action (drag it somewhere) works without a second toolbar click.
- A placement only fires if the pointer moved <5 px between down and up **and** the
  event target is the empty stage background. Without both guards, finishing a pan drops
  a phantom rectangle and clicking an existing shape stacks one on top. See R13.
- Node shape at `/shapes/{shapeId}`:
  `{ x, y, w, h, fill, createdBy, updatedAt, updatedBy, draggedBy }`

### F3 — Selection & movement `[GATE]`
- Click a shape to select; visible selection outline.
- Drag to move. Click empty canvas to deselect.
- Delete/Backspace removes the selected shape.
- Movement is optimistic: the Konva node updates immediately, the network confirms after.
- **Not in MVP:** resize, rotate, multi-select, group.

### F4 — Real-time object sync `[GATE]`
- Create / move / delete propagate to all connected clients in **<100ms**.
- During a drag, throttled `update({x, y})` writes go to **the same** `/shapes/{id}`
  node at ~20 Hz. There is no separate ephemeral drag path — see §4.3.
- On drag end, a final `update()` writes position plus `updatedAt` and clears `draggedBy`.
- Listen with `onChildAdded` / `onChildChanged` / `onChildRemoved`. **Never `onValue`
  on `/shapes`** — see R7.
- Ignore inbound updates for any shape the local user is actively dragging, or your own
  echo fights your pointer and the rectangle rubber-bands. See R6.
- **Soft locking:** `draggedBy: uid` is set on dragstart and cleared on dragend, with an
  `onDisconnect` that clears it. Other users cannot drag a held shape, and it renders with
  a colored outline. ~10 lines, and it converts the worst-looking conflict into visible
  multi-user awareness. See R10.
- **Conflict resolution: last-write-wins**, documented per the brief's requirement to
  state the choice. Note that plain LWW is *not* adequate on its own here — two users
  dragging one rectangle at 20 Hz produces continuous oscillation, not a rare
  self-correcting jump. The `draggedBy` lock is what makes LWW acceptable.

### F5 — Multiplayer cursors `[GATE]`
- Every other connected user's cursor renders with their display name in a colored label.
- Cursor color derived deterministically from uid, stable across sessions.
- Published at `/cursors/{sessionId}` as `{ u: uid, x, y }` — name and color live in
  `/presence` and are **not** resent every frame.
- **World coordinates**, via `stage.getRelativePointerPosition()`. Screen coordinates
  drift the moment anyone pans, which is exactly what an evaluator does. See R3.
- Rendered as **absolutely-positioned DOM elements in an overlay above the Konva stage**,
  not as Konva nodes — so cursor ticks never touch the shape render path, and the arrows
  don't grow and shrink with zoom.
- Throttled to 20 Hz with a **trailing flush**, movement-gated, paused on
  `visibilitychange`. Never persisted.
- `transition: transform 60ms linear` on the overlay elements. One CSS line gets ~95% of
  the smoothness of a hand-rolled rAF lerp. See R21.
- Target latency **<50ms**. Note that a 20 Hz send rate adds up to 50 ms of sampling
  delay *before* the wire — do not record this target as met on the strength of the send
  interval. Instrument it with a timestamp in the payload.

### F6 — Presence `[GATE]`
- Avatar/initials stack or list showing everyone currently on the canvas.
- Stored at `/presence/{sessionId}` as `{ uid, name, colour, lastSeen }`.
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
  call, and written into `/presence` directly. `createUserWithEmailAndPassword` cannot
  set a display name, and `updateProfile` doesn't re-fire the auth observer — so
  `/presence` is the single source of truth for identity, not `auth.currentUser`. See R11.
- **Three-state auth context** (`loading | signedIn | signedOut`) with a neutral splash
  while loading, all RTDB listeners mounted inside a `useEffect` keyed on `user.uid`, and
  a 3–5s timeout that force-exits loading. See R4.
- Do **not** call `setPersistence` — the default already survives reloads, and calling it
  explicitly downgrades IndexedDB to localStorage.
- Sign out, in this order: `onDisconnect().cancel()` → `remove()` presence and cursor →
  `signOut()`. Reversing it leaves a ghost user online. See R19.
- **Three seeded demo accounts** printed on the login screen. Gate items 4, 5, and 6 all
  need two identities; this is the highest points-per-minute item in the build.
- Unauthenticated users are redirected to login; canvas data is not readable
  unauthenticated.

### F8 — Persistence & reconnect `[GATE]`
- All shapes stored in RTDB. Full canvas state loads on mount, batched into a single
  state update behind an explicit loading state.
- If every user disconnects and returns, the canvas is intact.
- Client auto-reconnects after network loss. All cursor writes are gated on
  `.info/connected` — RTDB queues writes in memory while offline and flushes a burst of
  stale positions on reconnect, making remote cursors rubber-band through an obsolete path.

### F9 — Deployment `[GATE]`
- Publicly accessible URL, no VPN/allowlist, works in a fresh incognito window.
- Deployed in **hour 1**, not hour 20 — see R1. This is a gate item; treat it as one.
- Verified from a second machine or phone before the deadline.

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
| Runtime / package manager | **Bun** | Fast installs, fast dev loop. |
| Build | **Vite** (pin the major) | Standard React SPA tooling, instant HMR. |
| UI | **React 19.2+ / TypeScript** | Typed shape and message contracts prevent an entire class of sync bugs. |
| Canvas | **Konva + react-konva** | Retained-mode 2D scene graph: hit detection, drag, and a built-in `Transformer` for post-MVP resize/rotate. |
| Auth | **Firebase Authentication** | Email/password + Google, no confirmation wall, session persistence with zero config. |
| Realtime **and** persistence | **Firebase Realtime Database** — single instance, `us-central1` | Carries all four traffic classes. See §4.2. |
| Hosting | **Vercel (Hobby)** | Colocates the Phase-2 `/api/agent` endpoint in the same repo and push. |
| Billing | **Spark (free tier) — billing not enabled** | Hard 10 GB/month ceiling with no safety valve. The conservation measures in §4.5 are therefore requirements, not optimizations. |
| Styling | **Tailwind** | Fast, no design system needed at this scope. |

**Not provisioned:** Cloud Firestore · Cloud Functions · Firebase Hosting (except as a
reserve URL) · Emulator Suite.

### 4.2 The one real architectural decision: all-RTDB

The obvious Firebase design is *Firestore for durable shapes, Realtime Database for
ephemeral cursors and presence*. **Don't do that.** Use RTDB for everything.

RTDB is mandatory regardless, because `onDisconnect()` is server-side and
RTDB-exclusive — it's the only way to satisfy gate item 6 for a closed laptop lid
without a Cloud Function. So the real question is whether Firestore earns its place
*alongside* it. It doesn't:

- **Firestore's only genuine advantage is querying**, and one global canvas of 500
  rectangles issues zero queries.
- **Cursors are structurally impossible on Firestore.** 5 users × 20 Hz = 100 writes/s,
  each fanning out as billed reads ≈ 500 reads/s. The 50,000/day free read quota is gone
  in **100 seconds**.
- **Shapes are nearly as bad.** A 500-document cold load is 500 billed reads → ~100 cold
  loads/day total. Two tabs open makes that 50 refresh cycles, which a developer
  iterating on Konva rendering blows through before lunch.
- **+134 KB gzipped.** Measured twice independently: 71 KB for app+auth+RTDB, 205 KB
  adding Firestore.
- **The decisive cost is the drag handoff.** An RTDB↔Firestore state machine for
  in-flight drags was priced at ~4 hours by one reviewer and called "the fiddliest state
  machine in the build" — and every bug in it is visible only in the second browser.

Dropping Firestore also deletes the `hasPendingWrites` echo guard, the
`memoryLocalCache` vs `persistentMultipleTabManager` decision, index exemptions, and the
delete-during-drag `updateDoc` not-found path. RTDB durability is entirely adequate: it
is a real database, 1 GB free, and 500 rectangles occupy ~100 KB.

> **Correction to earlier drafts of this document:** the widely-cited *"Firestore allows
> ~1 sustained write/sec per document"* limit **is no longer in Firebase's documentation**.
> Two independent fact-check passes confirmed its absence across four official pages; the
> best-practices page now says only that the maximum rate "depends highly on the workload."
> The 500 writes/second figure that does exist is per-**collection** and applies to
> sequentially-increasing indexed fields. The case against Firestore rests on the daily op
> quotas above, not on that number.

**The accepted trade:** RTDB is documented as a regional solution with zonal
availability. An RTDB outage takes down the whole app rather than just cursors. Splitting
to Firestore wouldn't meaningfully help — gate items 5 and 6 die either way — so this is
the right trade for a 24-hour MVP, but know that it is one.

### 4.3 Data architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ONE Firebase project · ONE region: us-central1                              │
│  RTDB exists in only 3 locations (us-central1 / europe-west1 /               │
│  asia-southeast1) and the choice is IRREVERSIBLE. Pick it FIRST.             │
├──────────────────────────────────────────────────────────────────────────────┤
│  FIREBASE AUTH               ─── ID token ───►  RTDB rules                   │
│    • email + password (no verification gate, no email ever sent)             │
│    • Google OAuth via signInWithPopup                                        │
│    • getIdToken() exposed from context → Phase-2 /api/agent                  │
├──────────────────────────────────────────────────────────────────────────────┤
│  REALTIME DATABASE  (single instance — the whole backend)                    │
│                                                                              │
│  /shapes/{shapeId}                      ◄── DURABLE + IN-FLIGHT DRAG         │
│    { x, y, w, h, fill, createdBy, updatedAt, updatedBy, draggedBy }          │
│      create   → set()                                        [gate 3]        │
│      drag     → update({x,y}) @ 20 Hz to the SAME node       [gate 4]        │
│      release  → final update({x,y,updatedAt,draggedBy:null})                 │
│      delete   → remove()                                                     │
│    onChildAdded / onChildChanged / onChildRemoved                            │
│    ── NEVER onValue on /shapes (R7)                                          │
│                                                                              │
│  /cursors/{sessionId}                   ◄── EPHEMERAL · HIGH FREQUENCY       │
│    { u: uid, x, y }   ← WORLD coords; name/colour NOT resent per frame       │
│      20 Hz, movement-gated, paused on visibilitychange       [gate 5]        │
│      onDisconnect(ref).remove() + explicit remove() on hide                  │
│                                                                              │
│  /presence/{sessionId}                  ◄── EPHEMERAL · LOW FREQUENCY        │
│    { uid, name, colour, lastSeen: serverTimestamp() }                        │
│      written once on connect, then ~10 s heartbeat only      [gate 6]        │
│      onDisconnect(ref).remove(), RE-ARMED inside .info/connected             │
│      online list = dedupe(subtree, by uid)                                   │
│                                                                              │
│  /.info/connected        → re-arm onDisconnect · gate writes · badge         │
│  /.info/serverTimeOffset → skew-correct the staleness filter                 │
└──────────────────────────────────────────────────────────────────────────────┘

sessionId = crypto.randomUUID(), generated ONCE PER TAB.
Cursor→identity join is by the shared sessionId key.
Render a cursor ONLY if its sessionId also exists in /presence.
```

**Why in-flight drags write to the durable node.** The entire justification for a
separate ephemeral drag channel was Firestore's per-operation billing. RTDB has no
per-operation meter — only storage and downloaded bytes — so a 20 Hz drag stream costs
nothing. Writing straight to `/shapes/{id}` means one code path instead of two, no
`dragging[id] ?? shapes[id]` merge in every render, and no release race. (Clear an
overlay a frame too early and the rectangle visibly snaps backward — exactly the artifact
an evaluator notices.) Cost: ~40 writes/s at two concurrent draggers, against RTDB's
1,000 writes/s ceiling.

### 4.4 Security rules

The complete MVP ruleset. Paste into the console Rules tab in **hour 1** and Publish —
60 seconds, no CLI prerequisites, and it unblocks all canvas work.

```json
{
  "rules": {
    ".read": false,
    ".write": false,
    "shapes":   { ".read": "auth != null", ".write": "auth != null" },
    "cursors":  { ".read": "auth != null", ".write": "auth != null" },
    "presence": { ".read": "auth != null", ".write": "auth != null" }
  }
}
```

Twelve lines. Resist adding more — every rule you write is a rule that can lock you out
at hour 22, and the gate tests none of them.

Three things that bite if you deviate:

1. **RTDB uses bare `auth`, not Firestore's `request.auth`.** Writing `request.auth != null`
   here is a silent denial, not a syntax error.
2. **RTDB rules cascade downward and cannot be narrowed deeper.** Child rules can only
   grant additional privileges. The top-level `false` pair is therefore a genuine
   default-deny for any unlisted path — which is what you want.
3. **Grant `.read` at the exact path you listen on.** Granting read only at
   `/shapes/$shapeId` makes a listener on `/shapes` fail with `PERMISSION_DENIED` even
   though every child is individually readable.

**Never accept test mode** — it is world-readable and world-writable to anyone who
extracts your Firebase config from the JS bundle (which is public by design), and it
embeds a dated expiry after which the deployed canvas goes blank for everyone.

Attach `.catch(err => console.error('rtdb write rejected', err))` to **every** set/update.
RTDB applies writes to the local cache and fires listeners before the server acknowledges,
so a rules rejection presents as a shape that appears and silently vanishes ~100 ms later,
with nothing logged unless you asked for it.

### 4.5 Free-tier math and the Spark ceiling

Verified Spark limits: **100 simultaneous connections · 1 GB stored · 10 GB
downloaded/month.** RTDB has **no per-operation billing** — no read/write/delete counter.

**Write rate** (against the 1,000 writes/s ceiling):

| Source | Rate |
|---|---|
| 5 users × 20 Hz cursors | 100/s |
| 2 concurrent draggers × 20 Hz | 40/s |
| Presence heartbeat, 5 users / 10s | 0.5/s |
| **Total** | **~141/s = 14% of ceiling** |

Not a binding constraint, even at 10 users all dragging (~40%).

**Bandwidth** — the meter that actually binds. Downstream messages/sec = N × f × (N−1);
at N=5, f=20 Hz that's 400 msg/s. At an estimated ~200 B/message that's **~300 MB/hour**
of continuous 5-user cursor motion, or ~33 hours/month against Spark's 10 GB.
Movement-gating roughly doubles that, since idle users generate nothing.

**Projected week:** ~1.4 GB solo dev + ~0.9 GB rehearsals + ~0.6 GB grading ≈
**2–3 GB, or 20–30% of Spark.** Spark survives — *provided* cursor writes are
movement-gated, paused on `visibilitychange`, and guarded on `.info/connected`.

#### Staying on Spark — what that commits you to

Billing is deliberately not enabled. That is a legitimate call at this projection, but it
changes the risk profile in one specific way: **there is no safety valve.** 10 GB/month is
a hard ceiling, and crossing it shuts the database off **for the remainder of the calendar
month** — for the whole project, not just the offending client. Inside a one-week sprint
that is unrecoverable.

The 2–3 GB projection leaves genuine headroom, but note §9: the per-message wire size
driving it is an *estimate* that could be off by ~2× in either direction. A 2× miss lands
around 6 GB and still fits. A 3× miss does not.

Three consequences follow:

1. **The conservation measures become gate-critical code, not optimizations.**
   Movement-gating (skip the write when the pointer hasn't moved), the `visibilitychange`
   pause, and the `.info/connected` write guard are the entire difference between 2–3 GB
   and blowing the cap. There is nothing behind them.
2. **Check the Usage tab daily** — console → Realtime Database → Usage. Ten seconds, and
   it is the only early warning that exists.
3. **Connections cap at 100 and every browser tab counts.** Dev plus grading peaks around
   15–25, so there is headroom — but it's the second-closest limit and there is no way to
   raise it on Spark.

**Tripwire — act on these rather than hoping:**

| Checkpoint | If cumulative usage exceeds | Do |
|---|---|---|
| End of day 2 | 1.5 GB | Verify movement-gating actually fires; drop cursors to 15 Hz |
| End of day 4 | 4 GB | Drop to 10 Hz; stop multi-user rehearsals; close idle tabs |
| Any time | 7 GB | 10 Hz, and freeze all non-grading multi-user testing |

The single realistic way to blow the cap is leaving a tab broadcasting overnight. The
`visibilitychange` pause covers the common case; closing dev tabs covers the rest.

### 4.6 Hour-0 setup order

This ordering is load-bearing. Several of these are painful or impossible to reverse later.

1. **Create the Firebase project under a personal @gmail.com** — not a Workspace, school,
   or company account. This is the hardest thing in the build to undo. See R8.
2. **Provision RTDB first**, region `us-central1`. If RTDB is created *after* the web app
   is registered, `databaseURL` is missing from the config snippet and `getDatabase()`
   throws something that looks like a bundler error.
3. Enable **both** auth providers. Enabling only Google makes the email path throw
   `auth/operation-not-allowed`.
4. Authorized domains: add `localhost` — **not present by default** in projects created
   after 2025-04-28 — and later the bare production hostname.
5. Google Cloud Console → confirm Audience = **External**, Publishing status =
   **In production**.
6. Paste the rules from §4.4 and Publish.
7. Deploy a near-empty Vite app that only calls `initializeApp` and prints auth state.
   Pin a stable production alias, add that hostname to Authorized domains, and click a
   throwaway Google sign-in button **on the deployed URL**.
8. Hardcode the Firebase config in `src/lib/firebase.ts`. The web API key is documented
   as public and safe to commit, and this deletes the entire env-var failure class.

Only then write feature code.

---

## 5. Risks & Pitfalls

Ordered by how likely each is to cost you the gate. Every factual claim here was
verified against current Firebase documentation; see §9 for what couldn't be.

### Critical

**R1 — Deploying for the first time late.** Gate item 8 is the only requirement with no
partial credit, and it depends on a chain that each fail in unfamiliar ways: Vercel build
config, env vars re-entered without the `VITE_` prefix (silently undefined, clean build,
opaque `auth/invalid-api-key` white screen), the production hostname added to Authorized
domains (impossible until the hostname exists), Google OAuth verified from a non-owner
account, and Bun-on-Vercel build behavior. Each is a 5-minute task and a 90-minute
debugging session. Attempting them in sequence at hour 20 is the single most common way
this class of project fails. *Mitigation:* §4.6, in hour 1, before any feature code.

**R2 — Presence and cursors keyed by uid.** Firebase Auth persistence is shared across
all tabs of a browser profile, so two tabs have the same uid. At `/presence/{uid}` this
means two tabs render as one user with one teleporting cursor, and closing tab A fires
A's `onDisconnect` against the shared node, **deleting live tab B's presence**. Fails
gates 5 and 6 simultaneously. Two independent verifiers flagged it. *Mitigation:*
`sessionId = crypto.randomUUID()` per page load; key both `/cursors` and `/presence` by
it, carrying uid as a field. Also makes React 19 StrictMode double-mount harmless.

**R3 — Cursors broadcast in screen coordinates.** Gate 1 and gate 5 interact: the offset
grows with pan distance and scales with zoom. Two developers on identical viewports at
localhost never see it; it appears the instant a grader scrolls. The inverse mistake is
equally visible — rendering cursor icons inside the zoomable Konva layer makes the arrows
physically grow and shrink. *Mitigation:* publish world coords via
`stage.getRelativePointerPosition()`, convert back with
`stage.getAbsoluteTransform().point()`, draw in an untransformed DOM overlay. Verify by
panning one browser 2000 px from the other.

**R4 — RTDB listeners attached before auth resolves.** `onAuthStateChanged` doesn't fire
synchronously — the SDK rehydrates from IndexedDB asynchronously, so `auth.currentUser`
is null on first render even for a signed-in user. Listeners mounted in that window are
denied. Works perfectly on localhost under permissive rules; fails only on the deployed
build with real rules — i.e. the build being graded. Presents as "the canvas is empty and
nobody is online" with one console error. *Mitigation:* three-state auth context, neutral
splash while loading, all listeners inside a `useEffect` keyed on `user.uid`, plus a 3–5s
timeout — `firebase-js-sdk` #7888 reports `onAuthStateChanged` failing to fire in *normal*
Safari due to an IndexedDB `AbortError`, which would otherwise white-screen the app forever.

**R5 — Security rules: locked mode, test-mode expiry, and `firebase deploy` overwrites.**
Three traps in one area. A database in locked mode denies everything, and you spend 45
minutes suspecting Konva. Test mode works but expires. And `firebase init` scaffolds local
rule files that `firebase deploy` pushes over whatever you edited in the console — the
classic hour-22 story where everything 403s and the deploy itself is the last thing you
suspect. *Mitigation:* console in hour 1; if you ever run `firebase init`, copy the console
rules into `database.rules.json` **before** the first deploy.

**R6 — Your own write echoes back mid-drag.** You write to `/shapes/{id}`, the listener
fires, your handler sets the node's x/y — but your pointer has moved on, so the node snaps
backward then forward at the throttle frequency. Nearly invisible on localhost; pronounced
jitter over a real network with 60 ms RTT. *Mitigation:* a ref `Set` of actively-dragged
ids, early-returned in the child-changed handler. Release the id in `onDragEnd` only after
the final write resolves — and remove ids on a `removed` event, or a shape deleted
mid-drag stays permanently suppressed.

**R7 — `onValue` on `/shapes` plus `setState` of an array.** RTDB sends only the delta on
the wire, but the SDK invokes `onValue` with a *full snapshot from local cache*. The naive
`onValue(shapesRef, snap => setShapes(Object.entries(snap.val())))` allocates a new
500-element array on every child change — tens of thousands of reconciliations per second
during a multi-user drag. Both the 60 FPS and 500-object targets are gone, and it looks
like Konva is slow when it's React. The first snapshot is the worst case: 500 'added'
events at once, freezing the app at the exact moment a grader opens the URL.
*Mitigation:* `onChildAdded`/`Changed`/`Removed` into a `Map` keyed by id; batch the
initial load into one state update behind a loading state; shapes and cursors on separate
Konva `<Layer>`s (each Layer is its own canvas); `listening={false}` on the cursor layer;
`perfectDrawEnabled={false}` and `shadowForStrokeEnabled={false}` on each `Rect`; under
four layers total.

**R8 — Google OAuth fails for the grader and you cannot reproduce it.** Three distinct
failures with one signature — works for you, 403s for everyone else, while email/password
keeps working so your smoke test passes. (a) The deployed hostname is missing from
Authorized domains → `auth/unauthorized-domain`; note `localhost` is *not* authorized by
default in projects created after 2025-04-28, so this bites in hour 1 too. (b) If the
project was created under a Google Workspace account, the OAuth consent audience defaults
to **Internal** and every grader with a personal Gmail gets `Error 403 org_internal` — and
a project inside a Workspace org may have External greyed out by policy, which is not a
console click to unwind at hour 22. (c) An External app left in **Testing** admits only
100 explicitly listed users. *Mitigation:* personal @gmail.com in the first 15 minutes;
bare hostname (no scheme, no trailing slash) in Authorized domains; verify Audience =
External and Publishing = In production; sign in to the **production** URL from a
non-owner account before hour 12. **Never whitelist bare `vercel.app`** — your config is
public by design, so that authorizes the entire platform against your project.

### High

**R9 — `onDisconnect` registered outside `.info/connected`.** The documented pattern nests
registration inside the callback so it's re-established on every reconnect. Register once
at startup and after the first network blip the handler is gone — so the *second*
disconnect leaves a permanent ghost. Because it only appears on the second disconnect, it
survives casual testing and surfaces during grading. The mirror-image bug is writing the
online value before awaiting `onDisconnect`; Firebase's docs carry an explicit note to
queue disconnect operations first. A ghost name in a sidebar is a blemish; an orphaned
labeled cursor frozen on the artboard is the first thing an evaluator's eye lands on.
*Mitigation:* await both `onDisconnect().remove()` calls inside the `.info/connected`
callback before writing presence; render cursors only for sessionIds present in
`/presence`; gate all cursor writes on `.info/connected`.

**R10 — Two users grabbing the same rectangle.** With both clients writing their own
pointer position at 20 Hz, the rectangle vibrates between two locations many times per
second for *every* observer. It doesn't look like a conflict; it looks like the sync layer
is broken. Evaluators try this within thirty seconds of opening two browsers.
*Mitigation:* the `draggedBy` soft lock in F4.

**R11 — Fresh-signup users get a blank or `undefined` cursor label.**
`createUserWithEmailAndPassword` takes exactly three arguments and cannot set a display
name. `onAuthStateChanged` fires immediately with `displayName: null`; `updateProfile`
resolves a few hundred ms later, mutates that same User object *in place*, and does not
re-fire the observer — so React holds an unchanged reference and never re-renders. It
never reproduces on reload, never for Google users, and never for you, because your test
account already has a name. *Mitigation:* capture the name from the controlled input into
your own state before calling `createUser`, write it to `/presence` yourself, fire
`updateProfile` unawaited. **Never `setUser({...auth.currentUser})`** — `User` is a class
instance whose methods include `getIdToken()`; spreading it silently loses that and breaks
the Phase-2 handoff days later.

**R12 — Vercel Hobby cannot connect to Git-organization-owned repos.** Verbatim from
Vercel's limits page. Cohort repos very commonly live under a GitHub org, and Hobby's
non-commercial restriction means "just make a Team" is a paid Pro seat. Discovered at
deploy time. *Mitigation:* check repo ownership in the first 15 minutes. Free routes:
deploy from a personal fork, or skip the Git integration and run `vercel --prod` from the
CLI, which carries no org restriction. Hobby also allows only 1 *concurrent* deployment,
so don't auto-deploy every commit during a crunch.

**R13 — `Stage draggable` pan makes every pan gesture also place a phantom rectangle.**
Konva fires a click at the end of a drag, so finishing a pan drops a rectangle where you
released. Siblings land at the same moment: clicking an existing shape stacks a new one on
top, and dragging a shape also drags the stage. All three appear in the first minute of
real use, and the locked click-to-place gesture puts them exactly at this seam.
*Mitigation:* the <5 px + empty-background guard in F2, plus `e.cancelBubble = true` in
each Rect's `onDragStart`. 15 minutes if anticipated; 60–90 minutes of confused debugging
if not.

**R14 — A Spark RTDB overage shuts the database off for the rest of the month, and there
is no safety valve.** Not the day — the calendar month, for the whole project. RTDB's meter
is monthly, so unlike Firestore's daily-resetting op quotas there's no midnight self-heal;
and with billing deliberately not enabled (Decision 6), there is no option to pay through
it either. This is the one risk in this document whose *only* defence is discipline — every
other critical risk has a code fix. The projected 2–3 GB against a 10 GB ceiling is
comfortable, but it rests on an estimated per-message wire size that §9 flags as possibly
2× off. *Mitigation:* treat §4.5's three conservation measures as gate-critical code rather
than optimizations; check the Usage tab daily; act on the §4.5 tripwire table at day 2 and
day 4 instead of hoping; never leave a tab broadcasting overnight. Note the widely-repeated
"360 MB/day Spark cliff" is wrong — that figure is a *paid-tier daily* allowance; Spark is
metered monthly at 10 GB.

### Medium

**R15 — RTDB exists in only three regions and the choice is irreversible.** `us-central1`,
`europe-west1`, `asia-southeast1` — versus dozens for Firestore. Region choice is a bigger
end-to-end latency lever than send rate: a US-East demo against `europe-west1` eats ~90 ms
of RTT that no tuning recovers. The URL format also differs between `us-central1`
(`DATABASE.firebaseio.com`) and the other two (`DATABASE.REGION.firebasedatabase.app`),
which breaks copy-pasted config. *Mitigation:* choose the region first, nearest the graders.

**R16 — rAF-throttled cursor writes have no trailing edge.** rAF doesn't fire in
backgrounded tabs, and a leading-edge coalescer never flushes the final position — so every
time a user stops moving, their remote cursor parks tens of pixels behind. Reads as drift
while measured latency looks fine. Worse: a user who alt-tabs mid-drag stays connected, so
`onDisconnect` doesn't fire and their `draggedBy` claim pins a shape at a frozen in-flight
position for everyone. Graders tab between windows constantly. *Mitigation:* timestamp
throttle with a trailing `setTimeout` flush; treat rAF purely as a rendering scheduler.
Add a `visibilitychange` handler that clears `draggedBy` and removes the cursor node.

**R17 — Presence staleness filter compares a server timestamp against a skewed client
clock.** If the viewer's machine clock is two minutes fast, every remote user is instantly
stale and the presence panel renders **empty** — gate 6 reads as completely broken, on the
grader's machine, never on yours, because your two browsers share one clock.
*Mitigation:* write `lastSeen` with RTDB's `serverTimestamp()` (a different import from
Firestore's identically-named sentinel — mixing them writes an object that never resolves),
subscribe to `.info/serverTimeOffset`, and compare against `Date.now() + offset`. Never
filter your own sessionId, and **fail open** — a ghost is a blemish, an empty list is a
failed gate item.

**R18 — react-konva peer ranges.** `react-konva` declares peers of `react ^19.2.0` and
`konva` separately. If the Vite template scaffolds 19.0.x or 19.1.x you get peer warnings
and possibly a duplicate React copy, surfacing as an opaque reconciler error or "Invalid
hook call" the moment you render a `<Stage>`. Forgetting to install `konva` alongside is
the other common failure. This is the most likely thing to eat hour 1. *Mitigation:* pin
react/react-dom to ^19.2.0 and install konva explicitly; render one hardcoded blue `<Rect>`
and confirm it paints before writing any Firebase code. Also set `noUnusedLocals` and
`noUnusedParameters` to false in tsconfig **now** — the template's `tsc -b && vite build`
refuses to emit after twenty hours of refactoring leaves unused imports. Fallback if `bun
install` fights: delete the lockfile, `npm install`, keep Vite — identical output.

**R19 — Sign-out leaves a ghost user and a permission-denied storm.** `signOut(auth)`
doesn't close the RTDB websocket, so `onDisconnect` doesn't fire and you remain "online"
to the other browser indefinitely — visibly wrong in the exact demo the grader is running.
Meanwhile every still-mounted listener fails the `auth != null` rule and floods the
console. The acceptance test checks tab-close but not sign-out, so this passes our own
suite. *Mitigation:* the ordering in F7, plus keying the listener `useEffect` on
`user?.uid` rather than `[]`.

**R20 — A COOP header silently breaks `signInWithPopup`.** If anything sets
`Cross-Origin-Opener-Policy: same-origin` (a `vercel.json` block copied from a "secure your
Vercel app" post, or a Vite plugin enabling cross-origin isolation), the popup is severed
from `window.opener` and the promise never settles. The user sees consent succeed, then a
dead tab, then an app spinning forever with no error. Confounding this,
`accounts.google.com` emits a *benign* report-only COOP warning even when sign-in works,
so you can burn an hour chasing a non-bug. *Mitigation:* ship no custom security headers;
if a block exists, use `same-origin-allow-popups`. Diagnostic: if the popup *closes* and
the promise resolves, the warning is Google's harmless one; if the popup stays open and
the promise never resolves, it's your header. Also call `signInWithPopup` synchronously as
the first statement in the click handler — any preceding `await` breaks user-gesture
attribution and the popup is blocked.

**R21 — Discrete 20 Hz cursor updates look choppy even when latency is good.** Applying
incoming positions directly means 50 ms jumps, which read as lag. This is a perception
problem, not a latency problem, and gate 5 is judged subjectively. *Mitigation:* the DOM
overlay with `transition: transform 60ms linear` from F5. Do **not** smooth the in-flight
dragged shape — there you want the raw position so the rectangle tracks the remote cursor
exactly.

### Low

**R22 — An empty canvas is indistinguishable from a broken one.** A grader opening a fresh
window onto a cleared canvas sees a blank page with no evidence anything works and no hint
about the click-to-place gesture. *Mitigation:* leave 3–5 rectangles permanently in
`/shapes`; render a one-line hint that fades after the first placement; add labeled
"Seed 500" / "Clear all" buttons so the grader can trigger the stress test themselves.
Implement seeding as a **single multi-path `update()`** — 500 individual `set()` calls
produce 500 separate fan-out events that will visibly stutter the very 60 FPS target the
test is meant to prove.

---

## 6. Out of Scope for MVP

### Deferred — Phase 2 (Friday / Sunday)
- **AI canvas agent** — the entire natural-language feature, tool schema, 6+ commands,
  complex multi-step plans. This is the second half of the project; the MVP is explicitly
  the infrastructure half. Architecturally unblocked: the agent will be a Vercel Function
  at `/api/agent` verifying the caller's Firebase ID token via the Admin SDK, writing to
  the same `/shapes` nodes, which existing client listeners pick up with zero client
  changes. Expose `getIdToken()` from the auth context now, even though nothing consumes it.
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
- Offline mode.
- Full CRDT / OT conflict resolution — LWW plus the `draggedBy` lock is sufficient.
- Follow-mode / viewport following.
- Analytics, telemetry, error monitoring.
- Cloud Functions, Firestore, Firebase Emulator Suite.
- Per-field security rule validation beyond §4.4.
- Account-linking recovery flows (`linkWithCredential`).
- Custom domain, SEO, marketing site, onboarding flow.
- Broad automated test coverage — component rendering tests, Firebase SDK mocks, and E2E
  (Playwright) are all out. What *is* in: targeted unit tests over the pure logic where the
  critical risks live — coordinate transforms, the shapes reducer, the presence staleness
  filter, the cursor throttle. See [TASKS.md](TASKS.md) § Testing Strategy. Everything
  involving a real socket, `onDisconnect`, or multi-client sync is verified manually per §7.

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
8. Refresh B mid-drag → full state reloads, nothing lost.
9. Create ~50 shapes rapidly in A → all appear in B, no drops, no stall.
10. Click "Seed 500" → 500 shapes appear and pan/zoom still holds 60 FPS.
11. Kill A's network for 10s, restore → A reconnects and resyncs without a refresh.
12. Close A's tab → A disappears from B's presence list within 2s.
13. **Sign out** in A (not just close) → A disappears from B's list, no console errors.
14. **Open two tabs in the same browser** → they appear as two cursors, and closing one
    does not remove the other.
15. A alt-tabs away mid-drag → the held shape does not stay locked.
16. Both users leave entirely. Return 5 minutes later → canvas is intact.
17. Fresh incognito window, brand-new email → signup completes with no email step, and
    the display name appears on the cursor immediately, without a reload.
18. Fresh incognito window → "Sign in with Google" completes from **a non-owner Google
    account**, with no unverified-app warning and no unauthorized-domain error.
19. Repeat 17–18 in **Safari**, not just Chrome.

Nineteen green = gate passed. Items 7, 13, 14, 15, 18, and 19 exist because each maps to a
risk in §5 that passes a naive test suite.

---

## 8. Decisions Log

All five open decisions are resolved. Recorded here so the reasoning survives contact
with hour 20, when every one of these will feel worth reopening. They are not open.

| # | Decision | Resolution |
|---|---|---|
| 1 | Realtime backend | **Firebase — Realtime Database only, no Firestore** |
| 2 | Auth method | **Email + password *and* Google OAuth** |
| 3 | MVP shape | **Rectangle only** |
| 4 | Creation gesture | **Click-to-place, fixed size** |
| 5 | Canvas scope | **One global canvas** |
| 6 | Billing | **Spark free tier — billing not enabled** |

**1. Firebase, all-RTDB.** Firebase chosen over Supabase. Within Firebase, RTDB carries
all four traffic classes and Firestore is not provisioned — see §4.2 for the full
argument. The short version: Firestore's only real advantage is querying, this app issues
zero queries, and its daily op quotas are exhausted by cursor traffic in under two
minutes. `onDisconnect()` — server-side, RTDB-exclusive — is what makes gate item 6
tractable at all.

**2. Email + password *and* Google OAuth.** Both ship. Email/password is the fallback that
always works; Google is one click. Two paths also means one auth method failing on demo
day is an inconvenience rather than a gate failure. Firebase does not gate sign-in on
email verification, which removes the single largest non-technical risk from the Supabase
draft of this document.

**3. Rectangle only.** No circle, even as a stretch. The gate asks for "at least one shape
type" — a second one earns zero additional credit and adds a shape-type branch to every
code path the sync layer touches.

**4. Click-to-place, fixed size.** Drag-to-size feels more finished but adds a
gesture-state machine (drag-to-create vs. drag-to-move vs. drag-to-pan) competing for the
same mouse events — a genuine source of hour-19 bugs for cosmetic gain. See R13, which is
the residual risk even with the simpler gesture.

**5. One global canvas.** No rooms, no routing, no join flow. The evaluator signs in and
is *already* in the shared space with everyone else — precisely what the grading scenario
tests.

**6. Spark free tier, billing not enabled.** No paid tier, no card on file. The projection
supports it: 2–3 GB against a 10 GB monthly ceiling, and 15–25 peak connections against
100. What this decision costs is the safety valve — an overage becomes a month-long
outage rather than a ~$1/GB charge, and that failure mode is unrecoverable inside a
one-week sprint. The trade is accepted; the compensating controls are mandatory. Concretely,
this promotes three lines of cursor code (movement-gating, the `visibilitychange` pause,
the `.info/connected` guard) from optimizations to gate-critical, and adds a daily
thirty-second Usage-tab check to the routine. See §4.5 and R14.

---

## 9. Appendix: What Isn't Verified

Every numeric and behavioral claim above was checked against official documentation by
two independent fact-checking passes. These are the items that **could not** be confirmed.
They're listed because a confidently-stated wrong number is worse than an admitted
unknown when you're building a 24-hour schedule around it.

**Contradicted at the source.** Firebase's pricing page shows "50K MAUs" for Spark Auth,
while its auth limits page shows "Tier 1 Daily Active Users: 3000 per day." Both are
official and they disagree. Immaterial under 20 users; the conservative figure is used
above. The same pass found Spark's email caps, which *are* consistent: 150 password
resets/day and only **5 email-link sign-in emails/day** — low enough that one afternoon of
testing a magic-link flow would exhaust it silently. (We don't use magic links.)

**Undocumented, treat as folklore.** The "30–60 seconds" ungraceful-disconnect detection
window — Firebase guarantees `onDisconnect` fires but publishes no timeout, keepalive, or
heartbeat interval. The heartbeat backstop in F6 is the right call *precisely because* the
number is undocumented. Similarly: test-mode's "~30 day" expiry (mechanism real, length
unstated), Firebase Hosting's `max-age=3600` on index.html (empirically reproduced twice,
not documented), and Auth's `auth/too-many-requests` threshold (real behavior, not on any
published quota table — and it triggers on repeated *failed* sign-ins, i.e. by you at hour
21 iterating on the login form).

**Estimated, and it propagates.** Per-message RTDB wire size drives *all* the bandwidth
arithmetic in §4.5. Two research passes disagreed (120 B vs 150–250 B) and neither figure
is documented. The 2–3 GB week projection could be off by ~2× in either direction. Measure
it on day 2 from the console Usage tab rather than trusting the model.

**Mechanism unconfirmed, prescription still correct.** The claim that `onDisconnect`
handlers are *consumed* when they fire could not be found in the docs. Nesting registration
inside `.info/connected` is officially exemplified and correct — but the documented
justification is a race-condition note, not handler consumption. Write the code that way;
don't state the mechanism as fact, or someone will later "optimize" the re-registration
away. The same applies to `updateProfile` not re-firing the auth observer (R11): plausible,
undocumented, and the fix is cheap and correct either way.

**Assumptions worth checking yourself.** That `openid`/`email`/`profile` are classified as
non-sensitive scopes — this is the load-bearing premise under "a grader won't see an
unverified-app screen," and no official page classifying them was found. Verify with a
non-owner Google account before the gate rather than trusting it. That Firebase Auth
authorized domains don't support wildcards (well-attested in community threads, no official
statement) — the practical consequence is that every Vercel *preview* URL breaks Google
sign-in, so do all OAuth testing on localhost and the one stable production alias. And that
a graded cohort project qualifies as personal/non-commercial under Vercel Hobby's fair-use
terms — a judgement call, not a documented determination, and the assumption most likely to
invalidate the hosting recommendation. Check repo ownership (R12) in the first fifteen
minutes.

**Untested.** No verification session actually ran `bun install` or a Bun-driven Vite build
against the Firebase SDK — Bun wasn't installed on either machine. What *is* verified:
`firebase` declares no `engines` field, its dependency tree is entirely `@firebase/*`
scoped packages with no native or postinstall components, and a Node-driven Vite build
completed cleanly. Residual risk is low but genuinely untested; the fallback in R18 costs
nothing.

**Version-pinned.** The bundle sizes (71 KB gzipped for app+auth+RTDB, 205 KB with
Firestore) are the highest-confidence numbers here — measured independently twice, agreeing
within ~1% across seven build combinations — but they're pinned to `firebase@12.16.0` and
`vite@7.3.6`. Treat the *ratio* as durable and the absolute numbers as version-specific.
Note current Vite latest is 8.x, so pin a major explicitly.
