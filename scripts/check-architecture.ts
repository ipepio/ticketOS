/**
 * Hand-rolled architecture import checker.
 *
 * Enforces the dependency rules documented in `docs/architecture/testing.md`
 * ("Architecture acceptance checks", S1) with resolved-path coverage (S2):
 * every import is resolved to an absolute file (relative specifiers, workspace
 * package names + exports, and tsconfig path aliases) before a rule is applied.
 * Dynamic `import()`, `export ... from` and `import x = require(...)` are read
 * from the TypeScript AST, so they cannot bypass a rule (S3).
 *
 * Run: `pnpm check:arch [<root>]`, or `tsx scripts/check-architecture.ts [<root>]`.
 * Exit code 1 when any violation is found.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import * as ts from 'typescript';

export type RuleId =
  | 'domain-boundary'
  | 'use-case-boundary'
  | 'route-boundary'
  | 'pg-location'
  | 'import-cycle'
  | 'unresolved-import';

type RuleScope = 'domain' | 'app-feature' | 'app-route' | 'app-pg';

/** One declarative row per S1 requirement; the engine only reads these fields. */
export interface RuleDefinition {
  readonly id: RuleId;
  /** Verbatim requirement from docs/architecture/testing.md (S1). */
  readonly requirement: string;
  readonly scope: RuleScope;
  /** External module names this rule forbids (npm packages, node builtins). */
  readonly denyExternal: readonly RegExp[];
  /** Resolved repo-relative target paths this rule forbids, in any feature. */
  readonly denyTarget: readonly RegExp[];
  /** Resolved target paths this rule forbids only outside the importer's own feature. */
  readonly denyTargetOtherFeature: readonly RegExp[];
  /** Files (repo-relative) this rule does not apply to. */
  readonly allowImporter: readonly RegExp[];
  /** When non-empty, resolved internal targets must belong to one of these packages. */
  readonly allowedTargetPackages: readonly string[];
  /**
   * Judge only runtime imports: an `import type`/`export type` statement is
   * erased at emit and creates no edge between the layers. Every value,
   * side-effect (`import 'pg'`), dynamic `import()` and `require()` form is
   * still judged. Only `pg-location` sets this (see the rule table comment).
   */
  readonly typeOnlyExempt: boolean;
  /** Deliberately violating fixtures proving this rule fires (sources stored as `.ts.tpl`). */
  readonly fixtures: readonly string[];
  /** Why the rule exists, appended to a violation message. */
  readonly rationale: string;
}

const PG_MODULE = /^pg($|\/)/;
const APP_SRC_ROUTES = /\bsrc\/routes\//;
const APP_SRC_SQL_ADAPTER = /\/postgres\.ts$/;
const APP_SRC_CONNECTION_POOL = /\bsrc\/db\/connection\.ts$/;
const APP_SRC_GATEWAY_ADAPTER = /\bsrc\/(email|storage)\//;

export const RULES: readonly RuleDefinition[] = [
  {
    id: 'domain-boundary',
    requirement: 'Domain must not import Fastify, `pg`, HTTP clients, configuration or infrastructure.',
    scope: 'domain',
    denyExternal: [
      /^fastify$/,
      /^@fastify\//,
      PG_MODULE,
      /^postgres($|\/)/,
      /^node:(http|https|http2|net|tls|dns)$/,
      /^(http|https|undici|axios|node-fetch|got|superagent)$/,
    ],
    denyTarget: [],
    denyTargetOtherFeature: [],
    allowImporter: [],
    allowedTargetPackages: ['@ticketos/domain', '@ticketos/shared'],
    typeOnlyExempt: false,
    fixtures: [
      'violating/packages/domain/src/domain-fastify.ts',
      'violating/packages/domain/src/domain-pg.ts',
      'violating/packages/domain/src/domain-http.ts',
      'violating/packages/domain/src/domain-infra.ts',
    ],
    rationale: 'domain contracts must stay framework-free and infrastructure-free',
  },
  {
    id: 'use-case-boundary',
    requirement:
      'Commands/queries must not import route handlers, transport DTOs or concrete SQL/gateway adapters.',
    scope: 'app-feature',
    denyExternal: [],
    denyTarget: [APP_SRC_ROUTES],
    denyTargetOtherFeature: [APP_SRC_SQL_ADAPTER, APP_SRC_GATEWAY_ADAPTER],
    // `<feature>/postgres.ts` is the SQL adapter itself, not a command/query.
    allowImporter: [APP_SRC_SQL_ADAPTER],
    allowedTargetPackages: [],
    typeOnlyExempt: false,
    fixtures: [
      'violating/packages/app/src/feature/use-case.ts',
      'violating/packages/app/src/feature/alias-leak.ts',
      'violating/packages/app/src/feature/reexport.ts',
      'violating/packages/app/src/feature/cross-adapter.ts',
    ],
    rationale:
      'use cases talk to domain contracts; another feature\'s route, SQL adapter or gateway stays behind its own contract',
  },
  {
    id: 'route-boundary',
    requirement: 'Route handlers must not import `postgres.ts` or the connection pool.',
    scope: 'app-route',
    denyExternal: [],
    denyTarget: [APP_SRC_SQL_ADAPTER, APP_SRC_CONNECTION_POOL, APP_SRC_GATEWAY_ADAPTER],
    denyTargetOtherFeature: [],
    allowImporter: [],
    allowedTargetPackages: [],
    typeOnlyExempt: false,
    fixtures: [
      'violating/packages/app/src/routes/leak-pool.ts',
      'violating/packages/app/src/routes/leak-adapter.ts',
      'violating/packages/app/src/routes/leak-gateway.ts',
    ],
    rationale: 'a route handler dispatches to a use case or a domain contract only',
  },
  {
    id: 'pg-location',
    requirement: '`pg` imports stay in `<feature>/postgres.ts` and `db/`.',
    scope: 'app-pg',
    denyExternal: [PG_MODULE],
    denyTarget: [],
    denyTargetOtherFeature: [],
    allowImporter: [APP_SRC_SQL_ADAPTER, /\bsrc\/db\//],
    allowedTargetPackages: [],
    // Precision, not weakening: `import type { Pool } from 'pg'` is erased at
    // emit, so it cannot couple a module to the driver at runtime.
    typeOnlyExempt: true,
    fixtures: [
      'violating/packages/app/src/feature/pg-leak.ts',
      'violating/packages/app/src/feature/dynamic-pg.ts',
    ],
    rationale: 'the SQL driver is owned by the pool and the SQL adapters',
  },
];

/**
 * Wiring inside one feature is allowed: an owning feature may import its own
 * `postgres.ts` or gateway adapter (docs/architecture/structure.md: "The feature
 * module imports the implementation to wire it"). Cross-feature imports and
 * route-handler imports are what the rules deny. `app.ts` is the application
 * composition root and lives in core, outside every feature scope.
 *
 * `route-boundary` is resolved-path scope, exactly as
 * docs/architecture/testing.md states it: a route may not import
 * `<feature>/postgres.ts` (the SQL adapter), `db/connection.ts` (the connection
 * pool) or a feature gateway adapter (`email/`, `storage/`). A function owned by
 * the `db/` module — the readiness check in `db/health.ts` — is not the pool, so
 * a route may import it and still hold no database handle.
 *
 * `pg-location` exempts type-only imports (`import type { Pool } from 'pg'`).
 * A type-only import is erased at emit, so it creates no runtime coupling with
 * the driver; that is resolved-path precision, not a weakened rule. Every value
 * import, side-effect import (`import 'pg'`), `export ... from`, dynamic
 * `import()` and `require()` form still fails it.
 */

export interface Violation {
  /** Repo-relative, posix-separated file path. */
  readonly file: string;
  readonly line: number;
  readonly rule: RuleId;
  readonly message: string;
}

export interface CheckResult {
  readonly root: string;
  readonly filesChecked: number;
  readonly internalImports: number;
  readonly violations: readonly Violation[];
}

// --------------------------------------------------------------------------
// Workspace discovery
// --------------------------------------------------------------------------

interface WorkspacePackage {
  readonly name: string;
  readonly dir: string;
  readonly relDir: string;
  readonly exports: ReadonlyMap<string, string>;
  readonly main: string | null;
}

const toPosix = (path: string): string => path.split(sep).join('/');

function readJsonFile(path: string): Record<string, unknown> | null {
  const parsed = ts.readConfigFile(path, ts.sys.readFile);
  if (!parsed.config || parsed.error) return null;
  return parsed.config as Record<string, unknown>;
}

function flattenExports(exportsField: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (!exportsField || typeof exportsField !== 'object') return out;
  for (const [key, value] of Object.entries(exportsField as Record<string, unknown>)) {
    const target = exportTarget(value);
    if (target) out.set(key, target);
  }
  return out;
}

function exportTarget(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const condition of ['import', 'default', 'types']) {
      const candidate = record[condition];
      if (typeof candidate === 'string') return candidate;
    }
  }
  return null;
}

function discoverPackages(root: string): WorkspacePackage[] {
  const packagesDir = join(root, 'packages');
  if (!existsSync(packagesDir)) return [];
  const packages: WorkspacePackage[] = [];
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(packagesDir, entry.name);
    const manifestPath = join(dir, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = readJsonFile(manifestPath);
    const name = typeof manifest?.name === 'string' ? manifest.name : null;
    if (!name) continue;
    packages.push({
      name,
      dir,
      relDir: toPosix(relative(root, dir)),
      exports: flattenExports(manifest?.exports),
      main: typeof manifest?.main === 'string' ? manifest.main : null,
    });
  }
  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

// --------------------------------------------------------------------------
// Source discovery and classification
// --------------------------------------------------------------------------

const SOURCE_EXTENSIONS = ['.ts', '.tsx'] as const;
const TEST_FILE = /\.test\.(ts|tsx)$/;
const DECLARATION_FILE = /\.d\.ts$/;

function listSourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'build') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(path));
      continue;
    }
    if (!SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) continue;
    if (DECLARATION_FILE.test(entry.name) || TEST_FILE.test(entry.name)) continue;
    files.push(path);
  }
  return files;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Resolve a specifier base to a real source file (`.js` specifiers map to `.ts`). */
function resolveSourceFile(base: string): string | null {
  if (isFile(base)) return base;
  const stripped = base.replace(/\.(js|jsx|mjs|cjs)$/, '');
  for (const extension of SOURCE_EXTENSIONS) {
    if (isFile(stripped + extension)) return stripped + extension;
  }
  for (const extension of SOURCE_EXTENSIONS) {
    const indexPath = join(stripped, `index${extension}`);
    if (isFile(indexPath)) return indexPath;
  }
  return null;
}

type FileRole = 'route' | 'feature' | 'core' | 'other';

interface FileContext {
  readonly abs: string;
  readonly rel: string;
  readonly packageName: string;
  readonly role: FileRole;
  /** App feature directory name when `role === 'feature'`. */
  readonly feature: string | null;
}

const APP_PACKAGE = '@ticketos/app';

function classify(abs: string, root: string, owner: WorkspacePackage): FileContext {
  const rel = toPosix(relative(root, abs));
  const srcRoot = `${owner.relDir}/src/`;
  if (owner.name !== APP_PACKAGE || !rel.startsWith(srcRoot)) {
    return { abs, rel, packageName: owner.name, role: 'other', feature: null };
  }
  const rest = rel.slice(srcRoot.length);
  if (!rest.includes('/')) {
    return { abs, rel, packageName: owner.name, role: 'core', feature: null };
  }
  const feature = rest.slice(0, rest.indexOf('/'));
  if (feature === 'routes') return { abs, rel, packageName: owner.name, role: 'route', feature: null };
  if (feature === 'db') return { abs, rel, packageName: owner.name, role: 'core', feature: null };
  return { abs, rel, packageName: owner.name, role: 'feature', feature };
}

function inScope(scope: RuleScope, context: FileContext): boolean {
  switch (scope) {
    case 'domain':
      return context.packageName === '@ticketos/domain';
    case 'app-pg':
      return context.packageName === APP_PACKAGE;
    case 'app-feature':
      return context.packageName === APP_PACKAGE && context.role === 'feature';
    case 'app-route':
      return context.packageName === APP_PACKAGE && context.role === 'route';
  }
}

// --------------------------------------------------------------------------
// Import extraction (TypeScript AST, never regex)
// --------------------------------------------------------------------------

interface ImportRecord {
  readonly specifier: string;
  readonly line: number;
  readonly kind: 'static' | 'export' | 'dynamic' | 'require';
  /** True only for an explicit `import type` / `export type` statement. */
  readonly typeOnly: boolean;
}

function scriptKindFor(fileName: string): ts.ScriptKind {
  return fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

export function collectImports(fileName: string): ImportRecord[] {
  const text = readFileSync(fileName, 'utf8');
  const sourceFile = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  const records: ImportRecord[] = [];

  const lineOf = (node: ts.Node): number =>
    sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;

  const push = (
    literal: ts.StringLiteralLike,
    kind: ImportRecord['kind'],
    typeOnly = false,
  ): void => {
    records.push({ specifier: literal.text, line: lineOf(literal), kind, typeOnly });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      // Only an explicit `import type` is erased as a whole: `import { type X }`
      // may still be emitted as a side-effect import, so it stays a runtime edge.
      push(node.moduleSpecifier, 'static', node.importClause?.isTypeOnly === true);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      push(node.moduleSpecifier, 'export', node.isTypeOnly);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      if (ts.isStringLiteralLike(expression)) push(expression, 'require');
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === 'require';
      const argument = node.arguments[0];
      if ((isDynamicImport || isRequire) && argument && ts.isStringLiteralLike(argument)) {
        push(argument, isDynamicImport ? 'dynamic' : 'require');
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return records;
}

// --------------------------------------------------------------------------
// Import resolution (relative, workspace package names, tsconfig aliases)
// --------------------------------------------------------------------------

type ResolvedImport =
  | { readonly kind: 'internal'; readonly abs: string; readonly rel: string; readonly packageName: string }
  | { readonly kind: 'external'; readonly name: string }
  | { readonly kind: 'unresolved'; readonly specifier: string };

interface TsPathMapping {
  readonly baseUrl: string;
  readonly paths: ReadonlyMap<string, readonly string[]>;
}

const tsConfigCache = new Map<string, TsPathMapping | null>();

function tsconfigChain(configPath: string): Array<{ path: string; config: Record<string, unknown> }> {
  const chain: Array<{ path: string; config: Record<string, unknown> }> = [];
  const seen = new Set<string>();
  let current: string | null = configPath;
  while (current && !seen.has(current)) {
    seen.add(current);
    const candidate = existsSync(current) ? current : `${current}.json`;
    if (!existsSync(candidate)) break;
    const config = readJsonFile(candidate);
    if (!config) break;
    chain.unshift({ path: candidate, config });
    const extended = config.extends;
    current = typeof extended === 'string' ? resolve(dirname(candidate), extended) : null;
  }
  return chain;
}

function loadTsPathMappings(packageDir: string): TsPathMapping | null {
  const cached = tsConfigCache.get(packageDir);
  if (cached !== undefined) return cached;
  const mapping = computeTsPathMappings(packageDir);
  tsConfigCache.set(packageDir, mapping);
  return mapping;
}

function computeTsPathMappings(packageDir: string): TsPathMapping | null {
  const chain = tsconfigChain(join(packageDir, 'tsconfig.json'));
  let mapping: TsPathMapping | null = null;
  for (const link of chain) {
    const options = link.config.compilerOptions;
    if (!options || typeof options !== 'object') continue;
    const compilerOptions = options as { baseUrl?: unknown; paths?: unknown };
    if (!compilerOptions.paths || typeof compilerOptions.paths !== 'object') continue;
    const baseUrl =
      typeof compilerOptions.baseUrl === 'string' ? resolve(dirname(link.path), compilerOptions.baseUrl) : dirname(link.path);
    const paths = new Map<string, readonly string[]>();
    for (const [pattern, targets] of Object.entries(compilerOptions.paths as Record<string, unknown>)) {
      if (!Array.isArray(targets)) continue;
      const strings = targets.filter((target): target is string => typeof target === 'string');
      if (strings.length > 0) paths.set(pattern, strings);
    }
    mapping = { baseUrl, paths };
  }
  return mapping;
}

function resolveViaPathAliases(specifier: string, mapping: TsPathMapping | null): string | null {
  if (!mapping) return null;
  const entries = Array.from(mapping.paths.entries()).sort(
    (left, right) => right[0].length - left[0].length,
  );
  for (const [pattern, targets] of entries) {
    const captured = matchPathPattern(pattern, specifier);
    if (captured === null) continue;
    for (const target of targets) {
      const substituted = target.replace('*', captured);
      const file = resolveSourceFile(resolve(mapping.baseUrl, substituted));
      if (file) return file;
    }
  }
  return null;
}

function matchPathPattern(pattern: string, specifier: string): string | null {
  if (!pattern.includes('*')) return pattern === specifier ? '' : null;
  const star = pattern.indexOf('*');
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return null;
  return specifier.slice(prefix.length, specifier.length - suffix.length);
}

function distTargetToSource(packageDir: string, target: string): string | null {
  const normalized = target.startsWith('./') ? target.slice(2) : target;
  const match = /^(dist|build)\/(.*)$/.exec(normalized);
  if (!match) return null;
  const sourceRelative = match[2]!.replace(/\.(js|jsx|mjs|cjs)$/, '');
  return resolveSourceFile(join(packageDir, 'src', sourceRelative));
}

function findWorkspacePackage(specifier: string, packages: readonly WorkspacePackage[]): {
  owner: WorkspacePackage;
  subpath: string;
  rest: string;
} | null {
  const candidates = packages.filter(
    (candidate) => specifier === candidate.name || specifier.startsWith(`${candidate.name}/`),
  );
  const owner = candidates.sort((left, right) => right.name.length - left.name.length)[0];
  if (!owner) return null;
  const rest = specifier === owner.name ? '' : specifier.slice(owner.name.length + 1);
  return { owner, subpath: rest === '' ? '.' : `./${rest}`, rest };
}

function resolveWorkspaceImport(
  specifier: string,
  packages: readonly WorkspacePackage[],
): { abs: string; packageName: string } | null {
  const match = findWorkspacePackage(specifier, packages);
  if (!match) return null;
  const target = match.owner.exports.get(match.subpath) ?? (match.subpath === '.' ? match.owner.main : null);
  const fromExports = target ? distTargetToSource(match.owner.dir, target) : null;
  const fromSubpath =
    resolveSourceFile(join(match.owner.dir, 'src', match.rest || 'index')) ??
    resolveSourceFile(join(match.owner.dir, 'src', match.rest));
  const abs = fromExports ?? fromSubpath;
  if (!abs) return null;
  return { abs, packageName: match.owner.name };
}

function packageOf(abs: string, root: string, packages: readonly WorkspacePackage[]): string | null {
  const rel = toPosix(relative(root, abs));
  const owner = packages.find((candidate) => rel.startsWith(`${candidate.relDir}/`));
  return owner?.name ?? null;
}

function resolveImport(
  context: FileContext,
  specifier: string,
  packages: readonly WorkspacePackage[],
  root: string,
): ResolvedImport {
  if (specifier.startsWith('.') || specifier.startsWith('/')) {
    const file = resolveSourceFile(resolve(dirname(context.abs), specifier));
    if (!file) return { kind: 'unresolved', specifier };
    return { kind: 'internal', abs: file, rel: toPosix(relative(root, file)), packageName: packageOf(file, root, packages) ?? '' };
  }

  const workspace = resolveWorkspaceImport(specifier, packages);
  if (workspace) {
    return {
      kind: 'internal',
      abs: workspace.abs,
      rel: toPosix(relative(root, workspace.abs)),
      packageName: workspace.packageName,
    };
  }

  const owner = packages.find((candidate) => context.rel.startsWith(`${candidate.relDir}/`));
  const aliasFile = resolveViaPathAliases(specifier, owner ? loadTsPathMappings(owner.dir) : null);
  if (aliasFile) {
    return { kind: 'internal', abs: aliasFile, rel: toPosix(relative(root, aliasFile)), packageName: packageOf(aliasFile, root, packages) ?? '' };
  }

  if (specifier.startsWith('@ticketos/')) return { kind: 'unresolved', specifier };
  return { kind: 'external', name: specifier };
}

// --------------------------------------------------------------------------
// Rule evaluation
// --------------------------------------------------------------------------

function describeImport(record: ImportRecord): string {
  switch (record.kind) {
    case 'dynamic':
      return `dynamic import() of "${record.specifier}"`;
    case 'require':
      return `require("${record.specifier}")`;
    case 'export':
      return `re-export from "${record.specifier}"`;
    default:
      return `"${record.specifier}"`;
  }
}

function featureOfPath(rel: string, relDir: string): string | null {
  const srcRoot = `${relDir}/src/`;
  if (!rel.startsWith(srcRoot)) return null;
  const rest = rel.slice(srcRoot.length);
  const slash = rest.indexOf('/');
  if (slash === -1) return null;
  const area = rest.slice(0, slash);
  if (area === 'routes' || area === 'db') return null;
  return area;
}

interface InternalEdge {
  readonly from: string;
  readonly to: string;
  readonly line: number;
}

function violationFor(
  context: FileContext,
  owner: WorkspacePackage,
  record: ImportRecord,
  resolved: Exclude<ResolvedImport, { readonly kind: 'unresolved' }>,
  rule: RuleDefinition,
): Violation | null {
  const reject = (message: string): Violation => ({ file: context.rel, line: record.line, rule: rule.id, message });

  if (resolved.kind === 'external') {
    if (!rule.denyExternal.some((pattern) => pattern.test(resolved.name))) return null;
    return reject(`forbidden import ${describeImport(record)} — ${rule.rationale}`);
  }

  if (rule.allowedTargetPackages.length > 0 && !rule.allowedTargetPackages.includes(resolved.packageName)) {
    return reject(`forbidden import ${describeImport(record)} from "${resolved.packageName}" — ${rule.rationale}`);
  }

  if (rule.denyTarget.some((pattern) => pattern.test(resolved.rel))) {
    return reject(`forbidden import ${describeImport(record)} -> ${resolved.rel} — ${rule.rationale}`);
  }

  const targetFeature = featureOfPath(resolved.rel, owner.relDir);
  const sameOwnedFeature = context.role === 'feature' && context.feature !== null && targetFeature === context.feature;
  if (!sameOwnedFeature && rule.denyTargetOtherFeature.some((pattern) => pattern.test(resolved.rel))) {
    return reject(`forbidden cross-feature import ${describeImport(record)} -> ${resolved.rel} — ${rule.rationale}`);
  }

  return null;
}

function evaluateImports(
  context: FileContext,
  owner: WorkspacePackage,
  imports: readonly ImportRecord[],
  packages: readonly WorkspacePackage[],
  root: string,
): { violations: Violation[]; edges: InternalEdge[] } {
  const violations: Violation[] = [];
  const edges: InternalEdge[] = [];

  for (const record of imports) {
    const resolved = resolveImport(context, record.specifier, packages, root);

    if (resolved.kind === 'unresolved') {
      violations.push({
        file: context.rel,
        line: record.line,
        rule: 'unresolved-import',
        message: `cannot resolve import of "${record.specifier}" (check the path, alias and package exports)`,
      });
      continue;
    }

    if (resolved.kind === 'internal') {
      edges.push({ from: context.rel, to: resolved.rel, line: record.line });
    }

    for (const rule of RULES) {
      if (!inScope(rule.scope, context)) continue;
      if (rule.allowImporter.some((pattern) => pattern.test(context.rel))) continue;
      // Erased at emit, so a rule that declares the exemption cannot be
      // violated at runtime by this import.
      if (record.typeOnly && rule.typeOnlyExempt) continue;
      const violation = violationFor(context, owner, record, resolved, rule);
      if (violation) violations.push(violation);
    }
  }

  return { violations, edges };
}

// --------------------------------------------------------------------------
// Graph rules: cycles and unresolved imports (S1)
// --------------------------------------------------------------------------

function canonicalCycleKey(cycle: readonly string[]): string {
  const nodes = cycle.slice(0, -1);
  if (nodes.length === 0) return '';
  const rotations = nodes.map((_, index) => nodes.slice(index).concat(nodes.slice(0, index)).join(' -> '));
  return rotations.sort((left, right) => left.localeCompare(right))[0]!;
}

function findCycles(edges: readonly InternalEdge[], files: readonly string[]): Violation[] {
  const adjacency = new Map<string, InternalEdge[]>();
  for (const edge of edges) {
    if (!files.includes(edge.to)) continue;
    const list = adjacency.get(edge.from) ?? [];
    list.push(edge);
    adjacency.set(edge.from, list);
  }

  const visited = new Set<string>();
  const stack: string[] = [];
  const onStack = new Map<string, number>();
  const seen = new Set<string>();
  const violations: Violation[] = [];

  const visit = (node: string): void => {
    visited.add(node);
    onStack.set(node, stack.length);
    stack.push(node);
    const outgoing = (adjacency.get(node) ?? []).slice().sort((left, right) => left.to.localeCompare(right.to));
    for (const edge of outgoing) {
      if (!visited.has(edge.to)) {
        visit(edge.to);
        continue;
      }
      const start = onStack.get(edge.to);
      if (start === undefined) continue;
      const cycle = stack.slice(start).concat(edge.to);
      const key = canonicalCycleKey(cycle);
      if (seen.has(key)) continue;
      seen.add(key);
      violations.push({
        file: edge.from,
        line: edge.line,
        rule: 'import-cycle',
        message: `import cycle: ${cycle.join(' -> ')}`,
      });
    }
    stack.pop();
    onStack.delete(node);
  };

  for (const file of [...files].sort((left, right) => left.localeCompare(right))) {
    if (!visited.has(file)) visit(file);
  }
  return violations;
}

// --------------------------------------------------------------------------
// Entry point
// --------------------------------------------------------------------------

export function checkArchitecture(root: string): CheckResult {
  const packages = discoverPackages(root);
  const files: FileContext[] = [];
  for (const owner of packages) {
    for (const abs of listSourceFiles(join(owner.dir, 'src'))) {
      files.push(classify(abs, root, owner));
    }
  }

  const violations: Violation[] = [];
  const edges: InternalEdge[] = [];
  let internalImports = 0;

  for (const context of files) {
    const owner = packages.find((candidate) => context.rel.startsWith(`${candidate.relDir}/`));
    if (!owner) continue;
    const imports = collectImports(context.abs);
    const result = evaluateImports(context, owner, imports, packages, root);
    violations.push(...result.violations);
    edges.push(...result.edges);
    internalImports += result.edges.length;
  }

  violations.push(...findCycles(edges, files.map((context) => context.rel)));

  const unique = new Map<string, Violation>();
  for (const violation of violations) {
    unique.set(`${violation.file}:${violation.line}:${violation.rule}:${violation.message}`, violation);
  }

  const sorted = Array.from(unique.values()).sort(
    (left, right) =>
      left.file.localeCompare(right.file) || left.line - right.line || left.rule.localeCompare(right.rule),
  );

  return { root, filesChecked: files.length, internalImports, violations: sorted };
}

export function formatViolation(violation: Violation): string {
  return `${violation.file}:${violation.line} [${violation.rule}] ${violation.message}`;
}

export function runCheck(root: string, write: (line: string) => void = (line) => console.log(line)): number {
  const result = checkArchitecture(root);
  for (const violation of result.violations) write(formatViolation(violation));
  if (result.violations.length > 0) {
    write('');
    write(
      `Architecture check failed: ${result.violations.length} violation(s) in ${result.filesChecked} source files.`,
    );
    return 1;
  }
  write(
    `Architecture check passed: ${result.filesChecked} source files, ${result.internalImports} internal imports, 0 violations.`,
  );
  return 0;
}

// The CLI runs only when this file is the process entry point (tsx, node), never
// when a test imports `checkArchitecture`/`runCheck` from it.
const ENTRY_ARGV = process.argv[1] ?? '';

function invokedDirectly(): boolean {
  return /check-architecture\.(ts|mts|js|mjs)$/.test(ENTRY_ARGV);
}

if (invokedDirectly()) {
  const scriptRoot = resolve(dirname(ENTRY_ARGV), '..');
  const requestedRoot = process.argv[2];
  // The optional root argument is repo-relative, so it also works when the CLI runs
  // through `pnpm --filter @ticketos/app exec` (cwd = packages/app).
  process.exitCode = runCheck(requestedRoot ? resolve(scriptRoot, requestedRoot) : scriptRoot);
}
