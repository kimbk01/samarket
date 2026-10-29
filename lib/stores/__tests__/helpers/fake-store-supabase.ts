/**
 * 라우트 테스트용 최소 PostgREST 빌더 페이크 — 호출을 기록하고 handler 가 결과를 정한다.
 */
export type FakeCall = {
  table: string;
  op: "select" | "update" | "insert" | "delete";
  select: string | null;
  patch: Record<string, unknown> | null;
  filters: Array<[string, string, unknown]>;
  single: boolean;
};

export type FakeResult = { data: unknown; error: { message: string } | null };

export function createFakeStoreSupabase(
  handler: (call: FakeCall) => FakeResult,
  /** 선택 — `sb.rpc(fn, args)` 결과 (기본: data null) */
  rpcHandler?: (fn: string, args: unknown) => FakeResult
) {
  const calls: FakeCall[] = [];
  const from = (table: string) => {
    const call: FakeCall = { table, op: "select", select: null, patch: null, filters: [], single: false };
    const builder: Record<string, unknown> = {};
    const chain = (fn: (...a: unknown[]) => void) => (...a: unknown[]) => {
      fn(...a);
      return builder;
    };
    builder.select = chain((cols) => {
      call.select = String(cols ?? "*");
    });
    builder.update = chain((patch) => {
      call.op = "update";
      call.patch = patch as Record<string, unknown>;
    });
    builder.insert = chain((patch) => {
      call.op = "insert";
      call.patch = patch as Record<string, unknown>;
    });
    builder.delete = chain(() => {
      call.op = "delete";
    });
    for (const m of ["eq", "neq", "in", "not", "gte", "lte", "order", "limit", "or", "is"]) {
      builder[m] = chain((col, val) => {
        call.filters.push([m, String(col), val]);
      });
    }
    builder.maybeSingle = chain(() => {
      call.single = true;
    });
    builder.single = builder.maybeSingle;
    builder.then = (resolve: (r: FakeResult) => unknown, reject?: (e: unknown) => unknown) => {
      calls.push({ ...call, filters: [...call.filters] });
      try {
        return Promise.resolve(handler(call)).then(resolve, reject);
      } catch (e) {
        return reject ? reject(e) : Promise.reject(e);
      }
    };
    return builder;
  };
  const rpc = async (fn: string, args?: unknown): Promise<FakeResult> =>
    rpcHandler ? rpcHandler(fn, args) : { data: null, error: null };
  return { sb: { from, rpc }, calls };
}

export function filterValue(call: FakeCall, col: string): unknown {
  return call.filters.find(([m, c]) => m === "eq" && c === col)?.[2];
}
