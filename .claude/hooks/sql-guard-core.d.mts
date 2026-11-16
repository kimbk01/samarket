export type SqlGuardSnapshot = { fetchedAt: number; tables: Record<string, string[]> };
export type SqlGuardProblem = { kind: "table" | "column"; name: string; message: string };
export type SqlGuardResult = { decision: "allow" | "deny" | "ask"; reason?: string; problems?: SqlGuardProblem[] };
export function analyzeSql(sql: string, snapshot: SqlGuardSnapshot | null): Promise<SqlGuardResult>;
export function indexSchema(snapshot: SqlGuardSnapshot | null): { tables: Map<string, Set<string>>; schemas: Set<string> };
