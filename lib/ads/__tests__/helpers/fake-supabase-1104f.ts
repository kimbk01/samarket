/**
 * 광고 ② 구현 F 시험용 메모리 Supabase — select/insert/update/delete · eq/in/is/not/or(무시)/order/limit · maybeSingle/single · rpc.
 * `or()` 는 무시한다(기간 조건은 서버 코드의 다른 판정으로 거른다는 것을 시험이 직접 본다).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type Row = Record<string, unknown>;

export function makeFakeSb(seed: Record<string, Row[]> = {}, opts: { rpc?: (fn: string, args: Row) => unknown; failUpdate?: (table: string, patch: Row) => string | null } = {}) {
  const tables: Record<string, Row[]> = Object.fromEntries(Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]));
  const calls: { table: string; mode: string; payload?: unknown }[] = [];
  const rpcCalls: { fn: string; args: Row }[] = [];
  let seq = 0;
  function from(table: string) {
    const list = () => tables[table] ?? (tables[table] = []);
    const filters: Array<(r: Row) => boolean> = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let limitN: number | null = null;
    const run = async (single: boolean) => {
      calls.push({ table, mode, payload });
      if (mode === "insert") {
        const arr = (Array.isArray(payload) ? payload : [payload as Row]).map((r) => ({ id: `${table}-${++seq}`, ...r }));
        list().push(...arr);
        return { data: single ? arr[0] : arr, error: null };
      }
      const hit = list().filter((r) => filters.every((f) => f(r)));
      if (mode === "update") {
        const err = opts.failUpdate?.(table, payload as Row);
        if (err) return { data: null, error: { message: err } };
        for (const r of hit) Object.assign(r, payload);
        return { data: single ? (hit[0] ?? null) : hit, error: null };
      }
      if (mode === "delete") {
        tables[table] = list().filter((r) => !hit.includes(r));
        return { data: null, error: null };
      }
      const out = limitN != null ? hit.slice(0, limitN) : hit;
      return { data: single ? (out[0] ?? null) : out, error: null };
    };
    const api: Record<string, unknown> = {
      select: () => api,
      insert: (p: Row | Row[]) => ((mode = "insert"), (payload = p), api),
      update: (p: Row) => ((mode = "update"), (payload = p), api),
      delete: () => ((mode = "delete"), api),
      eq: (c: string, v: unknown) => (filters.push((r) => String(r[c]) === String(v)), api),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.map(String).includes(String(r[c]))), api),
      is: (c: string, v: unknown) => (filters.push((r) => (v === null ? r[c] == null : r[c] === v)), api),
      not: (c: string, op: string, v: unknown) => (filters.push((r) => !(op === "is" && v === null ? r[c] == null : r[c] === v)), api),
      or: () => api,
      order: () => api,
      limit: (n: number) => ((limitN = n), api),
      maybeSingle: () => run(true),
      single: () => run(true),
    };
    (api as { then?: unknown }).then = (res: (v: unknown) => void, rej?: (e: unknown) => void) => run(false).then(res, rej);
    return api;
  }
  const sb = {
    from,
    rpc: async (fn: string, args: Row) => {
      rpcCalls.push({ fn, args });
      const data = opts.rpc ? opts.rpc(fn, args) : { ok: true };
      return { data, error: null };
    },
  } as unknown as SupabaseClient;
  return { sb, tables, calls, rpcCalls };
}
