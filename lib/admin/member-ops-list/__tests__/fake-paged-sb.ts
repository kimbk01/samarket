/**
 * 목록 API 계약 테스트용 가짜 Supabase 클라이언트 (R7 목록 표준).
 * `from(table)` 이후 모든 체인 호출(select·eq·order·range·limit…)을 기록하고,
 * await 하면 `resolve(call)` 결과 `{ data, error, count }` 를 돌려준다.
 */

export type FakeSbCall = { table: string; ops: Array<[string, unknown[]]> };
export type FakeSbResult = { data?: unknown; error?: { message: string } | null; count?: number | null };

export function createFakePagedSb(resolve: (call: FakeSbCall) => FakeSbResult) {
  const calls: FakeSbCall[] = [];
  const chain = (call: FakeSbCall): unknown => {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            const r = resolve(call);
            const out = { data: r.data ?? null, error: r.error ?? null, count: r.count ?? null };
            return (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(out).then(ok, ko);
          }
          return (...args: unknown[]) => {
            call.ops.push([String(prop), args]);
            return proxy;
          };
        },
      }
    );
    return proxy;
  };
  const sb = {
    from(table: string) {
      const call: FakeSbCall = { table, ops: [] };
      calls.push(call);
      return chain(call);
    },
  };
  return { sb, calls };
}

export function fakeOps(call: FakeSbCall | undefined, name: string): unknown[][] {
  return (call?.ops ?? []).filter(([n]) => n === name).map(([, a]) => a);
}

/** `select(cols, { count: "exact" })` 로 정확한 건수를 요청했는지. */
export function fakeCountExact(call: FakeSbCall | undefined): boolean {
  return fakeOps(call, "select").some((a) => (a[1] as { count?: string } | undefined)?.count === "exact");
}
