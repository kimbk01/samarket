/**
 * R7 (delivery_b) 계약 테스트용 가짜 Supabase — `from(table)` 체인 호출을 기록하고 표 데이터에 eq/in/is/range 를 적용한다.
 * `rpc(name, args)` 는 호출 인자를 기록하고 주어진 처리기로 응답한다.
 */
export type FakeCall = { table: string; ops: Array<[string, unknown[]]> };
export type FakeRpcCall = { name: string; args: Record<string, unknown> };

export function makeFakeSupabase(
  tables: Record<string, Record<string, unknown>[]>,
  rpc: (name: string, args: Record<string, unknown>) => { data: unknown; error: { message: string } | null } = () => ({
    data: null,
    error: { message: "no rpc" },
  })
) {
  const calls: FakeCall[] = [];
  const rpcCalls: FakeRpcCall[] = [];

  function rowsFor(call: FakeCall): Record<string, unknown>[] {
    let rows = [...(tables[call.table] ?? [])];
    for (const [op, args] of call.ops) {
      const col = String(args[0]);
      if (op === "eq") rows = rows.filter((r) => r[col] === args[1]);
      else if (op === "in") rows = rows.filter((r) => (args[1] as unknown[]).includes(r[col]));
      else if (op === "is") rows = rows.filter((r) => (r[col] ?? null) === args[1]);
    }
    const range = call.ops.find(([op]) => op === "range");
    if (range) rows = rows.slice(Number(range[1][0]), Number(range[1][1]) + 1);
    return rows;
  }

  const sb = {
    from(table: string) {
      const call: FakeCall = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop) {
            if (prop === "then") {
              return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
                const data = rowsFor(call);
                return Promise.resolve({ data, error: null, count: data.length }).then(resolve, reject);
              };
            }
            if (prop === "maybeSingle" || prop === "single") {
              return () => Promise.resolve({ data: rowsFor(call)[0] ?? null, error: null });
            }
            return (...args: unknown[]) => {
              call.ops.push([String(prop), args]);
              return builder;
            };
          },
        }
      );
      return builder;
    },
    rpc(name: string, args: Record<string, unknown> = {}) {
      rpcCalls.push({ name, args });
      return Promise.resolve(rpc(name, args));
    },
  };

  /** `.limit(n)` 호출 목록 (표 이름 포함) — 고정 상한 회귀 감지. */
  const limitCalls = () =>
    calls.flatMap((c) => c.ops.filter(([op]) => op === "limit").map(([, a]) => ({ table: c.table, n: Number(a[0]) })));

  return { sb, calls, rpcCalls, limitCalls };
}
