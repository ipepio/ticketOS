# Architecture fixture trees

Miniature monorepos used by `scripts/check-architecture.test.ts` to prove that the
checker fails a deliberate boundary violation (S2) and passes a correct tree.

- `clean/` satisfies every rule: domain stays framework-free, use cases import domain
  contracts, routes import a use-case module, `pg` lives only in `postgres.ts` and
  `db/`, and aliases (`@/*`) plus workspace packages (`@ticketos/*`) resolve.
- `violating/` is `clean/` plus one deliberately violating file per boundary, including
  bypass attempts (alias import, `export ... from`, dynamic `import('pg')`) so
  resolved-path and AST coverage are exercised.

Sources are stored as `.ts.tpl`. That keeps the repository's own typecheck and editor
tooling from trying to resolve the miniature monorepo's packages; the self-test copies
each tree into a fresh system temp directory, renames the templates back to `.ts`,
checks it, and deletes the copy. Never check these templates in place: they intentionally
import modules that only exist inside the fixture tree.
