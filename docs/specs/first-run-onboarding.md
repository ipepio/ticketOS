# Feature — First-run onboarding shell and browser-default locale

- **Status:** ready
- **Primary seam:** browser portal → Setup HTTP interface
- **Related modules:** Setup, Identity, Workspace, portal i18n
- **Related ADRs:** 0003, 0005, 0037, 0049, 0053

## Problem Statement

On an unconfigured Installation, the setup form is currently rendered inside the
normal authenticated application shell. The visible Sidebar, top bar, and Ticket
navigation imply that a Workspace and session already exist, even though setup
is the operation that creates them. The portal also defaults to English instead
of respecting the browser language on a first visit.

## Solution

Treat first-run setup as a dedicated full-page onboarding state, not as a modal
and not as a page inside the authenticated portal shell. While setup is required,
render only the setup experience: centered card, installation branding, form,
locale switcher, and accessible status/error feedback.

Resolve the initial locale in this order:

1. a valid `ticketos-locale` value previously chosen by the user;
2. the first supported value in `navigator.languages` (or `navigator.language`),
   mapping `es`/`es-*` to Spanish; and
3. English as the fallback.

The Setup Wizard uses that resolved locale and initializes its timezone from
`Intl.DateTimeFormat().resolvedOptions().timeZone`, falling back to `UTC`.

## User Stories

1. As a first Installation Admin, I want setup to be the only visible experience on an unconfigured Installation, so that I am not confused by unavailable Ticket navigation.
2. As a Spanish-speaking first Installation Admin, I want the setup form to start in Spanish when my browser prefers Spanish, so that I can configure the Installation without changing language manually.
3. As a first Installation Admin, I want to override the initial locale, so that the Installation setup matches my preferred language.
4. As a first Installation Admin, I want the detected timezone preselected, so that calendars and SLA defaults begin with a sensible value.
5. As an authenticated User, I want normal Sidebar/topbar navigation only after setup is complete, so that shell navigation always has a valid Workspace/session context.
6. As a keyboard user, I want setup focus and errors to be accessible, so that I can complete onboarding without a mouse.

## Implementation Decisions

### Deep modules and seams

- **Setup** owns the unconfigured/configured Installation decision through its
  existing Setup HTTP interface. The portal consumes that outcome; it does not
  infer setup from Ticket, Queue, or Workspace list failures.
- **Portal i18n** owns locale resolution behind a small pure interface such as
  `resolveInitialLocale(storageValue, browserLanguages)`. React components call
  that interface instead of duplicating browser-language parsing.
- **Portal shell** owns the distinction between pre-auth setup and authenticated
  navigation. The highest browser seam observes whether Sidebar/topbar/bottom
  navigation exists, not component internals.
- Browser locale/timezone and localStorage are true external dependencies. They
  are injected or controlled only at the portal test seam.

### Tasks

#### ONB-01 — Locale resolver

1. Extract browser/persisted locale selection from the i18n provider into a pure
   portal i18n module interface.
2. Support `es`, `es-*`, `en`, and `en-*`; unsupported or absent values fall
   back to English.
3. Preserve the explicit locale switcher behavior and persist the chosen value.

**Acceptance criteria**

- `ticketos-locale=es` wins over a browser that prefers English.
- Browser `es-ES` or `es-MX` selects Spanish when no stored locale exists.
- Browser `en-GB`, unsupported values, and missing browser locale fall back to
  English as specified.
- Locale changes update `document.documentElement.lang` and persist for reload.

#### ONB-02 — Dedicated setup shell

1. Model setup as a top-level portal state before rendering authenticated layout.
2. When Setup reports `configured: false`, render a full-page setup experience
   with no Sidebar, topbar, bottom navigation, Ticket counters, or Ticket actions.
3. Keep the existing Setup HTTP flow and transition into the authenticated
   portal only after successful bootstrap/session initialization.

**Acceptance criteria**

- On an unconfigured Installation, DOM/browser tests find the setup form and
  find no Sidebar, topbar, bottom navigation, “My Tickets”, or “New Ticket”.
- Setup is not implemented as an overlay/modal over the application shell.
- On a configured Installation, the setup form is not rendered and normal
  authentication/session behavior remains available.
- A successful setup does not leave stale setup navigation visible after reload.

#### ONB-03 — Browser defaults and accessibility

1. Initialize Setup Wizard locale from the portal i18n context, not a separate
   hard-coded local state.
2. Initialize timezone from browser runtime with a safe `UTC` fallback.
3. Focus the first required field on initial setup render; announce submission,
   validation, and server errors with appropriate live/alert semantics.
4. Confirm keyboard-only completion and visible focus behavior.

**Acceptance criteria**

- Spanish browser preference renders Spanish setup labels before user input.
- The timezone selector defaults to the browser timezone when available.
- The first required field receives focus and all required fields have labels.
- Submission failure is announced once and does not lose entered values.

#### ONB-04 — Regression and documentation

1. Add browser tests for unconfigured setup shell, configured shell, locale
   precedence, timezone fallback, and keyboard path.
2. Add module tests for locale resolution with known literals.
3. Update README and contributor context to describe first-run setup and remove
   stale delivery-backlog references.

**Acceptance criteria**

- Tests cross only the i18n resolver seam and browser/Setup seam; they do not
  inspect React component state or mock internal portal modules.
- Existing authentication, session restore, and setup bootstrap tests continue
  to pass.

## Testing Decisions

Use TDD vertical slices:

1. Write a failing pure test for one locale precedence example; implement only
   the resolver behavior required for green.
2. Write a failing browser test asserting setup without application navigation;
   implement the top-level shell split.
3. Write a failing browser test for browser Spanish/timezone defaults; implement
   setup context wiring.
4. Refactor only after green slices are complete.

Use a real Setup HTTP adapter and isolated PostgreSQL for browser setup tests.
Do not mock Setup, Identity, or Workspace modules. Control `navigator.languages`,
`Intl.DateTimeFormat`, and localStorage only as browser-environment adapters.

## Out of Scope

- A modal setup flow.
- Per-Workspace authored translations.
- Additional setup steps for SMTP, OIDC, S3/R2, or billing.
- Changing Workspace/Identity authorization semantics.
- Rebuilding the authenticated portal visual design.

## Further Notes

The browser locale is a first-run default, not an authorization or Workspace
policy. A later explicit User locale preference remains authoritative.
