/**
 * Minimal chainable Supabase fake for WP1 campaign CMS tests. Every awaited query is recorded
 * (`table`, `op`, `payload`, `filters`) and answered by `respond(call)`.
 */

export type FakeCall = {
  table: string;
  op: "select" | "insert" | "update" | "delete" | "upsert";
  payload: unknown;
  filters: Array<[string, string, unknown]>;
  single: boolean;
  head: boolean;
};

export type FakeResponse = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null };

export function createFakeSupabase(respond: (call: FakeCall) => FakeResponse | undefined) {
  const calls: FakeCall[] = [];

  function builder(table: string) {
    const call: FakeCall = { table, op: "select", payload: null, filters: [], single: false, head: false };
    const run = () => {
      calls.push(call);
      const r = respond(call) ?? {};
      return { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null };
    };
    const chain: Record<string, unknown> = {};
    const filter =
      (kind: string) =>
      (col: string, ...rest: unknown[]) => {
        call.filters.push([kind, col, rest.length === 1 ? rest[0] : rest]);
        return chain;
      };
    Object.assign(chain, {
      select: (_cols?: string, opts?: { head?: boolean }) => {
        if (call.op === "select") call.op = "select";
        if (opts?.head) call.head = true;
        return chain;
      },
      insert: (payload: unknown) => {
        call.op = "insert";
        call.payload = payload;
        return chain;
      },
      update: (payload: unknown) => {
        call.op = "update";
        call.payload = payload;
        return chain;
      },
      upsert: (payload: unknown) => {
        call.op = "upsert";
        call.payload = payload;
        return chain;
      },
      delete: () => {
        call.op = "delete";
        return chain;
      },
      eq: filter("eq"),
      neq: filter("neq"),
      in: filter("in"),
      is: filter("is"),
      not: filter("not"),
      lt: filter("lt"),
      ilike: filter("ilike"),
      order: () => chain,
      limit: () => chain,
      range: () => chain,
      maybeSingle: () => {
        call.single = true;
        return Promise.resolve(run());
      },
      single: () => {
        call.single = true;
        return Promise.resolve(run());
      },
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(onFulfilled, onRejected),
    });
    return chain;
  }

  const svc = {
    from: (table: string) => builder(table),
    rpc: async () => ({ data: null, error: null }),
  };
  return { svc, calls };
}

export function hasFilter(call: FakeCall, kind: string, col: string, value?: unknown): boolean {
  return call.filters.some(
    ([k, c, v]) => k === kind && c === col && (value === undefined || JSON.stringify(v) === JSON.stringify(value))
  );
}
