# CollabCanvas — MVP Task List

Companion to [PRD.md](PRD.md) and [ARCHITECTURE.md](ARCHITECTURE.md). Every task traces to
a feature (`F1`–`F10`) or a risk (`R1`–`R24`) in the PRD.

**Convention:** `+` = file created · `~` = file edited · `🧪` = test task
**Order matters.** PRs 1–3 are infrastructure everything else sits on. PRs 5–6 (presence,
cursors) come *before* shapes deliberately — the brief is explicit that multiplayer-last
equals failure.

---

## Testing Strategy

Two layers, because the architecture has two kinds of risk.

**Layer 1 — Vitest over pure functions.** Everything in `src/utils` is deliberately written
free of React and Firebase so it can be verified without mounting a component or connecting
to a backend. This is not incidental: the risks rated critical in the PRD are precisely the
ones **invisible in the UI on localhost** — coordinate drift, echo suppression, fail-open
filters, array diffing — and those all reduce to pure logic.

**Layer 2 — Firebase Emulator Suite** (Auth + Firestore + RTDB) for the things that only
break against a real backend: security rules, transaction contention, and multi-client
scenarios. **Requires a JRE — run `java -version` before committing to this.**

**Not tested:** React component rendering (high mocking cost, near-zero risk coverage),
Firebase SDK behaviour itself, and real `onDisconnect` timing — that last one needs a real
socket and belongs to PR 11's manual pass.

**Tiers**, because not every test earns its cost:

| Tier | What | Cost | Rule |
|---|---|---|---|
| **1** | Unit tests for bugs invisible on localhost that cost the gate | ~1h | In the plan. Write these. |
| **2** | Unit tests for bugs you'd find manually, but slower | ~45m | Opportunistic. |
| **3** | Emulator integration: rules + concurrent-write | ~1.5h | High value now that writes are transactional — but the first thing to cut. |

**For your coding agent:** each 🧪 task names the exact invariant to assert. Write the test
first, hand it to the agent alongside the task, and the test becomes the acceptance
criterion — materially more reliable than reading generated code and judging by eye.

---

## File Structure

```
collabcanvas/
├── firebase.json                 # rules deploy targets only — no hosting block         [R5]
├── .firebaserc
├── firestore.rules               # PRD §4.4                                             [R5]
├── database.rules.json           # PRD §4.4                                             [R5]
├── .env                          # gitignored — VITE_FIREBASE_* config            [R1 ⚠]
├── .env.example                  # committed key list; Vercel needs these set      [R1 ⚠]
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.app.json
├── vite.config.ts                # + vitest `test` block; excludes src/tests
├── vitest.emulator.config.ts     # Tier 3 only — `bun run test:emulator`          [R5]
├── PRD.md
├── TASKS.md
├── ARCHITECTURE.md
├── README.md                     # setup guide + deployed link + architecture
├── public/
└── src/
    ├── main.tsx
    ├── App.tsx                   # auth gate → Login | Canvas
    ├── index.css                 # Tailwind entry + cursor overlay styles
    │
    ├── components/
    │   ├── auth/
    │   │   ├── Login.tsx         # email/password + Google + demo credentials
    │   │   └── Signup.tsx        # name → state BEFORE the call                 [R11]
    │   ├── canvas/
    │   │   ├── Canvas.tsx        # Konva Stage, separate Layers                 [R7]
    │   │   ├── Rectangle.tsx     # memoised; cancelBubble on dragStart          [R13]
    │   │   └── Controls.tsx      # Select/Rectangle toolbar, Seed 500/Clear
    │   ├── collaboration/
    │   │   ├── Cursor.tsx        # DOM overlay, NOT Konva                       [R3,R21]
    │   │   └── Presence.tsx      # online list, deduped by uid                  [R2]
    │   └── layout/
    │       └── Navbar.tsx        # user chip, sign out, connection badge        [R19]
    │
    ├── contexts/
    │   ├── AuthContext.tsx       # three-state gate, wires authMachine          [R4]
    │   └── CanvasContext.tsx     # shapes state, dragging Set                   [R6]
    │
    ├── hooks/
    │   ├── useAuth.ts            # exposes getIdToken
    │   ├── useCanvas.ts          # onSnapshot → shapeDiff                       [R7]
    │   ├── useCursors.ts         # session-node cursor, world coords, 20Hz      [R3,R16]
    │   └── usePresence.ts        # session-node presence + heartbeat            [R2,R9]
    │
    ├── services/
    │   ├── firebase.ts           # initializeApp, getAuth, getFirestore, getDatabase
    │   ├── authService.ts        # signup / login / Google / logout
    │   ├── canvasService.ts      # create / move / delete / lock — all via transaction
    │   ├── transactionService.ts # runTransaction wrapper, PURE callbacks       [R23]
    │   ├── cursorService.ts      # session-node writes
    │   └── presenceService.ts    # onDisconnect, heartbeat                      [R9]
    │
    ├── utils/                    # PURE. no React, no Firebase, no side effects
    │   ├── constants.ts          # 10000×10000, shape size, palette, throttle ms
    │   ├── session.ts            # sessionId = crypto.randomUUID() once per tab [R2]
    │   ├── helpers.ts         🧪 # generateUserColor
    │   ├── helpers.test.ts    🧪
    │   ├── coords.ts          🧪 # world↔screen, zoomAtPoint                    [R3]
    │   ├── coords.test.ts     🧪
    │   ├── throttle.ts        🧪 # timestamp throttle WITH trailing flush       [R16]
    │   ├── throttle.test.ts   🧪
    │   ├── shapeDiff.ts       🧪 # array diff, identity preservation, echo skip [R6,R7]
    │   ├── shapeDiff.test.ts  🧪
    │   ├── shapeOps.ts        🧪 # PURE transaction bodies: add/patch/remove    [R23]
    │   ├── shapeOps.test.ts   🧪
    │   ├── shapeLocks.ts      🧪 # canDrag predicate                            [R10]
    │   ├── shapeLocks.test.ts 🧪
    │   ├── presenceUtils.ts   🧪 # dedupeByUid, isStale                         [R2,R17]
    │   ├── presenceUtils.test.ts 🧪
    │   ├── placement.ts       🧪 # shouldPlace guard                            [R13]
    │   ├── placement.test.ts  🧪
    │   ├── authMachine.ts     🧪 # three-state reducer + timeout                [R4]
    │   ├── authMachine.test.ts🧪
    │   ├── authErrors.ts      🧪 # mapAuthError
    │   ├── authErrors.test.ts 🧪
    │   └── types.ts              # Shape, SessionNode, CanvasDoc
    │
    └── tests/
        └── integration/          # Tier 3 — emulator only
            ├── rules.test.ts     # both rulesets                               [R5]
            └── concurrency.test.ts # two clients, different shapes             [R23]
```

**The load-bearing detail:** `src/utils` holds eleven pure modules that could have lived
inside their services. Splitting them out is what makes the test plan fit in an hour — and
`shapeOps.ts` in particular exists so the **transaction bodies are testable without
Firestore**, which is the only cheap way to verify R23.

**Deliberately absent:** any Cloud Functions directory, any Playwright directory. Host
configuration is not covered here — deployment is handled separately, on Vercel, by the
project owner (PRD F9).

**Changed in PR 2:** the plan called for no `.env` at all, config hardcoded, to delete
the env-var failure class outright (R1). The build now reads config from a gitignored
`.env` instead. That trade is live, not theoretical: Vercel builds on its own host, so a
missing var there produces a **successful build that throws at runtime on the deployed
URL only**. `.env.example` and the `databaseURL` guard are the mitigations.

---

## Phase 0 — Console Setup (no PR, but blocks everything)

Ordering is load-bearing (PRD §4.6). Several steps are painful or impossible to reverse.

- [x] Create the Firebase project with a **personal @gmail.com**, not a Workspace/school
      account `[R8]`
- [x] **Provision RTDB first**, region `us-central1` — before registering the web app, or
      `databaseURL` is missing from the config `[R15]`
- [x] **Provision Firestore in production mode** — never test mode `[R5]`
- [x] Register the web app; copy the config object
- [x] Enable **both** Email/Password and Google providers `[R8]`
- [x] Authorized domains: **read the list**, add `localhost` if missing (not present by
      default since 2025-04-28), and don't assume the hosting domains are there `[R8]`
- [x] Google Cloud Console → Audience = **External**, Publishing = **In production** `[R8]`
- [x] Paste **both** rulesets from PRD §4.4 and Publish `[R5]`
- [x] **Stay on Spark — do not enable billing** (Decision 6). Bookmark **both** Usage tabs,
      Firestore and Realtime Database. Firestore blowing up costs a day; RTDB blowing up
      costs the rest of the calendar month `[R14]`

---

## PR 1 — Scaffold and Konva smoke test
**~1.5h** · `feat: scaffold vite+react+konva+vitest`

Deployment is not part of this PR — it is handled separately, on Vercel, by the project
owner. Get a URL live early anyway `[R1]`.

**Files:** `+package.json` `+tsconfig.json` `+tsconfig.app.json` `+vite.config.ts`
`+index.html` `+src/main.tsx` `+src/App.tsx` `+src/index.css` `+README.md`

- [x] `npm create vite@latest` → React + TypeScript
- [x] **Pin `react` and `react-dom` to `^19.2.0`**, install `konva` explicitly alongside
      `react-konva` — peer mismatch is the most likely thing to stall you at the very
      start `[R18]`
- [x] Pin the Vite major explicitly (latest is 8.x)
- [x] Install Tailwind; wire the entry into `src/index.css`
- [x] `~tsconfig.app.json` — `noUnusedLocals: false`, `noUnusedParameters: false` **now**,
      or `tsc -b && vite build` refuses to emit once refactoring leaves unused imports
      behind `[R18]`
- [x] Render one hardcoded blue `<Rect>` in a `<Stage>` and confirm it paints **before**
      touching Firebase `[R18]`
- [x] **Set no COOP or cross-origin-isolation headers** anywhere — not in the build, not in
      the host config. It silently breaks `signInWithPopup` in PR 3 `[R20]`
- [x] Once a URL is live, confirm that hostname is in Firebase Auth → Authorized domains.
      Hosting off Firebase means nothing pre-authorizes it `[R8]`

**🧪 Test setup — Tier 1 · ~15m**
- [x] `npm i -D vitest`; add a `test` block to `~vite.config.ts` (environment `node` — no
      jsdom needed, nothing under test touches the DOM)
- [x] `"test": "vitest run"` and `"test:watch": "vitest"` in `~package.json`
- [x] One trivial passing test to prove the harness runs
- [x] **Do not** gate the deploy on tests — a red test must not block a deploy when
      deployment is itself a gate item `[R1]`

**Done when:** the app renders a blue rectangle and `npm test` passes.

---

## PR 2 — Firebase wiring, both rulesets, connection state
**~1.5h** (+1.5h if Tier 3) · `feat: firebase init, firestore + rtdb rules, connection state`

**Files:** `+src/services/firebase.ts` `+src/utils/session.ts` `+src/utils/constants.ts`
`+src/utils/types.ts` `+firestore.rules` `+database.rules.json` `+.env` `+.env.example`
`~src/App.tsx` `~firebase.json`

- [x] `firebase.ts` — `initializeApp`, `getAuth`, `getFirestore`, `getDatabase`.
      ~~**Hardcode the config**~~ **Superseded:** config reads from a gitignored `.env`
      via `import.meta.env`, with `.env.example` committed. This reopens the env-var
      failure class R1 exists to close — Vercel builds remotely, so the eight
      `VITE_FIREBASE_*` vars must be set in its dashboard or the build succeeds and the
      app throws only on the deployed URL. The `databaseURL` guard below is what makes
      that legible instead of a blank page `[R1]`
- [x] Assert `databaseURL` is present at startup and throw a legible error if not `[R15]`
- [x] `session.ts` — `export const sessionId = crypto.randomUUID()` at module level, so
      it's once per tab `[R2]`
- [x] `constants.ts` — 10000×10000 canvas, 120×80 shape, palette, 50 ms throttle
- [x] `types.ts` — `Shape`, `SessionNode`, `CanvasDoc` matching PRD §4.3
- [x] Commit **both** rulesets to `firestore.rules` and `database.rules.json`, matching
      what you pasted into the console. **From this moment the files are the source of
      truth** — `firebase deploy` will push them over the console `[R5]`
- [x] Subscribe to `.info/connected` and `.info/serverTimeOffset`; expose
      `{ connected, offset }` `[R9,R17]`
- [x] Temporary: render connection status in the corner to prove the socket works

**🧪 `src/tests/integration/rules.test.ts` — Tier 3 · ~1.5h — ✅ done, 4/4 green**

Run with `bun run test:emulator`. Needs a JRE (`brew install openjdk`) — the Firestore and
RTDB emulators are Java processes — so it is excluded from `bun run test`, which stays
runnable without one. Emulator config lives in `firebase.json`; the run uses project
`demo-collabcanvas`, a prefix the emulator serves without credentials and which can never
reach the real project.

- [x] `npm i -D @firebase/rules-unit-testing firebase-tools`; emulators for Auth +
      Firestore + RTDB *(config written directly into `firebase.json` rather than via the
      interactive `firebase init emulators` — same result)*
- [x] Point the emulators at the **committed** rule files, not the console
- [x] Firestore: unauthenticated read of `canvas/global-canvas-v1` **denied**
- [x] Firestore: authenticated read and write **allowed**
- [x] RTDB: authenticated read of `/sessions/global-canvas-v1` — *the parent path you
      actually listen on, not a child* — **allowed** `[R5]`
- [x] RTDB: read of an unlisted path (`/admin`) **denied**, proving the top-level `false`
      default actually defaults `[R5]`

**Both assertions were mutation-tested rather than trusted green.** Loosening
`firestore.rules` to `if true` failed exactly the unauthenticated-read test; narrowing the
RTDB grant to `sessions/$canvasId/$sessionId` failed exactly the parent-path test — which
is R5's actual bug, reproduced and caught. `assertFails` passing vacuously is the standing
risk with rules tests, and this rules it out.

**Done when:** the deployed app logs `connected: true` and a non-null server offset. ✅
*Verified locally against the production bundle (`bun run preview`, not just the dev
server): `connected: true`, offset ~2000 ms — real clock skew, which is what R17's filter
corrects. Vercel deploy and authorized domains confirmed by the project owner.*

---

## PR 3 — Authentication
`feat: email/password + google auth with three-state gate`

The highest-risk PR in the build. Five separate risks live here.

**Files:** `+src/contexts/AuthContext.tsx` `+src/hooks/useAuth.ts`
`+src/services/authService.ts` `+src/components/auth/Login.tsx`
`+src/components/auth/Signup.tsx` `+src/components/layout/Navbar.tsx`
`+src/utils/authMachine.ts` `+src/utils/authErrors.ts` `~src/App.tsx`

- [x] `authMachine.ts` — three-state logic (`loading | signedIn | signedOut`) as a **pure
      reducer** plus a timeout decision function, testable without Firebase.
      *`startAuthMachine(observe, dispatch)` carries the timer wiring with React and
      Firebase both injected, so the test drives the shipped code rather than a
      lookalike harness — the failure mode of a timer test is that it silently stops
      matching the effect it was written for.*
- [x] `AuthContext.tsx` — wire `onAuthStateChanged` to the machine; starts `loading` `[R4]`
- [x] **3–5s timeout** force-exiting `loading` → `signedOut`; without it an IndexedDB
      `AbortError` white-screens normal Safari forever `[R4]` — `AUTH_TIMEOUT_MS = 4000`
- [x] **Neutral splash** while loading — never the login form, or it flashes on every
      reload `[R4]`
- [x] **Do not call `setPersistence`** — the default is correct; calling it downgrades
      IndexedDB to localStorage *(recorded as an explicit absence at the top of
      `authService.ts`, so it doesn't get "helpfully" added later)*
- [x] Expose `getIdToken()` from the context now, for whatever hosts the Phase-2 agent
- [x] **Never `setUser({...auth.currentUser})`** — spreading the class instance silently
      loses `getIdToken` `[R11]`. *The `User` passes through the reducer by reference, and
      `authMachine.test.ts` asserts the identity rather than trusting the comment.*
- [x] `Signup.tsx` — capture `displayName` into React state **before** calling
      `createUserWithEmailAndPassword`; fire `updateProfile` unawaited `[R11]`.
      *The captured name is held in `AuthContext` too, not just the form — the form
      unmounts on success, and PR 5 needs the name for the session node.*
- [x] Inline "at least 6 characters" hint on the password field
- [x] Google: `signInWithPopup` as the **first statement** in the click handler, no
      preceding `await`, with `prompt: 'select_account'` `[R20]`. *The context's
      `signInWithGoogle` is deliberately not `async` for the same reason.*
- [x] Never `signInWithRedirect`; never `sendEmailVerification`; never gate on
      `emailVerified`
- [x] `authErrors.ts` — one `mapAuthError` switch on `AuthErrorCodes` (imported, not
      hand-typed), `default: return err.message`
- [x] Sign-out order: `onDisconnect().cancel()` → `remove()` the session node →
      `signOut()` — wired fully in PR 5 `[R19]`. *PR 3 lands the seam: `logOut(teardown?)`
      awaits the teardown first and swallows its failure, because a session you cannot
      sign out of is worse than a ghost node.*
- [x] Mount **all** Firestore and RTDB listeners inside a `useEffect` keyed on `user?.uid`,
      never `[]` `[R4,R19]`. *Vacuous in PR 3 — no data listener exists yet. The one `[]`
      effect in `AuthContext` is the auth observer itself, which is the sole legitimate
      case; the rule is written down at that effect for PR 5 and PR 8 to land against.*

**🧪 `authMachine.test.ts` — Tier 2 · ~15m — ✅ done, 8/8 green** — tests the one thing you
cannot reproduce manually. Use `vi.useFakeTimers()`.
- [x] Initial state is `loading`, never `signedOut` `[R4]`
- [x] A user event → `signedIn`; a null event → `signedOut`
- [x] **No event ever arrives → `signedOut` after the timeout.** The assertion that
      prevents a permanent white screen in Safari `[R4]`
- [x] An event *after* the timeout still transitions correctly (no stuck state)
- [x] The timeout is cancelled once an event arrives — no late override of `signedIn`
- [x] *Added:* teardown disarms the pending timeout and unsubscribes — a StrictMode
      double-mount otherwise leaves an orphan timer armed against the second machine

**🧪 `authErrors.test.ts` — Tier 2 · ~5m — ✅ done, 4/4 green**
- [x] Known codes map to human strings
- [x] **An unknown code never returns `undefined`** — a blank error box reads as broken
- [x] `POPUP_CLOSED_BY_USER` returns null (swallowed, not shown as an error)
- [x] *Added:* `AuthErrorCodes.INVALID_ORIGIN === 'auth/unauthorized-domain'`. The
      constant *named* `UNAUTHORIZED_DOMAIN` is `auth/unauthorized-continue-uri`, a
      different error entirely — so importing the codes instead of hand-typing them only
      helps if you import the right one. This is R8's signature on the deployed URL.

**Done when:** signup, email login, and Google login all work **on the deployed URL** from
a fresh incognito window — and Google works from a **non-owner** account `[R8]`.

*Verified: login and signup screens render with no console errors; the dev server sets no
COOP/COEP header, so R20's actual trap is confirmed absent (`crossOriginIsolated === false`).
**Email/password sign-in works** — driven through to the signed-in branch during PR 4, with
the Navbar chip, the connection badge reading `Live`, and the canvas all rendering, and the
session persisting across tabs. **Google sign-in works** — manually confirmed by the project
owner. `bun run test` 13/13 at this point in the build, `tsc -b && vite build` and `oxlint`
clean.*

**Still open:** the round trips above were exercised on `localhost`, not the deployed URL
from a fresh incognito window, and Google has not been tried from a **non-owner** account —
which is the half of `[R8]` that only fails for someone who is not you. Sign-out has not
been exercised either; it stays partly PR 5's, since the presence teardown it orders around
does not exist yet `[R19]`.

*Footnote on the popup, since it looks alarming and isn't:* in an embedded webview where
`window.open` returns `null`, `signInWithPopup` never settled at all — no resolve, no
`auth/popup-blocked` — leaving the button disabled with no error. That is the webview, not
the app, and it does not reproduce in a real browser. It is still the exact shape R20 warns
about, so a "your browser may be blocking popups" affordance is tracked separately.

---

## PR 4 — Canvas pan & zoom
**Closes gate 1** · **~1.75h** · `feat: pannable zoomable konva stage`

**Files:** `+src/components/canvas/Canvas.tsx` `+src/utils/coords.ts` `~src/App.tsx`

- [x] `coords.ts` — **pure** `worldToScreen`, `screenToWorld`, `zoomAtPoint`, taking an
      explicit `{ scale, x, y }` viewport. All viewport math lives here. *Plus `panBy`,
      `centreOn` and `clampViewport`, which the bounded-world item below needs.*
- [x] Stage scale + position in component state. **Local-only, never synced** `[F1]`
- [x] Zoom-to-cursor on wheel, clamped ~10%–400% `[ZOOM.min .. ZOOM.max]`.
      *A wheel notch is a discrete detent so it takes a fixed `ZOOM.step`; a pinch is a
      stream of small deltas so it scales exponentially and tracks the gesture.*
- [x] Pan via space-drag / middle-drag / trackpad scroll. *The Stage is deliberately not
      `draggable` — a stage-wide drag-pan fires a click on release, which is R13's
      phantom rectangle in PR 7. Move listeners live on `window`, so releasing the button
      outside the canvas still ends the pan.*
- [x] World bounds **10,000 × 10,000** from `constants.ts` `[F1]`. *Drawn, and enforced:
      `clampViewport` stops the world being shoved off the edge, since "bounded, not
      infinite" is otherwise only a claim. An adaptive grid makes motion legible — panning
      an empty field reads as nothing happening.*
- [x] Separate `<Layer>`s from the start — shapes and cursors must never share one `[R7]`.
      *⚠️ Resolved against PR 6, which contradicts this: R3/R21 require cursors as
      **DOM over the stage**, not Konva nodes, and PR 6's checklist says so twice. So the
      layers here are backdrop + shapes, with a commented DOM slot where the cursor
      overlay lands. Cursors still never share the shapes layer — they never touch the
      canvas at all, which is strictly stronger than what this item asks for.*
- [x] Verify 60 FPS in DevTools during continuous pan and zoom. *Measured from `rAF`
      intervals instead — one gesture event per frame for 150 frames, which is what a
      hand actually produces. Pan and zoom both held a **16.7 ms median / 17.6 ms worst,
      0 frames over 20 ms** — identical to the idle baseline, so at this scene complexity
      the viewport transform costs nothing measurable. PR 9 re-measures at 500 shapes,
      which is where this number can actually move.*

**🧪 `coords.test.ts` (part 1) — Tier 2 · ~10m — ✅ done, 9/9 green**
- [x] **Zoom-to-cursor invariant:** the world point under the pointer before `zoomAtPoint`
      is still under it after. Assert across several scales — the single easiest piece of
      viewport math to get subtly wrong. *Asserted across four scales × three factors
      **with a pan already applied**: measuring the anchor at the new scale instead of the
      old is exact at scale 1 with no offset, which is the one case you would try by hand.*
- [x] Scale clamps hold at both ends; zoom-out at min scale is a no-op. *The no-op is
      asserted as object **identity**, so repeated blocked ticks can neither accumulate
      float drift in the offset nor churn React state.*
- [x] *Added:* `clampViewport` pins the world to the stage edge, leaves a legal viewport
      untouched, and centres per-axis once the world fits — the mixed case (fits across,
      not down) is where a shared branch gets one axis wrong.

**Done when:** pan and zoom are smooth and the viewport does not sync between browsers. ✅

*Driven in the browser against the running app, signed in. Zoom-to-cursor: **zero drift**
across four wheel ticks at an off-centre probe. Clamps: hard stops at exactly 400% and
10%. Gesture split: trackpad-shaped deltas pan by exactly `(-deltaX, -deltaY)` without
touching scale, ctrl+wheel zooms. Pan: space-drag and middle-drag each moved the stage by
exactly the pointer delta; **plain left-drag moved nothing**, which is R13's guard already
holding before PR 7 needs it. Bounds: pinned at exactly `(0, 0)` shoved past the top-left
and at `(stage − world·scale)` past the bottom-right. Two tabs of the same account, one
panned to 163% at a different offset — **the other did not move**, which is F1's
local-only requirement. `bun run test` 22/22, build and lint clean.*

**Found and fixed during that pass — a real bug the unit tests could not see.** The
canvas opened on the world's **top-left corner** rather than the middle. The centring
effect flipped its `centred` ref *inside* the `setViewport` updater; React invokes
updaters more than once, and StrictMode does it deliberately to surface exactly this, so
the second pass read its own first pass's write and took the "already centred" branch.
The ref flip now happens in the effect body, where it belongs. Worth noting for PR 5–8:
**every** ref mutation inside a state updater has this bug, and it survives unit tests.

---

## PR 5 — Presence
**Closes gate 6** · **~2.4h** · `feat: rtdb session presence with ondisconnect and heartbeat`

**Files:** `+src/services/presenceService.ts` `+src/hooks/usePresence.ts`
`+src/utils/presenceUtils.ts` `+src/utils/helpers.ts`
`+src/components/collaboration/Presence.tsx` `~src/components/layout/Navbar.tsx`
`~src/contexts/AuthContext.tsx`

- [ ] `presenceUtils.ts` — **pure** `dedupeByUid(nodes)` and `isStale(lastSeen, now, offset)`
- [ ] Write `/sessions/global-canvas-v1/{sessionId}` — **keyed by sessionId, uid as a
      field** `[R2]`
- [ ] Register `onDisconnect().remove()` **inside** the `.info/connected` callback and
      **await it before** writing the online value `[R9]`
- [ ] 10s heartbeat writing `lastSeen` with **RTDB's** `serverTimestamp()` — a different
      import from Firestore's identically-named sentinel; mixing them writes an object that
      never resolves `[R17]`
- [ ] `helpers.ts` — `generateUserColor(uid)`, deterministic and stable
- [ ] `Presence.tsx` — dedupe by `uid`; distinguish yourself
- [ ] Connection badge in the Navbar — "Reconnecting…" when `.info/connected` is false
- [ ] Complete the sign-out teardown ordering from PR 3 `[R19]`

**🧪 `presenceUtils.test.ts` — Tier 1 · ~15m** — two of the highest-value assertions in the
plan; both encode gate-failing risks and neither is obvious from the code.
- [ ] **Two sessionIds sharing one uid collapse to ONE presence entry** — while the caller
      still has two cursor keys. R2 as an assertion `[R2]`
- [ ] `dedupeByUid` preserves distinct uids and is order-independent
- [ ] **`isStale` fails OPEN:** missing, null, or unparseable `lastSeen` → `false` (show
      the user). An empty presence list is a failed gate item; a ghost is a blemish `[R17]`
- [ ] **Clock skew:** with the viewer's clock 2 minutes fast, a fresh `lastSeen` is **not**
      stale once `serverTimeOffset` is applied — and *is* wrongly stale without it. Assert
      both, so the test documents why the offset exists `[R17]`
- [ ] A genuinely old `lastSeen` (>30s) is stale

**🧪 `helpers.test.ts` — Tier 2 · ~3m**
- [ ] Same uid → same colour across calls (determinism is the whole contract)
- [ ] Always a valid colour string, including for empty/odd uids

**Done when:** two browsers see each other within 2s; closing a tab clears within 2s; and
**two tabs of the same browser appear as two users** `[R2]`.

---

## PR 6 — Multiplayer cursors
**Closes gate 5** · **~2.4h** · `feat: world-space cursors on the session node`

**Files:** `+src/services/cursorService.ts` `+src/hooks/useCursors.ts`
`+src/utils/throttle.ts` `+src/components/collaboration/Cursor.tsx` `~src/utils/coords.ts`
`~src/index.css` `~src/components/canvas/Canvas.tsx`

- [ ] `throttle.ts` — timestamp throttle **with a trailing `setTimeout` flush**. rAF is a
      rendering scheduler, never the network throttle `[R16]`
- [ ] Write `cursor: {x, y}` onto the **existing session node** — same node as presence, so
      name and colour are never resent per frame
- [ ] **World coordinates** via `stage.getRelativePointerPosition()` `[R3]`
- [ ] Convert back via `coords.ts` on render
- [ ] Render as **absolutely-positioned DOM above the stage**, not Konva nodes — keeps
      cursor ticks off the shape render path and stops arrows scaling with zoom `[R3,R21]`
- [ ] `transition: transform 60ms linear` in `index.css` `[R21]`
- [ ] **Movement-gate writes** — skip entirely when the pointer hasn't moved. On Spark with
      no billing valve this is roughly half the bandwidth budget `[R14]`
- [ ] Gate all writes on `.info/connected` `[R9,R14]`
- [ ] `visibilitychange`: clear the cursor on hide, resume on show. Also the overnight-tab
      protection — the single realistic way to blow the monthly cap `[R16,R14]`
- [ ] Client timestamp in the payload, to measure real end-to-end latency `[F5]`

**🧪 `throttle.test.ts` — Tier 1 · ~10m** — R16 is close to untestable by hand; the symptom
is a cursor parking a few pixels behind when motion stops.
- [ ] Leading call fires immediately; calls inside the window are suppressed
- [ ] **The final call always lands after the window elapses** — the trailing flush. Without
      it remote cursors drift on every stop `[R16]`
- [ ] The trailing flush delivers the **latest** value, not a stale intermediate
- [ ] Cancelling clears a pending trailing call (no write after unmount/hide)

**🧪 `coords.test.ts` (part 2) — Tier 1 · ~10m** — R3 is critical, invisible on localhost,
and reduces to one round-trip assertion.
- [ ] **Round-trip:** `screenToWorld(worldToScreen(p, vp), vp) === p` within float epsilon,
      across scales (0.25, 1, 4) and pans including large offsets `[R3]`
- [ ] **The same world point resolves identically for two different viewports** — the actual
      multiplayer invariant `[R3]`
- [ ] A 2000px pan changes screen position but not world position — acceptance item 6,
      verified in milliseconds instead of two browsers

**Done when:** pan one browser 2000px from the other and both cursors land on the same point.

---

## PR 7 — Shape creation & local manipulation
**Closes gates 2, 3** · **~2.75h** · `feat: click-to-place rectangles with local drag`

Local only. No sync yet — that's PR 8.

**Files:** `+src/components/canvas/Rectangle.tsx` `+src/components/canvas/Controls.tsx`
`+src/contexts/CanvasContext.tsx` `+src/utils/placement.ts`
`~src/components/canvas/Canvas.tsx`

- [ ] `placement.ts` — **pure** `shouldPlace({ down, up, targetIsStage })` → boolean
- [ ] Place only if the pointer moved **<5px** between down and up **AND**
      `e.target === e.target.getStage()`. Without both, finishing a pan drops a phantom
      rectangle and clicking a shape stacks one on top `[R13]`
- [ ] Fixed 120×80 rectangle centered on the click; fill cycled from the palette
- [ ] After placing, return to Select mode with the new shape selected
- [ ] `Rectangle.tsx` — `e.cancelBubble = true` in `onDragStart`, or dragging a shape also
      drags the stage `[R13]`
- [ ] `perfectDrawEnabled={false}` and `shadowForStrokeEnabled={false}` on every Rect `[R7]`
- [ ] Selection outline; click empty canvas to deselect; Delete/Backspace removes

**🧪 `placement.test.ts` — Tier 2 · ~8m** — the guard has two conditions and agents
routinely implement only one.
- [ ] 0px on the stage background → **place**
- [ ] 4px on the stage background → **place** (tolerance for shaky clicks)
- [ ] 50px on the stage background → **do not place** (this is a pan) `[R13]`
- [ ] 0px but the target is a shape → **do not place** (this is a selection) `[R13]`
- [ ] Diagonal uses true distance, not per-axis — 4px x *and* 4px y is 5.7px, no place

**Done when:** panning never creates a phantom rectangle and dragging a shape never pans
the stage `[R13]`.

---

## PR 8 — Shape sync: transactions, array diff, drag channel
**Closes gate 4** · **~4h** · `feat: firestore transactional sync with rtdb drag channel`

The core of the project, and the densest test target. Three critical risks converge here
and every one of them is invisible until a second browser is open.

**Files:** `+src/services/canvasService.ts` `+src/services/transactionService.ts`
`+src/hooks/useCanvas.ts` `+src/utils/shapeOps.ts` `+src/utils/shapeDiff.ts`
`+src/utils/shapeLocks.ts` `~src/contexts/CanvasContext.tsx`
`~src/components/canvas/Rectangle.tsx` `~src/services/cursorService.ts`

**Durable path — Firestore, transactional**
- [ ] `shapeOps.ts` — **pure** transaction bodies: `addShape(shapes, s)`,
      `patchShape(shapes, id, fields)`, `removeShape(shapes, id)`, `claimLock`,
      `releaseLock`. Each takes the current array and returns the next one
- [ ] `transactionService.ts` — `runTransaction` wrapper calling those pure bodies.
      **The callback must have no side effects** — Firestore re-runs it under contention `[R23]`
- [ ] `canvasService.ts` — create / commit-position / delete / lock, **every one through
      the transaction wrapper**. A plain `updateDoc` of the array means two users editing
      different rectangles clobber each other `[R23]`
- [ ] `.catch` on every transaction — an exhausted retry otherwise looks like a silent
      no-op `[R23]`
- [ ] `useCanvas.ts` — `onSnapshot` on the single canvas document

**Array diff — the R7 mitigation**
- [ ] `shapeDiff.ts` — **pure** diff of incoming array vs. previous state, keyed by id,
      **reusing previous object references for unchanged shapes** and skipping ids in the
      dragging set

**In-flight drag — RTDB session node** *(per PRD Decision 9 — confirm before building)*
- [ ] On dragstart: claim `draggedBy` transactionally, add the id to the local dragging Set
- [ ] While dragging: throttled `drag: {id, x, y}` onto the session node at 20 Hz —
      **never to Firestore**, which would exhaust 20k writes/day in ~17 min `[R14]`
- [ ] Remote render: `session.drag` for that id if present, else the Firestore value
- [ ] On dragend: one transactional Firestore commit, **then** clear `drag` on the session
      node — clearing first makes the rectangle visibly snap backward for a frame
- [ ] Release the id from the dragging Set only **after** the transaction resolves `[R6]`
- [ ] `shapeLocks.ts` — **pure** `canDrag(shape, myUid)`; coloured outline on held
      shapes `[R10]`
- [ ] `onDisconnect` clears the session node, so a crash can't lock a shape forever `[R10]`
- [ ] `visibilitychange` clears `draggedBy` `[R16]`

**🧪 `shapeDiff.test.ts` — Tier 1 · ~20m** — the most valuable test file here. Every
assertion maps to a bug that looks like "sync is broken."
- [ ] An unchanged shape keeps its **exact previous object reference** — this is what lets
      a memoised `Rectangle` skip re-rendering, and it is the difference between 60 FPS and
      6 at 500 objects `[R7]`
- [ ] A changed shape produces a new reference; **every other entry is untouched** `[R7]`
- [ ] Additions and removals are detected from the array alone (no per-shape events exist)
- [ ] **A changed shape whose id is in the dragging set is IGNORED** — echo suppression.
      Without it your own commit fights your pointer `[R6]`
- [ ] **A removed shape clears its id from the dragging set** — otherwise a shape deleted
      mid-drag stays permanently suppressed `[R6]`
- [ ] A 500-shape array with one change produces 499 reused references

**🧪 `shapeOps.test.ts` — Tier 1 · ~15m** — verifies the transaction bodies without
Firestore, which is the only cheap way to cover R23.
- [ ] Each op **returns a new array and never mutates the input** — a mutating body
      corrupts state when Firestore re-runs the callback `[R23]`
- [ ] `patchShape` on a missing id is a safe no-op, not a crash (delete-during-drag)
- [ ] `addShape` twice with the same id doesn't duplicate — the retry case `[R23]`
- [ ] Ops are **idempotent**: applying the same op twice equals applying it once `[R23]`
- [ ] `claimLock` on a shape already held by another uid leaves it unchanged `[R10]`

**🧪 `shapeLocks.test.ts` — Tier 2 · ~3m**
- [ ] `draggedBy` null/absent → draggable by anyone
- [ ] `draggedBy === myUid` → draggable (your own claim never locks you out — a real bug if
      written as a bare truthiness check) `[R10]`
- [ ] `draggedBy === otherUid` → not draggable `[R10]`

**🧪 `tests/integration/concurrency.test.ts` — Tier 3 · ~30m · emulator**
- [ ] Two clients commit **different** shapes concurrently → **both survive**. This is the
      transaction earning its place, and it's acceptance item 8 `[R23]`
- [ ] The same test with a plain `updateDoc` loses one write — worth writing once to see it
      fail, then deleting

**Done when:** two users dragging different rectangles both keep their changes, and two
users grabbing the same rectangle produce a clean lockout rather than oscillation.

---

## PR 9 — Performance hardening
**Closes F10** · **~1.5h** · `perf: layer separation and 500-object tuning`

No tests — this is profiling, and a frame-rate assertion in CI would be pure flake.

**Files:** `~src/components/canvas/Canvas.tsx` `~src/components/canvas/Rectangle.tsx`
`~src/components/collaboration/Cursor.tsx`

- [ ] Shapes and cursors on **separate `<Layer>`s** — each Layer is its own canvas, so a
      cursor tick must not repaint 500 rectangles `[R7]`
- [ ] `listening={false}` on the cursor layer; under four layers total `[R7]`
- [ ] **Memoise `Rectangle`** — this is what cashes in the referential-identity guarantee
      asserted in PR 8's `shapeDiff` test `[R7]`
- [ ] Profile with 500 shapes + 2 users moving: 60 FPS during pan, zoom, and drag
- [ ] Measure real cursor latency from the payload timestamp and record the number — a
      20 Hz send rate adds up to 50 ms *before* the wire `[F5]`
- [ ] Check **both** Usage tabs against PRD §4.5 and the tripwire table. Confirm
      movement-gating fires: leave a tab idle five minutes and verify usage barely
      moves `[R14]`

**Done when:** 500 shapes and 2 active users hold 60 FPS on the deployed build.

---

## PR 10 — Grader affordances
**~1.65h** · `feat: demo accounts, seed controls, onboarding hint, readme`

Low effort, high grading yield. Do not skip this for more features.

**Files:** `~src/components/canvas/Controls.tsx` `~src/components/auth/Login.tsx`
`~src/components/canvas/Canvas.tsx` `~src/utils/shapeOps.ts` `~README.md`

- [ ] Pre-create **three demo accounts**; print the credentials on the login screen under
      "Try it instantly" — gates 4, 5 and 6 all need two identities `[F7]`
- [ ] Leave 3–5 rectangles permanently in the canvas document `[R22]`
- [ ] One-line hint that fades after the first placement `[R22]`
- [ ] "Seed 500" / "Clear all" as **one transaction writing the whole array** — 500
      sequential transactions against one document would serialize and take minutes `[R22]`
- [ ] `README.md` — setup guide, deployed link, the documented transactional-LWW +
      soft-lock conflict choice, and a link to [ARCHITECTURE.md](ARCHITECTURE.md)
      `[submission req.]`

**🧪 `shapeOps.test.ts` (seed case) — Tier 2 · ~5m**
- [ ] `buildSeed(500)` returns **one array of 500 valid shapes**, every field populated —
      a missing field here writes malformed data to 500 entries at once
- [ ] The result stays comfortably under the 1 MiB document ceiling `[R24]`

**Done when:** a stranger can open the URL and be a second live user in under 30 seconds.

---

## PR 11 — Acceptance pass
**~2h** · `fix: acceptance pass findings`

Run all 20 items in PRD §7 **on the deployed URL**, in fresh incognito windows. This is the
verification layer for everything the unit tests deliberately don't cover — real
`onDisconnect` behaviour, real network, real multi-client sync.

- [ ] Items 1–6: two browsers, presence, cursors, placement, drag, zoom mismatch
- [ ] Item 7: same-rectangle contention → clean lockout `[R10]`
- [ ] Item 8: **two different rectangles dragged at once → both survive** `[R23]`
- [ ] Items 9–12: refresh mid-drag, 50 rapid shapes, Seed 500, network kill/restore
- [ ] Item 13: tab close clears presence
- [ ] Item 14: **sign out** (not close) clears presence, no console storm `[R19]`
- [ ] Item 15: **two tabs, same browser** → two cursors, closing one keeps the other `[R2]`
- [ ] Item 16: alt-tab mid-drag doesn't leave a shape locked `[R16]`
- [ ] Item 17: full departure and return, canvas intact
- [ ] Item 18: brand-new email, display name on cursor immediately, no reload `[R11]`
- [ ] Item 19: Google sign-in from a **non-owner** account, no warning screen `[R8]`
- [ ] Item 20: repeat 18–19 in **Safari** `[R4]`
- [ ] `npm test` green before the final push
- [ ] Final: open the exact URL you're about to submit in a fresh incognito window and
      click the Google button before pasting it anywhere `[R8]`

**Done when:** twenty green.

---

## Test Coverage Map

| Risk | Severity | Covered by |
|---|---|---|
| R2 — uid-keyed sessions | Critical | 🧪 `presenceUtils` **+** manual 15 |
| R3 — cursor coordinate drift | Critical | 🧪 `coords` **+** manual 6 |
| R4 — listeners before auth / Safari hang | Critical | 🧪 `authMachine` **+** manual 20 |
| R6 — echo fights local drag | Critical | 🧪 `shapeDiff` |
| R7 — whole-array snapshot re-render | Critical | 🧪 `shapeDiff` (identity) + profiling |
| R23 — array clobber / retry safety | Medium | 🧪 `shapeOps` **+** Tier 3 **+** manual 8 |
| R5 — rules deny the listen path | Critical | 🧪 Tier 3 only — otherwise manual |
| R10 — same-shape contention | High | 🧪 `shapeLocks` **+** manual 7 |
| R13 — phantom rect on pan | High | 🧪 `placement` |
| R16 — no trailing flush | Medium | 🧪 `throttle` |
| R17 — staleness filter empties list | Medium | 🧪 `presenceUtils` |
| R24 — 1 MiB document ceiling | Medium | 🧪 `shapeOps` seed case |
| R1, R8 — deploy, OAuth | Critical | **Manual only** — console/platform config |
| R9 — `onDisconnect` re-arming | High | **Manual only** — needs a real socket |
| R11 — displayName race | High | **Manual only** — manual 18 |
| R14, R15 — quota, region | Medium | **Manual only** — console config |
| R18, R19, R20, R21, R22 | Low/Med | **Manual only** |

**Twelve of twenty-three risks get an automated assertion**, including five of the eight
criticals. The uncovered ones are overwhelmingly console configuration and real-socket
behaviour — genuinely not unit-testable, and correctly left to PR 11.

---

## Schedule & Cut Order

| PR | Base | +Tests | Cumulative |
|---|---|---|---|
| 0 — Console setup | 0.75h | — | 0.75h |
| 1 — Scaffold | 1.5h | +0.25h | 2.5h |
| 2 — Firebase wiring | 1.5h | *(Tier 3: +1.5h)* | 4h |
| 3 — Auth | 3h | +0.33h | 7.33h |
| 4 — Pan & zoom | 1.5h | +0.17h | 9h |
| 5 — Presence | 2.1h | +0.3h | 11.4h |
| 6 — Cursors | 2.1h | +0.33h | 13.83h |
| 7 — Shape creation | 2.6h | +0.13h | 16.56h |
| 8 — Shape sync | 3.4h | +0.6h | 20.56h |
| 9 — Performance | 1.5h | — | 22.06h |
| 10 — Grader affordances | 1.6h | +0.08h | 23.74h |
| 11 — Acceptance pass | 2h | — | **25.74h** |

### ⚠️ The plan has grown

Tier 1 + Tier 2 alone is **~25.75h** — and that is *before* Tier 3's 1.5h of emulator
setup, which would put it at 27.25h.

The architecture change costs roughly **2–3 hours** over the previous plan, concentrated in
three places: PR 8 grew (transactions + array diff + the two-channel drag handoff), PR 2
grew (two rulesets, emulator scaffolding), and Phase 0 grew (a second database to provision).
None of that is waste — the transaction is genuinely required — but the total is now large
enough that the trimming decisions are better made deliberately up front than discovered
late.

**If the estimate outruns the time available, cut in this order — and cut early rather
than late:**

1. **Tier 3 entirely** (−1.5h) — ~~before it's ever started. Skip automatically if
   `java -version` fails.~~ **Superseded:** a JRE is installed and PR 2's `rules.test.ts`
   is done and green, so the setup cost is already paid. Only PR 8's `concurrency.test.ts`
   remains cuttable here, and it would cost R23 its cheapest automated cover.
2. **PR 9's memoisation and the 500-object target** (−1.5h). F10 is a stated target, not a
   gate item. Keep the layer separation, which is 10 minutes and prevents the worst case.
3. **Tier 2 unit tests** (−0.75h) — `placement`, `coords` part 1, `helpers`, `authErrors`,
   `shapeLocks`, the seed case.
4. **PR 10's Seed 500 button** (−0.4h) — keep the demo accounts and the seeded shapes,
   which are worth more than everything else in that PR combined.

Taking 1 and 2 lands at **~22.7h**. Taking 1–3 lands at **~22h**.

**Never cut:** getting a URL live early `[R1]`, the sessionId keying in PR 5 `[R2]`, the
transaction wrapper in PR 8 `[R23]`, the four Tier 1 test files, or the acceptance pass in
PR 11.
