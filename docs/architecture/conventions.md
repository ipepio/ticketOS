# Naming, types and code conventions

Preserve this repository's stable vocabulary without copying its unfinished code or mistakes.
These are future implementation conventions; this documentation template installs no formatter.

## Naming and layout

| Element | Convention |
| --- | --- |
| Feature directories | Plural business nouns, camelCase (e.g. `approval`, `knowledge-base`) |
| Files | Responsibility-suffixed kebab-case; `.ts` module files named for the capability |
| Classes, interfaces and types | PascalCase; no automatic `I` prefix |
| Methods and application fields | camelCase |
| DI constants | UPPER_SNAKE_CASE strings |
| Own SQL schema | snake_case identifiers, mapped explicitly |
| External DTO fields | Preserve the external contract literally |

Use `.test.ts` colocated next to the unit file (e.g. `postgres.test.ts`). Avoid vague names such as
`manager`, `helper` or `processor` when a business action or technical responsibility can be named precisely.

## TypeScript and formatting

- ESM/NodeNext; package-local relative imports end in `.js` in TypeScript source.
- Cross-package imports use workspace package specifiers (`@ticketos/domain`, `@ticketos/shared`,
  `@ticketos/portal`), not relative paths into another package.
- Use strict checking; do not weaken compiler or lint settings to make a task pass.
- Use `import type` for erased imports. Use `unknown` at untrusted boundaries and narrow/validate it.
- Avoid `any`, double casts, non-null assertions and broad lint disables as substitutes for handling
  actual uncertainty. A justified exceptional case must explain the invariant and have a test.
- Prefer readonly domain data where appropriate. Do not impose classes where plain types suffice.
- This repository uses `typescript-eslint` but has no Prettier (or other formatter) configuration
  installed yet. No formatting baseline can be stated until one is added. Once a formatter is
  installed, its project configuration is authoritative.
- Code, identifiers and technical comments default to English. Human discussion follows the owner's
  language. Respect an adopted project's explicitly different documentation convention.

## Exports and abstraction

Use `index.ts` barrels for intentional public surfaces. Do not export every internal adapter simply
to make imports shorter, or import a feature's own top-level barrel internally and create cycles.
Keep cross-feature internals private. Avoid deep package imports.

Choose composition over inheritance unless a real stable abstraction is already established.
Do not add generic CRUD controllers, universal repository filters, DTO generators or a custom
framework for future possibilities. Two similar functions do not automatically justify a shared base.

## Preserve behavior

A new pattern in this template is not permission to migrate this repository's code wholesale.
Do not copy known anomalies from the source: `.ts` runtime imports, deep `dist` imports, constructor
arrays in handler registries, wrong logger interfaces or reference equality for value objects.
Fix unrelated anomalies only as separately authorized work. Keep the requested change reviewable.
