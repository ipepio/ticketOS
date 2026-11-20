/**
 * Negative-fixture self-test for `scripts/check-architecture.ts` (S2: "Test that
 * deliberately violating each boundary fails").
 *
 * `arch-fixtures/clean` is a miniature monorepo that satisfies every rule and must
 * report zero violations. `arch-fixtures/violating` is the same tree plus one
 * deliberately violating file per boundary (including alias, re-export and dynamic
 * import bypass attempts) and must report every one of them, through resolved paths.
 *
 * Fixture sources are stored as `.ts.tpl` so the repository's own typecheck and
 * editor tooling never try to resolve the miniature monorepo's packages. Each test
 * materializes a real `.ts` tree in a fresh system temp directory and deletes it.
 *
 * Run from the repository root (`scripts/` owns no node_modules or tsconfig, so the
 * suite borrows the app package's vitest and enables test globals):
 *
 *   pnpm --filter @ticketos/app exec vitest run --root ../.. --globals scripts/check-architecture.test.ts
 */
import { cpSync, existsSync, mkdtempSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { RULES, checkArchitecture, runCheck, type Violation } from './check-architecture';

// Vitest globals, declared locally because this directory has no test-runner types.
declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
interface Expectation {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toContain(expected: string): void;
  toBeTruthy(): void;
  not: { toContain(expected: string): void };
}
declare function expect(actual: unknown): Expectation;

const TEMPLATE_SUFFIX = '.tpl';
const TEMPLATES_CANDIDATES = [
  resolve(process.cwd(), 'scripts', 'arch-fixtures'),
  resolve(process.cwd(), '..', '..', 'scripts', 'arch-fixtures'),
];

const templateRoot: string = (() => {
  const found = TEMPLATES_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`scripts/arch-fixtures not found from cwd ${process.cwd()}`);
  return found;
})();

function renameTemplates(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      renameTemplates(path);
      continue;
    }
    if (!entry.name.endsWith(TEMPLATE_SUFFIX)) continue;
    renameSync(path, path.slice(0, -TEMPLATE_SUFFIX.length));
  }
}

/** Copy a fixture tree into a fresh temp directory with `.tpl` templates renamed to `.ts`. */
function withFixture<T>(name: 'clean' | 'violating', run: (root: string) => T): T {
  const scratch = mkdtempSync(join(tmpdir(), 'ticketos-arch-fixtures-'));
  try {
    const root = join(scratch, name);
    cpSync(join(templateRoot, name), root, { recursive: true });
    renameTemplates(root);
    return run(root);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function key(violation: Violation): string {
  return `${violation.file}:${violation.line} [${violation.rule}]`;
}

const EXPECTED_VIOLATIONS: ReadonlyArray<readonly [file: string, line: number, rule: string]> = [
  ['packages/app/src/cycle-b.ts', 1, 'import-cycle'],
  ['packages/app/src/feature/alias-leak.ts', 1, 'use-case-boundary'],
  ['packages/app/src/feature/cross-adapter.ts', 1, 'use-case-boundary'],
  ['packages/app/src/feature/dynamic-pg.ts', 2, 'pg-location'],
  ['packages/app/src/feature/pg-leak.ts', 1, 'pg-location'],
  ['packages/app/src/feature/reexport.ts', 1, 'use-case-boundary'],
  ['packages/app/src/feature/unresolved.ts', 1, 'unresolved-import'],
  ['packages/app/src/feature/use-case.ts', 1, 'use-case-boundary'],
  ['packages/app/src/routes/leak-adapter.ts', 1, 'route-boundary'],
  ['packages/app/src/routes/leak-gateway.ts', 1, 'route-boundary'],
  ['packages/app/src/routes/leak-pool.ts', 1, 'route-boundary'],
  ['packages/domain/src/domain-fastify.ts', 1, 'domain-boundary'],
  ['packages/domain/src/domain-http.ts', 1, 'domain-boundary'],
  ['packages/domain/src/domain-infra.ts', 1, 'domain-boundary'],
  ['packages/domain/src/domain-pg.ts', 1, 'domain-boundary'],
];

describe('architecture checker: clean fixture tree', () => {
  it('reports zero violations and exits 0', () => {
    withFixture('clean', (root) => {
      const result = checkArchitecture(root);
      expect(result.violations).toEqual([]);
      expect(result.filesChecked).toBe(12);

      const lines: string[] = [];
      expect(runCheck(root, (line) => lines.push(line))).toBe(0);
      expect(lines.join('\n')).toContain('Architecture check passed');
    });
  });

  it('does not flag sanctioned composition wiring or the SQL adapters', () => {
    withFixture('clean', (root) => {
      const result = checkArchitecture(root);
      for (const allowed of ['feature/index.ts', 'feature/postgres.ts', 'feature/own-adapter.ts', 'db/connection.ts']) {
        expect(result.violations.some((violation) => violation.file.endsWith(allowed))).toBe(false);
      }
    });
  });
});

describe('architecture checker: violating fixture tree', () => {
  it('reports every deliberately violating boundary and exits 1', () => {
    withFixture('violating', (root) => {
      const result = checkArchitecture(root);
      expect(result.violations.map(key)).toEqual(
        EXPECTED_VIOLATIONS.map(([file, line, rule]) => `${file}:${line} [${rule}]`),
      );

      const lines: string[] = [];
      expect(runCheck(root, (line) => lines.push(line))).toBe(1);
      for (const expected of EXPECTED_VIOLATIONS.map(([file, line, rule]) => `${file}:${line} [${rule}]`)) {
        expect(lines.join('\n')).toContain(expected);
      }
      expect(lines.join('\n')).toContain(`Architecture check failed: ${EXPECTED_VIOLATIONS.length} violation(s)`);
    });
  });

  it('resolves aliases and package names before applying a rule', () => {
    withFixture('violating', (root) => {
      const result = checkArchitecture(root);
      const aliasLeak = result.violations.find((violation) => violation.file.endsWith('alias-leak.ts'));
      expect(aliasLeak).toBeTruthy();
      // The alias `@/routes/health.js` is judged by its resolved path, not its text.
      expect(aliasLeak?.message).toContain('packages/app/src/routes/health.ts');

      const domainInfra = result.violations.find((violation) => violation.file.endsWith('domain-infra.ts'));
      expect(domainInfra).toBeTruthy();
      expect(domainInfra?.message).toContain('"@ticketos/app"');
    });
  });

  it('sees dynamic imports and re-exports through the AST', () => {
    withFixture('violating', (root) => {
      const result = checkArchitecture(root);
      const dynamic = result.violations.find((violation) => violation.file.endsWith('dynamic-pg.ts'));
      expect(dynamic).toBeTruthy();
      expect(dynamic?.message).toContain('dynamic import() of "pg"');
      const reexport = result.violations.find((violation) => violation.file.endsWith('reexport.ts'));
      expect(reexport).toBeTruthy();
      expect(reexport?.message).toContain('re-export from');
    });
  });

  it('fires at least one violation for every declared rule boundary', () => {
    withFixture('violating', (root) => {
      const result = checkArchitecture(root);
      for (const rule of RULES) {
        expect(result.violations.some((violation) => violation.rule === rule.id)).toBe(true);
      }
      expect(result.violations.some((violation) => violation.rule === 'import-cycle')).toBe(true);
      expect(result.violations.some((violation) => violation.rule === 'unresolved-import')).toBe(true);
    });
  });
});

describe('architecture fixtures and rule table', () => {
  it('keeps every fixture named in the rule table present on disk', () => {
    for (const rule of RULES) {
      for (const fixture of rule.fixtures) {
        expect(existsSync(resolve(templateRoot, `${fixture}${TEMPLATE_SUFFIX}`))).toBe(true);
      }
    }
  });
});
