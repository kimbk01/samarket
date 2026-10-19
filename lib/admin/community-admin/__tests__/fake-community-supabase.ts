/**
 * 테스트 전용 — supabase-js 체인을 흉내 내는 가짜 클라이언트 (커뮤니티 Admin 라우트 테스트).
 * 호출(테이블·연산·값·필터)과 rpc 호출을 기록하고, handler 가 돌려준 { data, error } 로 resolve 한다.
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
export type FakeRpcCall = { fn: string; args: Record<string, unknown> };
export type FakeResult = { data: unknown; error: unknown; count?: number };

export function createFakeCommunitySupabase(
  handler: (call: FakeCall) => FakeResult,
  rpcHandler: (call: FakeRpcCall) => FakeResult = () => ({ data: null, error: null })
) {
  const calls: FakeCall[] = [];
  const rpcCalls: FakeRpcCall[] = [];
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
    const filter = (kind: string) => chain((c, v) => call.filters.push([kind, String(c), v]));
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
      delete: chain(() => {
        call.op = "delete";
      }),
      eq: filter("eq"),
      neq: filter("neq"),
      is: filter("is"),
      in: filter("in"),
      gt: filter("gt"),
      gte: filter("gte"),
      lt: filter("lt"),
      lte: filter("lte"),
      not: chain((c, op, v) => call.filters.push(["not", String(c), [op, v]])),
      or: chain((v) => call.filters.push(["or", "", v])),
      order: chain(() => undefined),
      limit: chain(() => undefined),
      range: chain(() => undefined),
      maybeSingle: () => resolve("maybeSingle"),
      single: () => resolve("single"),
      then: (onOk: (v: FakeResult) => unknown, onErr?: (e: unknown) => unknown) =>
        resolve("many").then(onOk, onErr),
    });
    return b;
  };
  const rpc = (fn: string, args: Record<string, unknown>) => {
    const c = { fn, args };
    rpcCalls.push(c);
    return Promise.resolve(rpcHandler(c));
  };
  return { sb: { from, rpc }, calls, rpcCalls };
}

export function filterValue(call: FakeCall, kind: string, column: string): unknown {
  const hit = call.filters.find(([k, c]) => k === kind && c === column);
  return hit ? hit[2] : undefined;
}

export function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
