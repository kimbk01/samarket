/** Types for lib.mjs (tsconfig.test.json excludes scripts/ — composite project needs a declaration). */
export type SqlStatement = { text: string; bodies: string[] };
export type SchemaState = { tables: Map<string, Set<string>>; functions: Map<string, Set<string>> };
export type Manifest = { tables: Record<string, string[]>; functions: string[] };
export type ProdSnapshot = { captured_at?: string; columns: Record<string, string[]>; functions: string[] };
export type Allowlist = { entries?: { object: string; reason: string }[] };
export type CompareResult = {
  missingTables: string[];
  missingColumns: string[];
  missingFunctions: string[];
  allowedMissing: { object: string; reason: string | undefined }[];
  blocking: string[];
  extra: { tables: string[]; columns: string[]; functions: string[] };
  counts: {
    manifestTables: number;
    manifestColumns: number;
    manifestFunctions: number;
    prodTables: number;
    prodFunctions: number;
  };
  ok: boolean;
};

export function splitStatements(sql: string): SqlStatement[];
export function normIdent(raw: string): string;
export function splitTopLevel(s: string, sep?: string): string[];
export function normalizeArgSignature(args: string): string;
export function emptyState(): SchemaState;
export function applyMigrationSql(state: SchemaState, sql: string): SchemaState;
export function buildManifest(files: { name: string; sql: string }[]): Manifest;
export function unwrapSnapshot(raw: unknown): ProdSnapshot;
export function compareSchema(manifest: Manifest, snapshot: ProdSnapshot, allowlist?: Allowlist): CompareResult;
