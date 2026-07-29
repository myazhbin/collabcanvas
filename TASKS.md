# CollabCanvas — MVP Task List

Companion to [PRD.md](PRD.md). Every task traces to a feature (`F1`–`F10`) or a risk
(`R1`–`R22`) in that document.

**Convention:** `+` = file created · `~` = file edited · `🧪` = test task
**Order matters.** PRs 1–3 are infrastructure that everything else sits on. PRs 5–6
(presence, cursors) come *before* shapes deliberately — the brief is explicit that
multiplayer-last equals failure.

---

## Testing Strategy

**Framework:** Vitest — Vite-native, shares `vite.config.ts`, needs essentially no setup.

**The principle:** *test pure functions, not Firebase.* Every test target below is a
function deliberately extracted from its hook so it can be verified without mounting React,
connecting to RTDB, or mocking the SDK. This is not a coincidence — the risks that survived
to be rated critical in the PRD are precisely the ones that are **invisible in the UI on
localhost** (coordinate drift, echo suppression, fail-open filters), and those are exactly
the ones that reduce to pure logic.

**What we are deliberately NOT testing:**
- Firebase SDK behaviour — that's Google's test suite, not yours
- React component rendering — high mocking cost, near-zero risk coverage
- The RTDB wire, `onDisconnect`, real multi-client sync — **covered by PR 11's manual
  pass**, which is the honest verification for those

**Tiers**, because the schedule is tight:

| Tier | What | Cost | Rule |
|---|---|---|---|
| **1** | Catches bugs that are invisible on localhost and cost the gate | ~1h | In the plan. Write these. |
| **2** | Catches bugs you'd find manually, but slower | ~45m | Opportunistic — only if a PR lands early. |
| **3** | RTDB rules integration via emulator | ~1h + Java | Only if you're ahead at hour 12. See PR 2. |

**For your coding agent:** each 🧪 task below names the exact invariant to assert. Write the
test *first*, hand it to the agent alongside the task, and the test becomes the acceptance
criterion — which is materially more reliable than reading generated code and judging it by
eye.

---

## File Structure

```
collabcanvas/
├── database.rules.json           # RTDB security rules (§4.4)
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── vite.config.ts                # + vitest `test` block
├── PRD.md
├── TASKS.md
├── ARCHITECTURE.md               # mermaid diagrams — renders natively on GitHub
├── README.md                     # setup guide + architecture + deployed link
├── public/
└── src/
    ├── main.tsx                  # React root
    ├── App.tsx                   # auth gate → LoginPage | CanvasPage
    ├── index.css                 # Tailwind entry + cursor overlay styles
    │
    ├── lib/
    │   ├── firebase.ts           # initializeApp, getAuth, getDatabase (config hardcoded)
    │   ├── session.ts            # sessionId = crypto.randomUUID(), once per tab   [R2]
    │   ├── colors.ts             # uid → stable colour; rectangle fill palette
    │   ├── coords.ts          🧪 # PURE world↔screen + zoomAtPoint                 [R3]
    │   ├── coords.test.ts     🧪
    │   ├── throttle.ts        🧪 # PURE timestamp throttle WITH trailing flush     [R16]
    │   ├── throttle.test.ts   🧪
    │   └── types.ts              # Shape, PresenceEntry, CursorEntry
    │
    ├── auth/
    │   ├── AuthProvider.tsx      # wires authMachine to onAuthStateChanged
    │   ├── authMachine.ts     🧪 # PURE three-state reducer + timeout logic        [R4]
    │   ├── authMachine.test.ts🧪
    │   ├── useAuth.ts
    │   ├── LoginPage.tsx         # email/password + Google + demo credentials
    │   ├── SignupForm.tsx        # captures displayName into state BEFORE call     [R11]
    │   ├── GoogleButton.tsx      # signInWithPopup, sync-first in handler          [R20]
    │   ├── authErrors.ts      🧪 # PURE mapAuthError via AuthErrorCodes
    │   └── authErrors.test.ts 🧪
    │
    ├── canvas/
    │   ├── CanvasPage.tsx        # composes stage + overlays + toolbar
    │   ├── CanvasStage.tsx       # Konva <Stage>, layer composition
    │   ├── ShapeLayer.tsx        # <Layer> of rectangles
    │   ├── ShapeRect.tsx         # one <Rect>, drag handlers, lock outline
    │   ├── Toolbar.tsx           # Select | Rectangle mode
    │   ├── useViewport.ts        # pan/zoom state, local-only                       [F1]
    │   ├── placement.ts       🧪 # PURE shouldPlace() guard                         [R13]
    │   ├── placement.test.ts  🧪
    │   └── usePlacement.ts       # thin hook wrapping placement.ts
    │
    ├── sync/
    │   ├── useConnection.ts      # .info/connected + .info/serverTimeOffset         [R9,R17]
    │   ├── shapesReducer.ts   🧪 # PURE Map reducer for child events                [R6,R7]
    │   ├── shapesReducer.test.ts 🧪
    │   ├── useShapes.ts          # onChildAdded/Changed/Removed → shapesReducer
    │   ├── shapeWrites.ts        # create / move / delete / claim / release
    │   ├── shapeLocks.ts      🧪 # PURE canDrag() predicate                         [R10]
    │   ├── shapeLocks.test.ts 🧪
    │   ├── presenceUtils.ts   🧪 # PURE dedupeByUid() + isStale()                   [R2,R17]
    │   ├── presenceUtils.test.ts 🧪
    │   ├── usePresence.ts        # /presence/{sessionId} + heartbeat
    │   └── useCursors.ts         # /cursors/{sessionId}, world coords, 20Hz
    │
    ├── overlay/
    │   ├── CursorOverlay.tsx     # absolutely-positioned DOM, NOT Konva             [R3,R21]
    │   ├── RemoteCursor.tsx      # arrow + name label, CSS transition
    │   ├── PresenceBar.tsx       # who's online, deduped by uid
    │   └── ConnectionBadge.tsx   # "Reconnecting…" when .info/connected is false
    │
    └── dev/
        ├── seed.ts            🧪 # PURE buildSeedUpdate() multi-path object         [R22]
        ├── seed.test.ts       🧪
        └── SeedControls.tsx      # Seed 500 / Clear all buttons
```

**Note the shape of this:** eight `.ts` files exist separately from their hooks *purely so
they can be tested*. That split costs nothing — you were writing the logic anyway — and it
is what makes the whole testing plan fit inside an hour.

**Deliberately absent:** `vercel.json` (custom headers break `signInWithPopup` — R20),
`firebase.json` (only if you take the reserve-hosting fallback), `.env` files (config is
hardcoded — R1), any Firestore file, any E2E/Playwright directory.

---

## Phase 0 — Console Setup (no PR, but blocks everything)

Do this before writing a line of code. Ordering is load-bearing (PRD §4.6) and several
steps are painful or impossible to reverse.

- [ ] Confirm the GitHub repo is **personally owned**, not org-owned — Vercel Hobby cannot
      connect to org repos `[R12]`
- [ ] Create the Firebase project signed in with a **personal @gmail.com**, not a
      Workspace/school/company account `[R8]`
- [ ] **Provision RTDB first**, region `us-central1` — before registering the web app, or
      `databaseURL` is missing from the config `[R15]`
- [ ] Register the web app; copy the config object
- [ ] Enable **both** Email/Password and Google sign-in providers `[R8]`
- [ ] Add `localhost` to Authorized domains — **not present by default** since 2025-04-28
- [ ] Google Cloud Console → Audience = **External**, Publishing status = **In production**
- [ ] Paste the §4.4 rules into the RTDB Rules tab and **Publish** — never accept test mode `[R5]`
- [ ] **Stay on Spark — do not enable billing** (Decision 6). Bookmark
      console → Realtime Database → **Usage**; you are checking it daily, and it is the
      only early warning that a 10 GB overage — which shuts the database off for the rest
      of the calendar month — is coming `[R14]`

---

## PR 1 — Scaffold, Konva smoke test, first deploy
**Closes gate 8** (deployed) · **~1.75h** · `feat: scaffold vite+react+konva+vitest, deploy`

The whole point is to hit production in hour 1, not hour 20 `[R1]`.

**Files:** `+package.json` `+tsconfig.json` `+tsconfig.app.json` `+vite.config.ts`
`+index.html` `+src/main.tsx` `+src/App.tsx` `+src/index.css` `+README.md`

- [ ] `bun create vite` → React + TypeScript template
- [ ] **Pin `react` and `react-dom` to `^19.2.0`** and install `konva` explicitly alongside
      `react-konva` — peer mismatch is the most likely thing to eat hour 1 `[R18]`
- [ ] Pin the Vite major explicitly (latest is 8.x; PRD figures were measured on 7.x)
- [ ] Install Tailwind; wire the entry into `src/index.css`
- [ ] `~tsconfig.app.json` — set `noUnusedLocals: false` and `noUnusedParameters: false`
      **now**, or `tsc -b && vite build` refuses to emit at hour 20 `[R18]`
- [ ] Render one hardcoded blue `<Rect>` in a `<Stage>` and confirm it paints **before**
      touching Firebase `[R18]`
- [ ] Push to GitHub, import to Vercel, deploy
- [ ] Confirm the Bun install/build succeeds on Vercel; if it fights, delete the lockfile
      and use npm — identical Rollup output `[R18]`
- [ ] Pin a stable production alias and note the bare hostname
- [ ] Add that hostname to Firebase Authorized domains `[R8]`
- [ ] **Do not create `vercel.json`** `[R20]`

**🧪 Test setup — Tier 1 · ~15m**
- [ ] `bun add -d vitest` and add a `test` block to `~vite.config.ts` (environment `node`
      is sufficient — no jsdom needed, since nothing under test touches the DOM)
- [ ] Add `"test": "vitest run"` and `"test:watch": "vitest"` to `~package.json`
- [ ] Write one trivial passing test to prove the harness runs
- [ ] **Do not** add tests to the Vercel build command — a red test must not block a deploy
      when deployment is itself a gate item `[R1]`

**Done when:** the deployed URL renders a blue rectangle in a fresh incognito window, and
`bun run test` passes locally.

---

## PR 2 — Firebase wiring, rules in repo, connection state
**~1h** (+1h if Tier 3) · `feat: firebase init, rtdb rules, connection state`

**Files:** `+src/lib/firebase.ts` `+src/lib/session.ts` `+src/lib/types.ts`
`+src/sync/useConnection.ts` `+database.rules.json` `~src/App.tsx`

- [ ] `firebase.ts` — `initializeApp`, `getAuth`, `getDatabase`. **Hardcode the config
      object**; the web API key is public by design, and this deletes the entire
      `VITE_`-prefix failure class `[R1]`
- [ ] Assert `databaseURL` is present at startup and throw a legible error if not `[R15]`
- [ ] `session.ts` — `export const sessionId = crypto.randomUUID()`, module-level so it's
      once per tab `[R2]`
- [ ] `types.ts` — `Shape`, `PresenceEntry`, `CursorEntry` interfaces matching §4.3
- [ ] `useConnection.ts` — subscribe to `.info/connected` and `.info/serverTimeOffset`;
      expose `{ connected, offset }` `[R9,R17]`
- [ ] `database.rules.json` — commit the §4.4 ruleset. **If you ever run `firebase init`,
      copy the console rules here before the first `firebase deploy`** `[R5]`
- [ ] Temporary: render connection status in the corner to prove the socket works

**🧪 RTDB rules integration — Tier 3 · ~1h · only if ahead of schedule**

The one test here worth real money is R5's third trap: *a read granted only at
`/shapes/$id` makes a listener on `/shapes` fail with `PERMISSION_DENIED`.* That failure
costs 45 minutes of debugging and looks exactly like a broken sync layer.

- [ ] **Check `java -version` first** — the database emulator requires a JRE. If it's
      absent, skip this tier entirely rather than installing a JDK at hour 3.
- [ ] `bun add -d @firebase/rules-unit-testing firebase-tools`
- [ ] Point the emulator at the **committed `database.rules.json`**, not the console
- [ ] Assert: unauthenticated read of `/shapes` is **denied**
- [ ] Assert: authenticated read of `/shapes` — *the collection path, not a child* — is
      **allowed** `[R5]`
- [ ] Assert: authenticated write to `/shapes/{id}`, `/cursors/{id}`, `/presence/{id}` all
      allowed
- [ ] Assert: read of an unlisted path (e.g. `/admin`) is **denied** — proves the top-level
      `false` default actually defaults `[R5]`

> ⚠️ Running `firebase init` to get the emulator scaffolds local rule files that a later
> `firebase deploy` will push **over your console rules**. If you take this tier, treat
> `database.rules.json` as the single source of truth from that moment on `[R5]`.

**Done when:** the deployed app logs `connected: true` and a non-null server offset.

---

## PR 3 — Authentication
**Closes gate 7** · **~3.3h** · `feat: email/password + google auth with three-state gate`

The highest-risk PR in the build. Five separate risks live here.

**Files:** `+src/auth/AuthProvider.tsx` `+src/auth/authMachine.ts` `+src/auth/useAuth.ts`
`+src/auth/LoginPage.tsx` `+src/auth/SignupForm.tsx` `+src/auth/GoogleButton.tsx`
`+src/auth/authErrors.ts` `~src/App.tsx` `~src/main.tsx`

- [ ] `authMachine.ts` — extract the three-state logic (`'loading' | 'signedIn' |
      'signedOut'`) as a **pure reducer** plus a timeout decision function, so it can be
      tested without Firebase
- [ ] `AuthProvider.tsx` — wire `onAuthStateChanged` to the machine; state starts
      `'loading'`, resolved in the first callback `[R4]`
- [ ] **3–5s timeout** that force-exits `loading` → `signedOut`; without it, an IndexedDB
      `AbortError` white-screens normal Safari forever `[R4]`
- [ ] Render a **neutral splash** while loading — never the login form, or the grader sees
      it flash on every reload `[R4]`
- [ ] **Do not call `setPersistence`** — the default is already correct and calling it
      downgrades IndexedDB to localStorage
- [ ] Expose `getIdToken()` from the context now, for the Phase-2 agent endpoint
- [ ] **Never `setUser({...auth.currentUser})`** — spreading the class instance silently
      loses `getIdToken` `[R11]`
- [ ] `SignupForm.tsx` — capture `displayName` from the controlled input into React state
      **before** calling `createUserWithEmailAndPassword`; fire `updateProfile` unawaited `[R11]`
- [ ] Inline "at least 6 characters" hint on the password field
- [ ] `GoogleButton.tsx` — `signInWithPopup` as the **first statement** in the click
      handler, no preceding `await`, with `prompt: 'select_account'` `[R20]`
- [ ] Never `signInWithRedirect`; never `sendEmailVerification`; never gate on `emailVerified`
- [ ] `authErrors.ts` — single `mapAuthError` switch on `AuthErrorCodes` (imported, not
      hand-typed strings), with `default: return err.message`
- [ ] Sign-out in this exact order: `onDisconnect().cancel()` → `remove()` presence and
      cursor → `signOut()` — wired fully in PR 5 `[R19]`
- [ ] Mount all data listeners inside a `useEffect` keyed on `user?.uid`, never `[]` `[R4,R19]`

**🧪 `authMachine.test.ts` — Tier 2 · ~15m**

This tests the one thing you **cannot reproduce manually**: the Safari IndexedDB hang.
Use `vi.useFakeTimers()`.

- [ ] Initial state is `'loading'` — never `'signedOut'`, or the login form flashes `[R4]`
- [ ] A user event resolves to `'signedIn'`; a null event resolves to `'signedOut'`
- [ ] **If no event ever arrives, state becomes `'signedOut'` after the timeout** — this is
      the assertion that prevents a permanent white screen in Safari `[R4]`
- [ ] An event arriving *after* the timeout fired still transitions correctly (no stuck state)
- [ ] The timeout is cancelled once an event arrives — no late override of `'signedIn'`

**🧪 `authErrors.test.ts` — Tier 2 · ~5m**
- [ ] Known codes map to human strings
- [ ] **An unknown code never returns `undefined`** — a blank error box reads as a broken form
- [ ] `POPUP_CLOSED_BY_USER` returns null (swallowed silently, not shown as an error)

**Done when:** signup, email login, and Google login all work **on the deployed URL** from
a fresh incognito window — and Google works from a **non-owner** account `[R8]`.

---

## PR 4 — Canvas pan & zoom
**Closes gate 1** · **~1.75h** · `feat: pannable zoomable konva stage`

**Files:** `+src/canvas/CanvasPage.tsx` `+src/canvas/CanvasStage.tsx`
`+src/canvas/useViewport.ts` `+src/lib/coords.ts` `~src/App.tsx`

- [ ] `coords.ts` — **pure** `worldToScreen`, `screenToWorld`, `zoomAtPoint`, taking an
      explicit `{ scale, x, y }` viewport. Keep all viewport math here; hooks only hold state
- [ ] `useViewport.ts` — stage scale + position. **Local-only, never synced** `[F1]`
- [ ] Zoom-to-cursor on wheel, clamped ~10%–400%
- [ ] Pan via space-drag / middle-drag / trackpad scroll
- [ ] World space ~10,000 × 10,000
- [ ] Separate `<Layer>`s from the start — shapes and cursors must never share one `[R7]`
- [ ] Verify 60 FPS in DevTools during continuous pan and zoom

**🧪 `coords.test.ts` (part 1) — Tier 2 · ~10m**
- [ ] **Zoom-to-cursor invariant:** the world point under the pointer before
      `zoomAtPoint` is still under the pointer after. Assert across several scales — this
      is the single easiest piece of viewport math to get subtly wrong
- [ ] Scale clamps hold at both ends; a zoom-out at min scale is a no-op

**Done when:** pan and zoom are smooth and the viewport does not sync between two browsers.

---

## PR 5 — Presence
**Closes gate 6** · **~2.4h** · `feat: rtdb presence with ondisconnect and heartbeat`

**Files:** `+src/sync/usePresence.ts` `+src/sync/presenceUtils.ts`
`+src/overlay/PresenceBar.tsx` `+src/overlay/ConnectionBadge.tsx` `+src/lib/colors.ts`
`~src/canvas/CanvasPage.tsx` `~src/auth/AuthProvider.tsx`

- [ ] `presenceUtils.ts` — **pure** `dedupeByUid(entries)` and
      `isStale(lastSeen, now, offset)`, extracted so both can be tested
- [ ] Write `/presence/{sessionId}` — **keyed by sessionId, never uid** `[R2]`
- [ ] Register `onDisconnect().remove()` **inside** the `.info/connected` callback, and
      **await it before** writing the online value `[R9]`
- [ ] 10s heartbeat writing `lastSeen` with RTDB's `serverTimestamp()` — note this is a
      *different import* from Firestore's identically-named sentinel `[R17]`
- [ ] `colors.ts` — deterministic uid → colour, stable across sessions
- [ ] `PresenceBar.tsx` — dedupe by `uid`; distinguish yourself
- [ ] `ConnectionBadge.tsx` — "Reconnecting…" when `.info/connected` is false
- [ ] Complete the sign-out teardown ordering from PR 3 `[R19]`

**🧪 `presenceUtils.test.ts` — Tier 1 · ~15m**

Two of the highest-value assertions in the whole plan. Both encode risks that fail the gate
and neither is obvious from reading the code.

- [ ] **`dedupeByUid`: two sessionIds sharing one uid collapse to ONE presence entry** —
      but the caller still has two cursor keys. This is R2 expressed as an assertion `[R2]`
- [ ] `dedupeByUid` preserves distinct uids and is order-independent
- [ ] **`isStale` fails OPEN:** a missing, null, or unparseable `lastSeen` returns
      `false` (show the user). An empty presence list is a failed gate item; a ghost is a
      blemish `[R17]`
- [ ] **Clock-skew case:** with the viewer's clock 2 minutes fast, a fresh `lastSeen` is
      **not** stale once `serverTimeOffset` is applied — and *is* wrongly stale without it.
      Assert both, so the test documents why the offset exists `[R17]`
- [ ] A genuinely old `lastSeen` (>30s) is stale

**🧪 `colors.test.ts` — Tier 2 · ~3m**
- [ ] Same uid → same colour across calls (determinism is the entire contract)
- [ ] Output is always a valid colour string, including for empty/odd uids

**Done when:** two browsers see each other within 2s; closing a tab clears within 2s; and
**two tabs of the same browser appear as two users** `[R2]`.

---

## PR 6 — Multiplayer cursors
**Closes gate 5** · **~2.4h** · `feat: world-space multiplayer cursors with name labels`

**Files:** `+src/sync/useCursors.ts` `+src/overlay/CursorOverlay.tsx`
`+src/overlay/RemoteCursor.tsx` `+src/lib/throttle.ts` `~src/lib/coords.ts`
`~src/index.css` `~src/canvas/CanvasPage.tsx`

- [ ] `throttle.ts` — timestamp throttle **with a trailing `setTimeout` flush**. rAF is a
      rendering scheduler, never the network throttle `[R16]`
- [ ] Publish `/cursors/{sessionId}` as `{ u: uid, x, y }` — name and colour live in
      `/presence` and are **not** resent per frame
- [ ] **World coordinates** via `stage.getRelativePointerPosition()` `[R3]`
- [ ] Convert back via `coords.ts` on render
- [ ] Render as **absolutely-positioned DOM elements above the stage**, not Konva nodes —
      keeps cursor ticks off the shape render path and stops arrows scaling with zoom `[R3,R21]`
- [ ] `transition: transform 60ms linear` in `index.css` `[R21]`
- [ ] **Movement-gate writes** — skip entirely when the pointer hasn't moved. On Spark with
      no billing valve this is not an optimization; it is roughly half the bandwidth
      budget `[R14]`
- [ ] Gate all writes on `.info/connected` `[R9,R14]`
- [ ] `visibilitychange` handler: remove the cursor node on hide, resume on show. Also the
      overnight-tab protection — the single realistic way to blow the monthly cap `[R16,R14]`
- [ ] Render a cursor **only** if its sessionId also exists in `/presence` `[R9]`
- [ ] Put a client timestamp in the payload to measure real end-to-end latency `[F5]`

**🧪 `throttle.test.ts` — Tier 1 · ~10m**

R16 is close to untestable by hand — the symptom is a cursor parking a few pixels behind
when motion stops, which you will not reliably notice while driving two browsers yourself.

- [ ] Leading call fires immediately
- [ ] Calls inside the window are suppressed
- [ ] **The final call always lands after the window elapses** — the trailing flush. This
      is the whole assertion; without it remote cursors drift on every stop `[R16]`
- [ ] The trailing flush delivers the **latest** value, not a stale intermediate one
- [ ] Cancelling clears a pending trailing call (no write after unmount/hide)

**🧪 `coords.test.ts` (part 2) — Tier 1 · ~10m**

R3 is critical, invisible on localhost, and reduces to one round-trip assertion.

- [ ] **Round-trip:** `screenToWorld(worldToScreen(p, vp), vp) === p` (within float
      epsilon), across a matrix of scales (0.25, 1, 4) and pans including large offsets `[R3]`
- [ ] **A world point is identical for two different viewports** — the actual multiplayer
      invariant. Two users at different pan/zoom must resolve the same world coordinate to
      different screen points, and back to the same world point `[R3]`
- [ ] A pan of 2000px changes the screen position but not the world position — this is
      exactly acceptance-test item 6, verified in milliseconds instead of two browsers

**Done when:** pan one browser 2000px away from the other and both cursors still land on
the same point `[R3]`.

---

## PR 7 — Shape creation & local manipulation
**Closes gates 2, 3** · **~2.75h** · `feat: click-to-place rectangles with local drag`

Local only. No sync yet — that's PR 8.

**Files:** `+src/canvas/Toolbar.tsx` `+src/canvas/ShapeLayer.tsx` `+src/canvas/ShapeRect.tsx`
`+src/canvas/placement.ts` `+src/canvas/usePlacement.ts` `~src/canvas/CanvasStage.tsx`
`~src/lib/colors.ts`

- [ ] `placement.ts` — **pure** `shouldPlace({ down, up, targetIsStage })` returning boolean
- [ ] `usePlacement.ts` — thin hook holding pointer state, delegating the decision
- [ ] Place only if the pointer moved **<5px** between down and up **AND**
      `e.target === e.target.getStage()`. Without both, finishing a pan drops a phantom
      rectangle and clicking a shape stacks one on top `[R13]`
- [ ] Fixed ~120×80 rectangle centered on the click point; fill cycled from the palette
- [ ] After placing, return to Select mode with the new shape selected
- [ ] `ShapeRect.tsx` — `e.cancelBubble = true` in `onDragStart`, or dragging a shape also
      drags the stage `[R13]`
- [ ] `perfectDrawEnabled={false}` and `shadowForStrokeEnabled={false}` on every Rect `[R7]`
- [ ] Selection outline; click empty canvas to deselect
- [ ] Delete/Backspace removes the selected shape

**🧪 `placement.test.ts` — Tier 2 · ~8m**

The guard has two conditions and the bug is that agents routinely implement only one.

- [ ] 0px movement on the stage background → **place**
- [ ] 4px movement on the stage background → **place** (tolerance, for shaky clicks)
- [ ] 50px movement on the stage background → **do not place** (this is a pan) `[R13]`
- [ ] 0px movement but the target is a shape → **do not place** (this is a selection) `[R13]`
- [ ] Diagonal movement uses true distance, not per-axis — 4px x *and* 4px y is 5.7px,
      which should not place

**Done when:** panning never creates a phantom rectangle and dragging a shape never pans
the stage `[R13]`.

---

## PR 8 — Shape sync & soft locking
**Closes gate 4** · **~3.6h** · `feat: realtime shape sync with draggedby soft lock`

The core of the project. Everything before this was setup. Also the densest test target —
R6 and R7 are both critical, both invisible on localhost, and both reduce to reducer logic.

**Files:** `+src/sync/useShapes.ts` `+src/sync/shapesReducer.ts` `+src/sync/shapeWrites.ts`
`+src/sync/shapeLocks.ts` `~src/canvas/ShapeLayer.tsx` `~src/canvas/ShapeRect.tsx`
`~src/canvas/CanvasPage.tsx`

- [ ] `shapesReducer.ts` — **pure** reducer over `{type: 'added'|'changed'|'removed'}`
      events against a `Map`, taking the actively-dragging id set as an argument
- [ ] `useShapes.ts` — `onChildAdded` / `onChildChanged` / `onChildRemoved` feeding the
      reducer. **Never `onValue` on `/shapes`** — it delivers a full 500-element snapshot
      on every child change `[R7]`
- [ ] Batch the initial load into a single state update behind an explicit loading state `[R7]`
- [ ] `shapeWrites.ts` — `set()` to create, throttled `update({x,y})` at 20Hz **to the same
      `/shapes/{id}` node** during drag, final `update()` on release, `remove()` to delete
- [ ] Attach `.catch(err => console.error('rtdb write rejected', err))` to **every** write —
      a rules rejection otherwise presents as a shape that appears and silently vanishes `[R5]`
- [ ] Local-drag suppression via a ref `Set` of dragging ids, applied inside the reducer `[R6]`
- [ ] Release the id in `onDragEnd` only **after** the final write resolves `[R6]`
- [ ] `shapeLocks.ts` — **pure** `canDrag(shape, myUid)` predicate
- [ ] Set `draggedBy: uid` on dragstart, clear on dragend, register an `onDisconnect` that
      clears it so a crashed client can't lock a shape forever `[R10]`
- [ ] Coloured outline on shapes another user is holding `[R10]`
- [ ] `visibilitychange` clears `draggedBy` `[R16]`

**🧪 `shapesReducer.test.ts` — Tier 1 · ~20m**

The most valuable test file in the project. Every assertion here maps to a bug that looks
like "sync is broken" and takes an hour to diagnose from the UI.

- [ ] `added` inserts; `removed` deletes; `changed` updates the right entry
- [ ] **`changed` on one shape leaves every OTHER entry referentially identical** — this is
      what makes memoised `ShapeRect` components skip re-rendering, and it's the difference
      between 60 FPS and 6 FPS at 500 objects `[R7]`
- [ ] **A `changed` event for an id in the dragging set is IGNORED** — the echo-suppression
      assertion. Without it your own write fights your pointer `[R6]`
- [ ] A `changed` event for an id **not** in the dragging set is applied normally
- [ ] **A `removed` event clears the id from the dragging set** — otherwise a shape deleted
      mid-drag stays permanently suppressed and later re-adds are silently dropped `[R6]`
- [ ] Initial batch of 500 `added` events produces one Map of 500, not 500 intermediate
      states `[R7]`

**🧪 `shapeLocks.test.ts` — Tier 2 · ~3m**
- [ ] `draggedBy: null`/absent → draggable by anyone
- [ ] `draggedBy === myUid` → draggable (your own claim never locks you out — a real bug
      if the predicate is written as a bare truthiness check) `[R10]`
- [ ] `draggedBy === otherUid` → not draggable `[R10]`

**Done when:** two users grabbing the same rectangle produces a clean lockout, not
oscillation `[R10]`.

---

## PR 9 — Performance hardening
**Closes F10** · **~1.5h** · `perf: layer separation and 500-object tuning`

No tests — this is profiling, and a frame-rate assertion in CI would be pure flake.

**Files:** `~src/canvas/CanvasStage.tsx` `~src/canvas/ShapeLayer.tsx`
`~src/overlay/CursorOverlay.tsx`

- [ ] Shapes and cursors on **separate `<Layer>`s** — each Layer is its own canvas, so a
      cursor tick must not repaint 500 rectangles `[R7]`
- [ ] `listening={false}` on the cursor layer `[R7]`
- [ ] Total layers under four `[R7]`
- [ ] Memoise `ShapeRect` — this is what cashes in the referential-identity guarantee
      asserted in PR 8's reducer test `[R7]`
- [ ] Profile with 500 shapes + 2 users moving: confirm 60 FPS during pan, zoom, and drag
- [ ] Measure real cursor latency from the payload timestamp and record the actual number —
      a 20Hz send rate adds up to 50ms *before* the wire `[F5]`
- [ ] Check the Firebase console Usage tab against the §4.5 projection and **tripwire
      table**. Confirm movement-gating actually fires — the cheapest way is to leave a tab
      idle for five minutes and verify usage barely moves `[R14]`

**Done when:** 500 shapes and 2 active users hold 60 FPS on the deployed build.

---

## PR 10 — Grader affordances
**~1.65h** · `feat: demo accounts, seed controls, onboarding hint, readme`

Low effort, high grading yield. Do not skip this for more features.

**Files:** `+src/dev/seed.ts` `+src/dev/SeedControls.tsx` `~src/auth/LoginPage.tsx`
`~src/canvas/CanvasPage.tsx` `~README.md`

- [ ] Pre-create **three demo accounts** and print the credentials on the login screen
      under "Try it instantly" — gates 4, 5 and 6 all need two identities `[F7]`
- [ ] Leave 3–5 rectangles permanently in `/shapes` `[R22]`
- [ ] One-line hint that fades after the first placement `[R22]`
- [ ] `seed.ts` — **pure** `buildSeedUpdate(n)` returning the multi-path object
- [ ] `SeedControls.tsx` — "Seed 500" / "Clear all", calling a **single** `update()` `[R22]`
- [ ] `README.md` — setup guide, deployed link, and the documented last-write-wins +
      soft-lock conflict choice. Link [ARCHITECTURE.md](ARCHITECTURE.md) for the
      architecture overview — GitHub renders the mermaid inline `[submission req.]`

**🧪 `seed.test.ts` — Tier 2 · ~5m**
- [ ] `buildSeedUpdate(500)` returns **one object with 500 keys** — not an array of calls.
      500 individual `set()`s fan out as 500 events and visibly stutter the exact 60 FPS
      target the seed button exists to demonstrate `[R22]`
- [ ] Keys are correctly path-prefixed (`shapes/<id>`) and every value is a complete,
      valid `Shape` — a missing field here writes malformed nodes to 500 places at once

**Done when:** a stranger can open the URL and be a second live user in under 30 seconds.

---

## PR 11 — Acceptance pass
**~2h** · `fix: acceptance pass findings`

Run all 19 items in PRD §7 **on the deployed URL**, in fresh incognito windows. This is the
verification layer for everything the unit tests deliberately don't cover — real
`onDisconnect` behaviour, real network, real multi-client sync.

- [ ] Items 1–6: two browsers, presence, cursors, placement, drag, zoom mismatch
- [ ] Item 7: same-rectangle contention → clean lockout `[R10]`
- [ ] Items 8–11: refresh mid-drag, 50 rapid shapes, Seed 500, network kill/restore
- [ ] Item 12: tab close clears presence
- [ ] Item 13: **sign out** (not close) clears presence, no console storm `[R19]`
- [ ] Item 14: **two tabs, same browser** → two cursors, closing one keeps the other `[R2]`
- [ ] Item 15: alt-tab mid-drag does not leave a shape locked `[R16]`
- [ ] Item 16: full departure and return, canvas intact
- [ ] Item 17: brand-new email, display name on cursor immediately, no reload `[R11]`
- [ ] Item 18: Google sign-in from a **non-owner** account, no warning screen `[R8]`
- [ ] Item 19: repeat 17–18 in **Safari** `[R4]`
- [ ] `bun run test` green before the final push
- [ ] Final: open the exact URL you're about to submit in a fresh incognito window and
      click the Google button before pasting it anywhere `[R8]`

**Done when:** nineteen green.

---

## Test Coverage Map

Which risks are covered by an automated assertion versus only by the manual pass:

| Risk | Severity | Covered by |
|---|---|---|
| R3 — cursor coordinate drift | Critical | 🧪 `coords.test.ts` **+** manual item 6 |
| R4 — auth resolves late / Safari hang | Critical | 🧪 `authMachine.test.ts` **+** manual item 19 |
| R6 — echo fights local drag | Critical | 🧪 `shapesReducer.test.ts` |
| R7 — full-snapshot re-render | Critical | 🧪 `shapesReducer.test.ts` (identity) + profiling |
| R2 — uid-keyed presence | Critical | 🧪 `presenceUtils.test.ts` **+** manual item 14 |
| R5 — rules deny the listen path | Critical | 🧪 Tier 3 only — otherwise manual |
| R10 — same-shape contention | High | 🧪 `shapeLocks.test.ts` **+** manual item 7 |
| R13 — phantom rect on pan | High | 🧪 `placement.test.ts` |
| R16 — no trailing flush | Medium | 🧪 `throttle.test.ts` |
| R17 — staleness filter empties list | Medium | 🧪 `presenceUtils.test.ts` |
| R22 — seed stutters the demo | Low | 🧪 `seed.test.ts` |
| R1, R8, R12 — deploy, OAuth, repo | Critical | **Manual only** — console/platform config |
| R9 — `onDisconnect` re-arming | High | **Manual only** — needs a real socket |
| R11 — displayName race | High | **Manual only** — manual item 17 |
| R14, R15 — quota, region | Medium | **Manual only** — console config |
| R18, R19, R20, R21 | Med/High | **Manual only** |

**Eleven of twenty-two risks get an automated assertion**, including five of the eight
criticals. The uncovered ones are overwhelmingly console configuration and real-socket
behaviour — genuinely not unit-testable, and correctly left to PR 11.

---

## Schedule & Cut Order

| PR | Base | +Tests | Cumulative |
|---|---|---|---|
| 0 — Console setup | 0.5h | — | 0.5h |
| 1 — Scaffold & deploy | 1.5h | +0.25h | 2.25h |
| 2 — Firebase wiring | 1h | *(Tier 3: +1h)* | 3.25h |
| 3 — Auth | 3h | +0.33h | 6.6h |
| 4 — Pan & zoom | 1.5h | +0.17h | 8.25h |
| 5 — Presence | 2h | +0.3h | 10.55h |
| 6 — Cursors | 2h | +0.33h | 12.9h |
| 7 — Shape creation | 2.5h | +0.13h | 15.5h |
| 8 — Shape sync | 3h | +0.4h | 18.9h |
| 9 — Performance | 1.5h | — | 20.4h |
| 10 — Grader affordances | 1.5h | +0.08h | 22h |
| 11 — Acceptance pass | 2h | — | 24h |

**Tier 1 only ≈ 23h. Tier 1 + Tier 2 ≈ 24h against a 24h gate.** That is not slack, it's
a dead heat — so treat Tier 2 as genuinely opportunistic, and skip Tier 3 unless PRs 1–3
land early.

The honest counter-argument for writing them anyway: the PRD prices R13 alone at "60–90
minutes of confused debugging if not anticipated," and R6/R7 present as "sync is broken"
with no error message. Tier 1 costs ~55 minutes total and covers five of the eight critical
risks. If it prevents even one of those debugging sessions it has paid for itself; if it
prevents two, it bought back the slack.

**If you fall behind, cut in this order:**
1. Tier 3 (rules integration) — first thing to go, before it's ever started
2. Tier 2 tests — `placement`, `zoomAtPoint`, `colors`, `seed`, `authErrors`, `shapeLocks`
3. PR 9's memoisation and the 500-object target (F10 is a stated target, not a gate item)
4. PR 10's Seed 500 controls — keep the demo accounts and seeded shapes
5. Nothing else. PRs 1–8 and 11 are all gate items.

**Never cut:** the deploy in PR 1 `[R1]`, the sessionId keying in PR 5 `[R2]`, the four
Tier 1 test files, or the acceptance pass in PR 11.
