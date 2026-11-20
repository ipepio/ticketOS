# Feature — First-run onboarding: dedicated shell and browser-default locale

Resume and complete `docs/specs/first-run-onboarding.md` (status: ready). Partial work already
landed in commits `90a80f5` (ES/EN translations), `c497c73` (setup isolation + browser locale
detection) and `56f0e5d` (9 languages). The feature is done when every acceptance criterion below
is observed through the stated seams.

## Specs

S1 (ONB-01, Locale resolver — acceptance criteria, verbatim):
- "`ticketos-locale=es` wins over a browser that prefers English."
- "Browser `es-ES` or `es-MX` selects Spanish when no stored locale exists."
- "Browser `en-GB`, unsupported values, and missing browser locale fall back to English as specified."
- "Locale changes update `document.documentElement.lang` and persist for reload."
- Preserve the explicit locale switcher behavior and persist the chosen value.

S2 (ONB-02, Dedicated setup shell — acceptance criteria, verbatim):
- "On an unconfigured Installation, DOM/browser tests find the setup form and find no Sidebar, topbar, bottom navigation, “My Tickets”, or “New Ticket”."
- "Setup is not implemented as an overlay/modal over the application shell."
- "On a configured Installation, the setup form is not rendered and normal authentication/session behavior remains available."
- "A successful setup does not leave stale setup navigation visible after reload."

S3 (ONB-03, Browser defaults and accessibility — acceptance criteria, verbatim):
- "Spanish browser preference renders Spanish setup labels before user input."
- "The timezone selector defaults to the browser timezone when available."
- "The first required field receives focus and all required fields have labels."
- "Submission failure is announced once and does not lose entered values."

S4 (ONB-04, Regression and documentation — acceptance criteria, verbatim):
- "Tests cross only the i18n resolver seam and browser/Setup seam; they do not inspect React component state or mock internal portal modules."
- "Existing authentication, session restore, and setup bootstrap tests continue to pass."
- "Add browser tests for unconfigured setup shell, configured shell, locale precedence, timezone fallback, and keyboard path."
- "Add module tests for locale resolution with known literals."
- "Update README and contributor context to describe first-run setup and remove stale delivery-backlog references."

## Tasks

| ID | Spec | Route | Commit |
| --- | --- | --- | --- |
| T1 | S1 | worker (gentle-ai-worker): audit resolver, pure module tests for the three precedence rules | ce6410b |
| T2 | S2 | worker: browser test RED → dedicated setup shell split (no sidebar/topbar while unconfigured) | pre-existing (c497c73); verified by T4 tests |
| T3 | S3 | worker: setup locale from i18n context, timezone default `Intl.DateTimeFormat().resolvedOptions().timeZone` with `UTC` fallback, first-field focus, error announcement | pre-existing (c497c73); timezone defect fixed in T4 |
| T4 | S4 | worker: browser tests (locale precedence incl. `document.documentElement.lang`, timezone fallback, keyboard path), README update | this slice |

## Log

L1 (verbatim): "organiza un goal para hacer todas las features pendientes, y orquestalo todo. El desarrollo que sea todo con deepseek-v4-flash o hy4-flash ambos de nan.builders, vale?"

L2 (seam decision): packages/portal vitest runs in the node environment with no DOM dependency
available (and repo rules forbid adding dependencies without approval), so S1's resolver precedence
rules are pinned as pure module tests in vitest, while `document.documentElement.lang` and
`ticketos-locale` persistence are pinned by the browser tests of T4, per the spec's Testing
Decisions ("Control `navigator.languages`, `Intl.DateTimeFormat`, and localStorage only as
browser-environment adapters").

L3 (T1 evidence, worker verified by parent): the audit found `resolveInitialLocale` already obeys
all three S1 precedence rules; `packages/portal/src/i18n.test.ts` already existed (56f0e5d) covering
them, so T1 only added non-duplicative boundary assertions. Portal suite 13/13. Commit ce6410b.

L4 (T4 evidence, worker verified by parent): `packages/tests/e2e/first-run-onboarding.spec.ts` (10
browser tests) covers every S2/S3/S4 criterion. Eight run against a disposable app instance the spec
boots itself (scratch database `ticketos_setup_e2e`, fixed identifier, app from source on port 4101,
real Setup HTTP seam, `navigator.languages`/`Intl.DateTimeFormat` controlled via `addInitScript`);
two run against the seeded configured installation on the shared app. Keyboard-only completion is
proven with `page.keyboard` only. The suite exposed one real product defect: the Setup Wizard
preselected the browser timezone even when it was not among the hardcoded 12 `<option>` values, so
browsers in other zones (e.g. America/Bogota) rendered an empty selector and silently submitted UTC.
Fixed minimally: the detected timezone is always added to the options (main.tsx). README gained the
"First-run setup" section. Final observed gate on this branch: Playwright 26/26 (16 pre-existing + 10
new), portal unit 13/13, `pnpm -r typecheck` 0 errors, lint clean, build emits. The slice is tests +
minimal fix + docs in one indivisible red→green unit (~690 lines, above the ~400 guideline for the
same reason recorded in L14 of the admin feature: the spec file is one seam).

L5 (environment gotcha, twice hit): `pkill -f "tsx watch src/index.ts"` kills the tsx parent but the
spawned node child keeps the port. Symptom: the app answers, `/` serves the CURRENT index.html (the
SPA fallback reads it from disk per request) but rebuilt assets 404 as JSON, so React never mounts
and only API-level e2e tests pass. Fix: `lsof -nP -iTCP:<port> -sTCP:LISTEN` to get the real PID and
`kill <pid>` the node child before restarting.
