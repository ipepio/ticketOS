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
| T1 | S1 | worker (gentle-ai-worker): audit resolver, pure module tests for the three precedence rules | — |
| T2 | S2 | worker: browser test RED → dedicated setup shell split (no sidebar/topbar while unconfigured) | — |
| T3 | S3 | worker: setup locale from i18n context, timezone default `Intl.DateTimeFormat().resolvedOptions().timeZone` with `UTC` fallback, first-field focus, error announcement | — |
| T4 | S4 | worker: browser tests (locale precedence incl. `document.documentElement.lang`, timezone fallback, keyboard path), README update | — |

## Log

L1 (verbatim): "organiza un goal para hacer todas las features pendientes, y orquestalo todo. El desarrollo que sea todo con deepseek-v4-flash o hy4-flash ambos de nan.builders, vale?"

L2 (seam decision): packages/portal vitest runs in the node environment with no DOM dependency
available (and repo rules forbid adding dependencies without approval), so S1's resolver precedence
rules are pinned as pure module tests in vitest, while `document.documentElement.lang` and
`ticketos-locale` persistence are pinned by the browser tests of T4, per the spec's Testing
Decisions ("Control `navigator.languages`, `Intl.DateTimeFormat`, and localStorage only as
browser-environment adapters").
