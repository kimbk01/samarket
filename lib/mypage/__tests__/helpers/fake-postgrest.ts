/**
 * 테스트 전용 메모리 PostgREST 흉내 — select/eq/neq/not/is/in/lt/ilike/order/limit/or(keyset)/delete/count(head) 만.
 * `.or()` 는 `mypageKeysetOrFilter` 가 만드는 `col.lt."ts",and(col.eq."ts",id.lt."id")` 형태만 해석한다.
 */
type Row = Record<string, unknown>;

export type FakeDb = Record<string, Row[]>;

export type FakeCall = { table: string; op: string; args: unknown[] };

function cmp(a: unknown, b: unknown): number {
  const as = String(a ?? "");
  const bs = String(b ?? "");
  return as < bs ? -1 : as > bs ? 1 : 0;
}

export function createFakeSupabase(
  db: FakeDb,
  opts?: {
    failTables?: string[];
    /** 테이블별 오류 객체 지정(테이블 없음 등) — `failTables` 보다 우선 */
    failErrors?: Record<string, { message: string; code?: string }>;
    calls?: FakeCall[];
  }
) {
  const calls = opts?.calls ?? [];
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    const orders: Array<{ col: string; asc: boolean }> = [];
    let limit: number | null = null;
    let mode: "select" | "delete" = "select";
    let head = false;
    let countMode = false;
    const q: Record<string, unknown> = {};
    const rec = (op: string, args: unknown[]) => calls.push({ table, op, args });
    q.select = (...args: unknown[]) => {
      rec("select", args);
      const o = args[1] as { count?: string; head?: boolean } | undefined;
      if (o?.count) countMode = true;
      if (o?.head) head = true;
      return q;
    };
    q.delete = (...args: unknown[]) => {
      rec("delete", args);
      mode = "delete";
      return q;
    };
    q.eq = (col: string, v: unknown) => {
      rec("eq", [col, v]);
      filters.push((r) => r[col] === v);
      return q;
    };
    /** PostgREST `neq`: NULL 은 비교 불가 → 제외 */
    q.neq = (col: string, v: unknown) => {
      rec("neq", [col, v]);
      filters.push((r) => r[col] != null && r[col] !== v);
      return q;
    };
    q.not = (col: string, op: string, v: unknown) => {
      rec("not", [col, op, v]);
      filters.push((r) => !(op === "is" && r[col] === v));
      return q;
    };
    q.is = (col: string, v: unknown) => {
      rec("is", [col, v]);
      filters.push((r) => (v === null ? r[col] == null : r[col] === v));
      return q;
    };
    q.lt = (col: string, v: unknown) => {
      rec("lt", [col, v]);
      filters.push((r) => cmp(r[col], v) < 0);
      return q;
    };
    q.ilike = (col: string, pattern: string) => {
      rec("ilike", [col, pattern]);
      const body = pattern.replace(/^%|%$/g, "").replace(/\\([\\%_])/g, "$1").toLowerCase();
      filters.push((r) => String(r[col] ?? "").toLowerCase().includes(body));
      return q;
    };
    q.in = (col: string, vs: unknown[]) => {
      rec("in", [col, vs]);
      filters.push((r) => vs.includes(r[col]));
      return q;
    };
    q.order = (col: string, o?: { ascending?: boolean }) => {
      rec("order", [col, o]);
      orders.push({ col, asc: o?.ascending !== false });
      return q;
    };
    q.limit = (n: number) => {
      rec("limit", [n]);
      limit = n;
      return q;
    };
    q.or = (expr: string) => {
      rec("or", [expr]);
      const m = /^([a-z_]+)\.lt\."([^"]+)",and\(\1\.eq\."([^"]+)",([a-z_]+)\.lt\."([^"]+)"\)$/.exec(expr);
      if (!m) throw new Error(`fake or() unsupported: ${expr}`);
      const [, tsCol, ts, , idCol, id] = m;
      filters.push((r) => cmp(r[tsCol!], ts) < 0 || (cmp(r[tsCol!], ts) === 0 && cmp(r[idCol!], id) < 0));
      return q;
    };
    q.maybeSingle = () => run().then((res) => ({ data: (res.data as Row[] | null)?.[0] ?? null, error: res.error }));
    const run = async () => {
      const failError = opts?.failErrors?.[table];
      if (failError) return { data: null, error: failError, count: null };
      if (opts?.failTables?.includes(table)) return { data: null, error: { message: `${table} boom` }, count: null };
      const all = db[table] ?? [];
      let rows = all.filter((r) => filters.every((f) => f(r)));
      if (mode === "delete") {
        db[table] = all.filter((r) => !rows.includes(r));
        return { data: null, error: null, count: null };
      }
      for (const o of [...orders].reverse()) {
        rows = [...rows].sort((a, b) => (o.asc ? cmp(a[o.col], b[o.col]) : -cmp(a[o.col], b[o.col])));
      }
      const count = rows.length;
      if (limit != null) rows = rows.slice(0, limit);
      return { data: head ? null : rows.map((r) => ({ ...r })), error: null, count: countMode ? count : null };
    };
    q.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => run().then(resolve, reject);
    return q;
  };
  return { from, calls } as unknown as { from: (t: string) => never; calls: FakeCall[] };
}
