/**
 * 테스트 전용 — supabase-js 체인을 흉내 내는 최소 가짜 클라이언트.
 * 호출(테이블·연산·값·필터)을 기록하고, handler 가 돌려준 { data, error } 로 resolve 한다.
 */
export type FakeCall = {
  table: string;
  op: "select" | "insert" | "update" | "upsert" | "delete";
  values?: unknown;
  filters: Array<[string, string, unknown]>;
  selectCols?: string;
  returning?: string;
  terminal?: "maybeSingle" | "single" | "many";
};

export type FakeResult = { data: unknown; error: unknown };
export type FakeHandler = (call: FakeCall) => FakeResult;

export function createFakeSupabase(handler: FakeHandler) {
  const calls: FakeCall[] = [];
  const from = (table: string) => {
    const call: FakeCall = { table, op: "select", filters: [] };
    const resolve = (terminal: FakeCall["terminal"]) => {
      call.terminal = terminal;
      calls.push(call);
      return Promise.resolve(handler(call));
    };
    const b: Record<string, unknown> = {};
    const chain = (fn: (...a: unknown[]) => void) => (...a: unknown[]) => {
      fn(...a);
      return b;
    };
    Object.assign(b, {
      select: chain((cols) => {
        if (call.op === "select") call.selectCols = String(cols ?? "*");
        else call.returning = String(cols ?? "*");
      }),
      insert: chain((v) => {
        call.op = "insert";
        call.values = v;
      }),
      update: chain((v) => {
        call.op = "update";
        call.values = v;
      }),
      upsert: chain((v) => {
        call.op = "upsert";
        call.values = v;
      }),
      delete: chain(() => {
        call.op = "delete";
      }),
      eq: chain((c, v) => call.filters.push(["eq", String(c), v])),
      neq: chain((c, v) => call.filters.push(["neq", String(c), v])),
      is: chain((c, v) => call.filters.push(["is", String(c), v])),
      in: chain((c, v) => call.filters.push(["in", String(c), v])),
      or: chain((v) => call.filters.push(["or", "", v])),
      gte: chain((c, v) => call.filters.push(["gte", String(c), v])),
      order: chain(() => undefined),
      limit: chain(() => undefined),
      maybeSingle: () => resolve("maybeSingle"),
      single: () => resolve("single"),
      then: (onOk: (v: FakeResult) => unknown, onErr?: (e: unknown) => unknown) =>
        resolve("many").then(onOk, onErr),
    });
    return b;
  };
  return { sb: { from, rpc: () => Promise.resolve({ data: null, error: null }) }, calls };
}

export function filterValue(call: FakeCall, kind: string, column: string): unknown {
  const hit = call.filters.find(([k, c]) => k === kind && c === column);
  return hit ? hit[2] : undefined;
}
