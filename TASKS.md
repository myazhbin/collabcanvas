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

**Two popup footnotes, both of which look alarming and neither of which is a bug.**

*1 — `Cross-Origin-Opener-Policy policy would block the window.closed call`, in the console
on the production build, with a stack through Firebase's `pollUserCancellation`.* **This is
R20's predicted false alarm, now proven rather than assumed.** `accounts.google.com` serves
`cross-origin-opener-policy-report-only: same-origin` — note the **`-report-only`**, which
is why Chrome says *would* block. Google is gathering telemetry on what an enforcing policy
would break; nothing is blocked, `window.closed` returns its real value, Firebase's polling
works, sign-in completes. Our own build sends **zero** `Cross-Origin-*` headers
(`crossOriginIsolated === false`, no `vercel.json` / `_headers` / hosting block / Vite
plugin anywhere in the repo). The warning is unsuppressible because the policy is on
Google's origin, not ours. **Do not "fix" it by adding a COOP header** — it would not
silence the message, and `same-origin` is precisely the header that turns R20 from a
non-bug into a real one.

*2 — a popup that never settles at all.* In an embedded webview where `window.open` returns
`null`, `signInWithPopup` neither resolved nor rejected with `auth/popup-blocked`, leaving
the button disabled with no error. That is the webview, not the app, and it does not
reproduce in a real browser — but it is the exact shape R20 warns about, so a "your browser
may be blocking popups" affordance is tracked separately.

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

- [x] `presenceUtils.ts` — **pure** `dedupeByUid(nodes)` and `isStale(lastSeen, now, offset)`
- [x] Write `/sessions/global-canvas-v1/{sessionId}` — **keyed by sessionId, uid as a
      field** `[R2]`
- [x] Register `onDisconnect().remove()` **inside** the `.info/connected` callback and
      **await it before** writing the online value `[R9]`. *`announced` also resets to
      false whenever the socket drops, so a reconnect re-arms rather than assuming the
      server-side handler survived.*
- [x] 10s heartbeat writing `lastSeen` with **RTDB's** `serverTimestamp()` — a different
      import from Firestore's identically-named sentinel; mixing them writes an object that
      never resolves `[R17]`
- [x] `helpers.ts` — `generateUserColor(uid)`, deterministic and stable
- [x] `Presence.tsx` — dedupe by `uid`; distinguish yourself
- [x] Connection badge in the Navbar — "Reconnecting…" when `.info/connected` is false
      *(landed early, in PR 3)*
- [x] Complete the sign-out teardown ordering from PR 3 `[R19]` — `leavePresence` is passed
      into `authService.logOut`, so cancel → remove → `signOut` in that order

**⚠️ The Done-when below contradicts F6, and F6 wins.** "Two tabs appear as two users"
is the opposite of PRD F6 (*"Online list is derived by uniquing on `uid`; one cursor
renders per `sessionId`"*), of this PR's own first test, and of PR 11 item 15 (*"two tabs,
same browser → two **cursors**"*). Built to F6: two tabs of one account are **two session
nodes and one avatar**. The R2 property that actually matters — closing one tab not
deleting the other's presence — holds either way, and is what got measured.

**🧪 `presenceUtils.test.ts` — Tier 1 · ~15m — ✅ done, 9/9 green** — two of the
highest-value assertions in the plan; both encode gate-failing risks and neither is obvious
from the code.
- [x] **Two sessionIds sharing one uid collapse to ONE presence entry** — while the caller
      still has two cursor keys. R2 as an assertion `[R2]`
- [x] `dedupeByUid` preserves distinct uids and is order-independent. *Asserted as the same
      **sequence**, not just the same set — RTDB promises no key order, and a list that
      reorders on each heartbeat is a visibly twitchy avatar stack.*
- [x] **`isStale` fails OPEN:** missing, null, or unparseable `lastSeen` → `false` (show
      the user). An empty presence list is a failed gate item; a ghost is a blemish `[R17]`
- [x] **Clock skew:** with the viewer's clock 2 minutes fast, a fresh `lastSeen` is **not**
      stale once `serverTimeOffset` is applied — and *is* wrongly stale without it. Assert
      both, so the test documents why the offset exists `[R17]`
- [x] A genuinely old `lastSeen` (>30s) is stale
- [x] *Added:* tie-broken dedupe is order-independent too, and one missed heartbeat does
      **not** evict a live user — `staleAfterMs > heartbeatMs × 2` is asserted, not assumed

**🧪 `helpers.test.ts` — Tier 2 · ~3m — ✅ done, 3/3 green**
- [x] Same uid → same colour across calls (determinism is the whole contract)
- [x] Always a valid colour string, including for empty/odd uids
- [x] *Added:* uids spread across the whole palette — a hash that always returned index 0
      would be deterministic, palette-valid, and useless

**Done when:** two browsers see each other within 2s; closing a tab clears within 2s; and
two tabs of the same browser are two sessions (see the F6 correction above). ✅

*Measured against the live database, signed in. **R2:** two tabs → **2 session nodes, 1
unique uid**, and both tabs rendered a single avatar reading "1 online". **Leave:** closing
a tab removed its node via `onDisconnect`, seen gone on the next poll. **R19 sign-out:**
node cleared **1075 ms after the click** with **zero console errors or warnings** — no
permission-denied storm, because the uid-keyed effect drops the listener before the
credential goes. `bun run test` 33/33, build and lint clean.*

### ⚠️ R5 fired here — the deployed RTDB rules did not match the committed file

The first code in the project to touch RTDB rules at all (`.info/*` is rules-exempt, which
is why the connection badge read "Live" throughout PRs 2–4), and every `set` and `update`
to `/sessions/global-canvas-v1/…` came back `permission_denied` while
`database.rules.json` — byte-identical to PRD §4.4, emulator-verified in PR 2 — plainly
allowed them. Fixed with `bunx firebase deploy --only database`, which is the mechanism PR 2
designated when it made the committed files the source of truth. **Console state had
drifted from the repo, exactly as R5 predicts; the emulator test could never have caught it,
because it tests the file.**

**Three bugs in the first cut of `presenceService`, all found by that outage and all
survivable on their own — which is why they are worth writing down:**

1. **The announce only ran on a `.info/connected` transition.** That callback fires once per
   connection, so a single failed announce was permanent. It now retries from the heartbeat,
   which makes presence self-healing after any transient denial or network fault.
2. **The heartbeat `update` *created* the node.** With the announce failed, a bare
   `lastSeen` write manufactured a session node carrying no `uid`, `name` or `colour` — a
   nameless ghost that every other client then had to defend against, and which crashed
   `<Presence>` through `generateUserColor(undefined)`. The heartbeat now re-announces
   instead of beating a node that was never established.
3. **Errors inside the serialised write were swallowed**, so none of the above was visible.
   Both the announce and the `onValue` listener now log loudly and name R5 by number,
   because a silent denial is indistinguishable from "nobody else is here" — and that
   silence is most of what makes this class of bug expensive.

`usePresence` also drops nodes with no `uid` on the way in. That is *not* the staleness
filter, which must fail open `[R17]`; it is a separate trust boundary for wire data that is
unusable rather than merely old.

---

## PR 6 — Multiplayer cursors
**Closes gate 5** · **~2.4h** · `feat: world-space cursors on the session node`

**Files:** `+src/services/cursorService.ts` `+src/hooks/useCursors.ts`
`+src/utils/throttle.ts` `+src/utils/throttle.test.ts`
`+src/components/collaboration/Cursor.tsx` `~src/utils/coords.test.ts` `~src/index.css`
`~src/components/canvas/Canvas.tsx` `~src/utils/types.ts` `~src/services/presenceService.ts`
`~src/App.tsx`

*`coords.ts` needed no change — PR 4 already built `worldToScreen`/`screenToWorld` pure and
viewport-explicit precisely so the overlay could convert outside Konva. Three files not on
the original list did: `types.ts` for the payload's timestamp, `presenceService.ts` to
expose `isSessionAnnounced()` (see below), and `App.tsx` to pass `sessions` down.*

- [x] `throttle.ts` — timestamp throttle **with a trailing `setTimeout` flush**. rAF is a
      rendering scheduler, never the network throttle `[R16]`
- [x] Write `cursor: {x, y}` onto the **existing session node** — same node as presence, so
      name and colour are never resent per frame
- [x] **World coordinates** via `stage.getRelativePointerPosition()` `[R3]`
- [x] Convert back via `coords.ts` on render
- [x] Render as **absolutely-positioned DOM above the stage**, not Konva nodes — keeps
      cursor ticks off the shape render path and stops arrows scaling with zoom `[R3,R21]`
- [x] `transition: transform 60ms linear` in `index.css` `[R21]`
- [x] **Movement-gate writes** — skip entirely when the pointer hasn't moved. On Spark with
      no billing valve this is roughly half the bandwidth budget `[R14]`
- [x] Gate all writes on `.info/connected` `[R9,R14]`
- [x] `visibilitychange`: clear the cursor on hide, resume on show. Also the overnight-tab
      protection — the single realistic way to blow the monthly cap `[R16,R14]`
- [x] Client timestamp in the payload, to measure real end-to-end latency `[F5]`.
      *Stamped at **sample** time and corrected to server time with `.info/serverTimeOffset`
      — the same skew correction as `isStale` `[R17]`, because subtracting a raw peer clock
      measures skew, not latency. The HUD carries the median, so PR 9's measurement is a
      read rather than a build.*

**🧪 `throttle.test.ts` — Tier 1 · ~10m — ✅ done, 7/7 green** — R16 is close to untestable
by hand; the symptom is a cursor parking a few pixels behind when motion stops.
- [x] Leading call fires immediately; calls inside the window are suppressed
- [x] **The final call always lands after the window elapses** — the trailing flush. Without
      it remote cursors drift on every stop `[R16]`
- [x] The trailing flush delivers the **latest** value, not a stale intermediate
- [x] Cancelling clears a pending trailing call (no write after unmount/hide)
- [x] *Added:* **no timer is armed when nothing was suppressed** — an unconditional
      trailing timer re-sends an unchanged position at the end of every idle window,
      which is precisely the traffic movement-gating exists not to pay for `[R14]`
- [x] *Added:* a call after a full window leads **immediately**, not on a timer — else
      every sample of a steadily-moving pointer is a window late on top of the wire
- [x] *Added:* 100 Hz of samples for one second yields **≤21 calls** and still ends on
      the last sample. The upper bound is the number §4.5's monthly projection is priced
      against `[R14]`

**🧪 `coords.test.ts` (part 2) — Tier 1 · ~10m — ✅ done, 5/5 green** — R3 is critical,
invisible on localhost, and reduces to one round-trip assertion.
- [x] **Round-trip:** `screenToWorld(worldToScreen(p, vp), vp) === p` within float epsilon,
      across scales (0.25, 1, 4) and pans including large offsets `[R3]`
- [x] **The same world point resolves identically for two different viewports** — the actual
      multiplayer invariant `[R3]`. *Paired with an assertion that the two **pixels** differ
      by >100 px, because the round-trip half passes vacuously under the broken
      screen-coordinate implementation this test exists to rule out.*
- [x] A 2000px pan changes screen position but not world position — acceptance item 6,
      verified in milliseconds instead of two browsers
- [x] *Added:* the reverse round trip, pixel → world → pixel — the direction the publisher
      actually runs
- [x] *Added:* the **split transform** the overlay renders through composes back to
      `worldToScreen` (see the R21 note below)

### Two decisions worth writing down

**1 — The overlay splits the viewport transform, and R21's one CSS line is why.**
`transition: transform 60ms linear` smooths *whatever* moves the element, and the local
viewport moves it too. Put the full screen position on each cursor and every pan drags all
of them 60 ms behind the shapes they are pointing at — a transition sold as smoothing that
reads as lag, during the exact gesture the Done-when asks a grader to perform. So the
**pan** rides on the overlay layer (instant, no transition) and the **scale** rides on each
cursor (transitioned). `worldToScreen(p, {scale, x:0, y:0}) + (vp.x, vp.y) === worldToScreen(p, vp)`
is asserted in `coords.test.ts`, because a split transform that doesn't recompose is R3
wearing a different hat.

**2 — Cursor writes gate on `isSessionAnnounced()`, not just on `.info/connected`.**
Cursors and presence share one node by design (F5), which means two writers on one path and
`update()` **creates** a missing path. A cursor write that beats the announce therefore
manufactures a session node carrying a position and no `uid`, `name` or `colour` — the
nameless ghost PR 5 hit from the other direction, which crashed `<Presence>` through
`generateUserColor(undefined)`. `presenceService` now publishes whether the node is
*actually established* — not "did we try", not "are we connected" — and clears it
synchronously at the top of teardown, ahead of the two awaits, so a cursor write can never
land after the node is removed and resurrect it. **The ghost is unreachable rather than
unlikely.**

Two smaller ones: cursor `clear()` cancels the pending trailing flush **before** writing
null, or the flush lands after and resurrects the cursor a frame later — which is exactly
the ghost a hidden tab is meant to stop showing. And the viewport-change effect republishes
from the last known pointer pixel, because a wheel-zoom moves the world under a stationary
pointer without producing a mousemove: without it your arrow stays pinned to the pre-zoom
world point, visibly detached from you, until you jiggle the mouse.

**Done when:** pan one browser 2000px from the other and both cursors land on the same point. ✅

*`bun run test` 45/45 (33 → 45), `tsc -b && vite build` and `oxlint` clean, no console
errors. Everything below was measured against the **live database**, signed in.*

**The gate, measured at 400% zoom — the harshest case for R3, since every world unit is
four pixels of error.** Viewport panned by **exactly −2000**; the rendered arrow moved by
**exactly (−2000, 0)**; the world point each screen position resolves to under its own
viewport was **bit-identical before and after — drift {x: 0, y: 0}**. Sampled from the
*inline* transform React wrote rather than `getComputedStyle`, which returns the
interpolated mid-transition value and would have measured the CSS easing instead of the
math, and retried until a sample landed with the scale unchanged.

| Property | Result |
|---|---|
| **Publish is world-space** `[R3]` | pixel (300, 200) at vp {1, −4686.5, −4602.5} → **(4986.5, 4802.5)** on the wire, not the pixel |
| **Render is the exact inverse** | injected world (5000, 5000) at scale 0.5839 → expected (573.8026, 369.4732), rendered **(573.80, 369.47)** |
| **Split transform** `[R21]` | layer carried pan (−2345.81, −2550.14); cursor carried world×scale = 5000 × 0.5839 = **2919.61** |
| **Movement gate** `[R14]` | 20 identical moves → **0 writes** |
| **Throttle** `[R16]` | 40 moves over 652 ms → **14 writes** (20 Hz ceiling for that window is 15) |
| **`visibilitychange`** `[R16,R14]` | cleared to null on hide; **15 moves while hidden → still null**; republished on resume |
| **CSS** `[R21]` | computed `transition: transform 0.06s linear` |
| **Identity** | label and colour both arrive from the node; arrow **does not scale** at 400% |
| **R2, live** | 3 session nodes → 2 unique uids → **"2 online"** |

**Latency.** The instrument works. A genuine peer-to-peer reading showed **37 ms**, and a
client→server→ack round trip measured a **36 ms median** (28–44, one 163 ms outlier).
*Careful with the HUD when self-publishing:* writing and reading in the same client makes
it read ~6 ms, because RTDB echoes a local write optimistically before the server sees it.
That figure is an artifact, not a latency. PR 9 records the real number.

**Method note, because it bears on what this does and does not prove.** A browser pane
marks only one tab `visible` at a time, so two tabs can never both publish: the hidden one
is gated off by the `visibilitychange` handler *and* has its heartbeat throttled by the
browser. The verification is therefore decomposed — the publish path measured end-to-end
from a real `mousemove` through to the wire, and the render path measured from the wire
through to the committed DOM transform, the two meeting at a wire format observed carrying
real peer data. Every number above is from the real database and the real components. What
is **not** covered: two humans moving simultaneously, and the R21 judgement of whether
60 ms *looks* smooth, which is subjective by construction and belongs to PR 11.

### ⚠️ Two bugs found by this pass, neither of them in PR 6's own code

**1 — Two tabs could not hold two accounts.** Reported as "only the latest signed-in user
shows online". Not a presence bug: Firebase Auth's default `indexedDBLocalPersistence` is
scoped to the **origin**, and the SDK actively syncs auth state *between* tabs. Signing into
a second account replaced the one shared session and pushed it into the first tab, whose
`onAuthStateChanged` fired with the new user — so both tabs genuinely became the same
person, and `dedupeByUid` then correctly collapsed them to one avatar. Confirmed two ways:
`_getPersistenceType()` returned `LOCAL`, and one tab's navbar was observed changing
identity on its own.

Fixed in `firebase.ts` by constructing auth with `browserSessionPersistence`, which is
sessionStorage and therefore per-tab. **This deliberately overrides PR 3's "never touch
persistence" rule** — see the note on the `auth` export for the full reasoning. Three things
worth carrying forward: it is *not* the localStorage downgrade PR 3 warned about;
`initializeAuth` is used rather than `setPersistence` because the latter is async and races
the sign-in; and **`popupRedirectResolver: browserPopupRedirectResolver` is mandatory** —
`initializeAuth` installs none by default and `signInWithPopup` throws `auth/argument-error`
without it, taking Google sign-in and R8 with it. Verified after the change:
`persistence: "SESSION"`, resolver installed, and two tabs holding two different uids with
both showing in both panels. **Accepted cost:** a *new* tab starts signed out, and closing
a tab or quitting the browser ends that session. A reload in the same tab stays signed in,
so R4's neutral splash is untouched.

**2 — `staleAfterMs` was too tight for a backgrounded tab.** Chromium clamps `setInterval`
to 1 Hz the moment a tab is hidden and to **once per minute** after ~5 minutes, so a 10 s
heartbeat cannot hold a hidden tab under a 30 s threshold. Measured: the visible tab read
"1 online" while the hidden one read "2". The user had not left — the RTDB socket stays
open in a hidden tab, which is exactly why `onDisconnect` is the real leave signal and this
filter is only the backstop for the rare case that misses it. Raised to **90 s**, which
clears the worst-case throttled gap; erring long is the direction R17 already argues for.
This changes a PR 5 constant, and PR 5's tests still pass because they assert the invariant
(`staleAfterMs > heartbeatMs × 2`) rather than the number.

---

## PR 7 — Shape creation & local manipulation
**Closes gates 2, 3** · **~2.75h** · `feat: click-to-place rectangles with local drag`

Local only. No sync yet — that's PR 8.

**Files:** `+src/components/canvas/Rectangle.tsx` `+src/components/canvas/Controls.tsx`
`+src/contexts/CanvasContext.tsx` `+src/hooks/useCanvas.ts` `+src/utils/placement.ts`
`+src/utils/placement.test.ts` `~src/components/canvas/Canvas.tsx` `~src/utils/constants.ts`
`~src/App.tsx`

- [x] `placement.ts` — **pure** `shouldPlace({ down, up, targetIsStage })` → boolean
- [x] Place only if the pointer moved **<5px** between down and up **AND**
      `e.target === e.target.getStage()`. Without both, finishing a pan drops a phantom
      rectangle and clicking a shape stacks one on top `[R13]`
- [x] Fixed 120×80 rectangle centered on the click; fill cycled from the palette
- [x] After placing, return to Select mode with the new shape selected
- [x] `Rectangle.tsx` — `e.cancelBubble = true` in `onDragStart`, or dragging a shape also
      drags the stage `[R13]`
- [x] `perfectDrawEnabled={false}` and `shadowForStrokeEnabled={false}` on every Rect `[R7]`
- [x] Selection outline; click empty canvas to deselect; Delete/Backspace removes.
      *The outline's `strokeWidth` is divided by the stage scale, like the backdrop grid —
      Konva multiplies stroke width by the transform, so a fixed 2 is an 8 px slab at 400%
      and a hairline at 10%.*

**Two decisions the checklist doesn't name.** The press is recorded and the gesture judged
on **release**, because whether a press is a placement, a selection or a pan is simply not
knowable at press time — and the release is resolved on `window`, so letting go outside the
canvas ends the gesture as *nothing* rather than leaving it half-open. And the shapes layer
takes `listening={!spaceHeld}`: without it a space-drag that happens to start over a
rectangle both pans the stage and drags the shape, since Konva sees a press on a draggable
node while the Stage sees the pan modifier. One prop, and nothing is left to disagree.

**🧪 `placement.test.ts` — Tier 2 · ~8m — ✅ done, 7/7 green** — the guard has two
conditions and agents routinely implement only one.
- [x] 0px on the stage background → **place**
- [x] 4px on the stage background → **place** (tolerance for shaky clicks)
- [x] 50px on the stage background → **do not place** (this is a pan) `[R13]`
- [x] 0px but the target is a shape → **do not place** (this is a selection) `[R13]`
- [x] Diagonal uses true distance, not per-axis — 4px x *and* 4px y is 5.7px, no place.
      *Paired with the same total travel on a single axis, so the diagonal case cannot
      pass for an unrelated reason.*
- [x] *Added:* symmetric — up-left is the same gesture as down-right
- [x] *Added:* the bound is closed on one side only — exactly `tolerancePx` does **not**
      place, a hair under it does

**Done when:** panning never creates a phantom rectangle and dragging a shape never pans
the stage `[R13]`. ✅

*`bun run test` 52/52 (45 → 52), `tsc -b && vite build` and `oxlint` clean. Everything
below was driven through real DOM events against the running app.*

| Check | Result |
|---|---|
| Motionless click, empty canvas | places **1** |
| 4 px drift / 6 px drift | **places** / **does not place** — the tolerance boundary, live |
| 50 px travel `[R13]` | **0 placed** |
| Click **on** a shape `[R13]` | **0 placed**, with the hit probe returning `Rect` |
| Select mode, click empty canvas | **0 placed** |
| **Space-drag pan in Rectangle mode** `[R13]` | viewport moved exactly **(100, 60)**, **0 phantoms** |
| **Drag a shape** `[R13]` | shape moved exactly **(80, 50)**, **stage did not move at all** |
| Delete key | removes 1, clears the selection |
| Placement geometry | click at (300, 250) under vp {1, −4763, −4610} → shape at world **(5003, 4820)**, matching the prediction exactly |
| Palette + auto-return | five placements cycled blue→red→green→orange→purple, each ending in Select with the new shape outlined |

### Three testing traps, all of which produced convincing false results first

Worth writing down because PR 11 runs this ground again by hand, and each of these looked
exactly like a product bug.

1. **A hidden browser pane gives the stage 0×0 layout.** `getIntersection` then returns
   `Stage` for every point, because the hit canvas is zero-sized — so "click on a shape"
   silently becomes "click on the background" and the R13 target guard reads as broken. It
   also means the **no-stacking assertion passes vacuously**, which is worse than failing.
   Assert the stage has non-zero size before trusting any hit test.
2. **Konva batches draws on rAF, which is frozen in a background tab**, so the hit canvas
   can be stale even at full size. `stage.draw()` forces it synchronously.
3. **Dispatching mousedown/mousemove/mouseup synchronously beats React to its own
   listeners.** The pan subscribes to `window` inside an effect, so a `mousemove` sent in
   the same tick is missed and the pan stays armed — then leaks into the *next* test and
   moves the stage there. Every synthetic gesture has to yield between events, and
   `setTimeout` is the wrong yield: it is clamped to 1 s in a hidden tab. `MessageChannel`
   is not clamped, which is exactly why React's own scheduler uses it.

---

## PR 8 — Shape sync: transactions, array diff, drag channel
**Closes gate 4** · **~4h** · `feat: firestore transactional sync with rtdb drag channel`

The core of the project, and the densest test target. Three critical risks converge here
and every one of them is invisible until a second browser is open.

**Files:** `+src/services/canvasService.ts` `+src/services/transactionService.ts`
`+src/utils/shapeOps.ts` `+src/utils/shapeDiff.ts` `+src/utils/shapeLocks.ts`
(each with a `.test.ts`) `+src/tests/integration/concurrency.test.ts`
`+src/tests/integration/dragChannel.test.ts` `~src/contexts/CanvasContext.tsx`
`~src/components/canvas/Rectangle.tsx` `~src/components/canvas/Canvas.tsx`
`~src/services/cursorService.ts`

**Durable path — Firestore, transactional**
- [x] `shapeOps.ts` — **pure** transaction bodies: `addShape(shapes, s)`,
      `patchShape(shapes, id, fields)`, `removeShape(shapes, id)`, `claimLock`,
      `releaseLock`. Each takes the current array and returns the next one.
      *Plus `commitPosition` and `releaseAllLocks` — see the lockout note below.*
- [x] `transactionService.ts` — `runTransaction` wrapper calling those pure bodies.
      **The callback must have no side effects** — Firestore re-runs it under contention `[R23]`
- [x] `canvasService.ts` — create / commit-position / delete / lock, **every one through
      the transaction wrapper**. A plain `updateDoc` of the array means two users editing
      different rectangles clobber each other `[R23]`
- [x] `.catch` on every transaction — an exhausted retry otherwise looks like a silent
      no-op `[R23]`
- [x] ~~`useCanvas.ts`~~ — `onSnapshot` on the single canvas document. *Landed in
      `CanvasProvider`, not the hook: the provider owns the subscription and `useCanvas`
      stays a reader, mirroring `AuthContext`/`useAuth`. Keyed on `user?.uid`, never
      `[]` `[R4]`.*

**Array diff — the R7 mitigation**
- [x] `shapeDiff.ts` — **pure** diff of incoming array vs. previous state, keyed by id,
      **reusing previous object references for unchanged shapes** and skipping ids in the
      dragging set

**In-flight drag — RTDB session node** *(PRD Decision 9 — ✅ **confirmed**, streaming)*
- [x] On dragstart: claim `draggedBy` transactionally, add the id to the local dragging Set
- [x] While dragging: throttled `drag: {id, x, y}` onto the session node at 20 Hz —
      **never to Firestore**, which would exhaust 20k writes/day in ~17 min `[R14]`
- [x] Remote render: `session.drag` for that id if present, else the Firestore value
- [x] On dragend: one transactional Firestore commit, **then** clear `drag` on the session
      node — clearing first makes the rectangle visibly snap backward for a frame
- [x] Release the id from the dragging Set only **after** the transaction resolves `[R6]`
- [x] `shapeLocks.ts` — **pure** `canDrag(shape, myUid)`; coloured outline on held
      shapes `[R10]`
- [x] `onDisconnect` clears the session node, so a crash can't lock a shape forever `[R10]`.
      *This needed more than the existing `onDisconnect` — see the stale-lock note below.*
- [x] `visibilitychange` clears `draggedBy` `[R16]` — the RTDB half in the drag channel,
      the Firestore half in `CanvasProvider`

### Three things the checklist doesn't name

**1 — A commit costs one write, not two.** Position and lock release go in a *single*
transaction. `updatedAt` is stamped **outside** the body, because calling `Date.now()`
inside would make it non-deterministic across the retries Firestore performs under
contention — and a deterministic body is exactly what `shapeOps.test.ts` verifies `[R23]`.

**2 — The lockout is authoritative, not advisory.** `draggable` on the Konva node is the
guard a user feels, but it derives from state that can be briefly stale (presence not
loaded, two claims crossing on the wire). So `commitPosition` *itself* refuses to write
when someone else holds the lock. Without that the loser of a contested grab still commits
on release, and F4's "clean lockout" degrades into the oscillation the lock exists to
prevent `[R10]`. A refused claim also drops the id from the dragging set immediately, so
the holder's in-flight position renders instead of a dead-end local drag.

**3 — `onDisconnect` alone cannot free a lock.** `draggedBy` lives in **Firestore**, which
`onDisconnect` cannot reach — it only removes the RTDB session node. A client that crashes,
loses power, or has its lid closed mid-drag would leave a rectangle nobody can ever move
again. The session node vanishing *is* the signal: `canDrag` treats a lock whose holder has
no live session as free. That is the actual mechanism by which `onDisconnect` prevents a
permanent lock — the RTDB node is the liveness proof for a lock held in Firestore. It fails
**closed** when liveness is unknown, so presence not having loaded yet never unlocks
anything.

**🧪 `shapeDiff.test.ts` — Tier 1 · ~20m — ✅ done, 14/14 green** — the most valuable test
file here. Every assertion maps to a bug that looks like "sync is broken."
- [x] An unchanged shape keeps its **exact previous object reference** — this is what lets
      a memoised `Rectangle` skip re-rendering, and it is the difference between 60 FPS and
      6 at 500 objects `[R7]`
- [x] A changed shape produces a new reference; **every other entry is untouched** `[R7]`
- [x] Additions and removals are detected from the array alone (no per-shape events exist)
- [x] **A changed shape whose id is in the dragging set is IGNORED** — echo suppression.
      Without it your own commit fights your pointer `[R6]`
- [x] **A removed shape clears its id from the dragging set** — otherwise a shape deleted
      mid-drag stays permanently suppressed `[R6]`
- [x] A 500-shape array with one change produces 499 reused references
- [x] *Added:* a **reorder** of otherwise-identical shapes is detected — a diff keyed only
      on membership reports "nothing changed" and the canvas keeps a stale z-order
- [x] *Added:* the dragging set handed in is never mutated, and comes back as the **same
      reference** when no dragged id disappeared
- [x] *Added:* `collectRemoteDrags` — maps shape id → live position, **excludes your own
      session** (Konva already owns that node; rendering it from the wire adds a round trip
      to your own hand), and drops `NaN`/`Infinity`/malformed payloads

**🧪 `shapeOps.test.ts` — Tier 1 · ~15m — ✅ done, 16/16 green** — verifies the transaction
bodies without Firestore, which is the only cheap way to cover R23.
- [x] Each op **returns a new array and never mutates the input** — a mutating body
      corrupts state when Firestore re-runs the callback `[R23]`
- [x] `patchShape` on a missing id is a safe no-op, not a crash (delete-during-drag)
- [x] `addShape` twice with the same id doesn't duplicate — the retry case `[R23]`
- [x] Ops are **idempotent**: applying the same op twice equals applying it once `[R23]`
- [x] `claimLock` on a shape already held by another uid leaves it unchanged `[R10]`
- [x] *Added:* every op returns the **same array reference** on a no-op, which is what lets
      the wrapper skip the write entirely — a refused lock claim must not cost a
      Firestore write `[R14]`
- [x] *Added:* re-claiming your **own** lock succeeds — a retry mid-drag otherwise locks
      you out of the shape you are holding
- [x] *Added:* `commitPosition` **refuses** to write when another uid holds the lock

**🧪 `shapeLocks.test.ts` — Tier 2 · ~3m — ✅ done, 11/11 green**
- [x] `draggedBy` null/absent → draggable by anyone
- [x] `draggedBy === myUid` → draggable (your own claim never locks you out — a real bug if
      written as a bare truthiness check) `[R10]`
- [x] `draggedBy === otherUid` → not draggable `[R10]`
- [x] *Added:* a lock whose holder has **no live session** is free `[R10]`, and liveness
      being *unknown* still honours the lock — failing open there would unlock the whole
      canvas for the moment before presence loads

**🧪 `tests/integration/concurrency.test.ts` — Tier 3 · ~30m · emulator — ✅ done, 6/6
green** (`bun run test:emulator`, 10/10 with PR 2's rules tests)
- [x] Two clients commit **different** shapes concurrently → **both survive**. This is the
      transaction earning its place, and it's acceptance item 8 `[R23]`
- [x] The same test with a plain `updateDoc` loses one write. **Kept, not deleted** — it
      passes by *reproducing* the bug, and it is the only direct evidence that Decision 8
      is load-bearing rather than defensive habit. Alice's write vanishes exactly as
      predicted.
- [x] *Added:* two clients creating different shapes concurrently; a burst of ten
      concurrent creates all surviving; two clients grabbing the **same** rectangle
      yielding exactly one holder; and the loser's commit being refused rather than
      clobbering the holder `[R10]`

**Done when:** two users dragging different rectangles both keep their changes, and two
users grabbing the same rectangle produce a clean lockout rather than oscillation.

*Unit layer: `bun run test` **96/96** (52 → 96). Emulator layer: `bun run test:emulator`
**16/16**. `tsc -b && vite build` and `oxlint` clean.*

**🧪 `tests/integration/dragChannel.test.ts` — Tier 3, added** — `throttle.test.ts` covers
the send rate and `shapeDiff.test.ts` covers the mapping, but both work on values in
memory. Neither shows that the two halves **agree across the wire**: that the payload
`startDragChannel` writes is the payload `collectRemoteDrags` reads back, under the
committed RTDB rules, on the parent path a client actually listens on. That seam is where a
refactor breaks things silently, because each side keeps passing its own unit tests.
- [x] A drag written by one tab is readable by the other, at the right position
- [x] The writer does **not** see its own drag
- [x] Clearing on release deletes the key rather than storing a literal `null`
- [x] **The identity written at announce survives a drag update untouched** — proof that
      `update` patches one key instead of replacing the node, which is the whole reason
      cursor and drag can share the presence node
- [x] Two tabs dragging different shapes are both visible to a third reader
- [x] A departed tab takes its in-flight drag with it `[R10]`

**Done when — verified live, two browsers, two accounts** (`ab` and `kitty`):

| Check | Result |
|---|---|
| Shape created in one tab | appears in the other |
| **In-flight handoff**, mid-drag | observer rendered **y = 4100** (RTDB) while Firestore still held **4660** — PRD §4.3 exactly |
| Lock, mid-drag | observer's node `draggable: false`, dashed outline in the holder's colour `#db2777` |
| Untouched shape, mid-drag | Firestore position, draggable, no outline — nothing over-applied |
| Release | committed **4100**, lock cleared, observer falls back to Firestore with **no snap-back** |
| Dragging-set release | only **after** the transaction resolved `[R6]` |
| **Two users, different rectangles** | **both survived** — 4600 and 5900. Acceptance item 8 |
| **Two users, same rectangle** | **clean lockout at all three layers** — see below |

The same-rectangle test bypassed the UI guard deliberately, to prove the lockout is not
merely cosmetic: `draggable` was `false` for the second user, the transactional claim was
**refused** and its id dropped from the dragging set, and the refused user's release to
(9000, 9000) **did not move the shape at all**. That is the difference between a clean
lockout and oscillation.

### ⚠️ R5 fired a second time — the deployed Firestore rules did not match either

Same shape as PR 5, other database. Every write came back `permission-denied` while
`firestore.rules` plainly allowed `read, write: if request.auth != null`. **PR 8 is the
first code in the project to write to Firestore at all** — PRs 2–4 only read `.info/*`,
PR 5–6 were RTDB, and PR 7 was deliberately local-only — so the console's Firestore rules
had never once been exercised. Fixed with `bunx firebase deploy --only firestore:rules`,
the mechanism PR 2 designated when it made the committed files the source of truth.

**Both rulesets have now drifted, and both were caught only by the first code to touch
them.** The emulator tests could not have caught either, because they test the file. The
standing lesson for PR 11: deploy both rulesets before the acceptance pass, not after.

### The bug that made the canvas look completely broken: setState inside a setState updater

Every snapshot was silently dropped. Transactions returned `ok: true, applied: true`, the
document genuinely held three shapes, and Konva rendered **zero** — no error, no warning,
nothing in the network tab to suggest a problem.

The snapshot handler called `setDragging(...)` **inside** the `setShapes(previous => ...)`
updater. React invokes updaters during render — twice under StrictMode, deliberately — so
that is a state update to one component while rendering another, and the update is
discarded. The diff now runs in the callback body against a `shapesRef`, with both
setStates called as siblings.

**This is the third instance of the same failure class in this build**, and worth stating
as a rule rather than three anecdotes: PR 4 flipped a ref inside an updater and opened the
canvas on the wrong corner; PR 5 hit the ordering version of it in the presence chain; this
one dropped every remote change. **Nothing that touches state, refs, or other components
may live inside a state updater** — updaters must be pure functions of `previous`. All
three survived every unit test, and all three presented as something else entirely.

### Follow-up — shapes could be dragged out of the world and lost

Reported after the pass above: a shape could be dropped anywhere, including outside the
10,000 × 10,000 world. That is not merely untidy — `clampViewport` will not let the
viewport travel past the edge, so an out-of-bounds shape renders nowhere and can never be
selected, moved or deleted again. `placeAt` already guarded against it; drag did not.

`clampShapeToWorld` (in `placement.ts`, 🧪 7 more assertions) clamps the **whole
rectangle**, not just its origin — pinning the top-left to the edge still leaves the body
hanging over it. Applied at three points, each earning its place:

- **`Rectangle.onDragEnd`** — the visual correction, and it must set `e.target.position()`
  explicitly. Konva owns the node during a drag and react-konva only writes `x`/`y` back
  when the **prop** changes, so a shape dragged out from a position the clamp returns it to
  keeps an unchanged prop, gets no update, and sits visibly out of bounds while the
  committed value is correct. Verified against exactly that case.
- **`CanvasContext.endDrag`** — the invariant, independent of caller.
- **`placeAt`** — the same bug by another route: a click just inside the edge is legal but
  centres a 120×80 rectangle half over it.

*Verified live: (99999, 99999) → (9880, 9920); (−5000, −5000) → (0, 0); and origin-legal
body-overhanging (9950, 5000) → (9880, 5000) — far edge landing on exactly 10000 in both
directions. A real Konva drag from a flush-at-9880 shape, 250 px further out, snapped the
node back to 9880 matching the commit. `bun run test` **103/103**.*

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
