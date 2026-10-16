/**
 * Test-only PostgREST emulator — real `@supabase/supabase-js` query builder → in-memory rows.
 *
 * Evaluates the URL the production code actually builds (filters, `or`/`and` trees, `not.`,
 * order, offset/limit) with SQL three-valued NULL logic, so location partitions are checked
 * against the exact filter strings sent to PostgREST.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { computeSearchText } from "@/lib/trade/marketplace/search-candidate-sql";

export type FakeRow = Record<string, unknown>;
type Tri = boolean | null;

function splitTopLevel(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"' && input[i - 1] !== "\\") quoted = !quoted;
    if (!quoted) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        out.push(cur);
        cur = "";
        continue;
      }
    }
    cur += ch;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

function unquote(v: string): string {
  const t = v.trim();
  return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

function columnValue(row: FakeRow, column: string): unknown {
  /** Generated column on posts (migration 20270506120000) — derived when the fixture lacks it. */
  if (column === "search_text" && !("search_text" in row) && "title" in row) {
    return computeSearchText(row);
  }
  const textPath = column.split("->>");
  if (textPath.length === 2) {
    const base = row[textPath[0]] as Record<string, unknown> | null | undefined;
    const v = base && typeof base === "object" ? base[textPath[1]] : undefined;
    return v == null ? null : String(v);
  }
  const v = row[column];
  return v === undefined ? null : v;
}

function cmp(a: unknown, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (typeof a === "number" || (a !== "" && Number.isFinite(na) && Number.isFinite(nb))) {
    return na - nb;
  }
  return String(a).localeCompare(b);
}

function likeToRegex(pattern: string, flags: string): RegExp {
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/[%*]/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${esc}$`, flags);
}

function evalOp(row: FakeRow, column: string, op: string, raw: string): Tri {
  const v = columnValue(row, column);
  if (op === "is") {
    const t = raw.toLowerCase();
    if (t === "null") return v === null;
    if (t === "true") return v === true;
    if (t === "false") return v === false;
    throw new Error(`fake-postgrest: unsupported is.${raw}`);
  }
  if (v === null) return null;
  switch (op) {
    case "eq":
      return String(v) === unquote(raw);
    case "neq":
      return String(v) !== unquote(raw);
    case "gt":
      return cmp(v, raw) > 0;
    case "gte":
      return cmp(v, raw) >= 0;
    case "lt":
      return cmp(v, raw) < 0;
    case "lte":
      return cmp(v, raw) <= 0;
    case "like":
      return likeToRegex(unquote(raw), "").test(String(v));
    case "ilike":
      return likeToRegex(unquote(raw), "i").test(String(v));
    case "in": {
      const inner = raw.trim().replace(/^\(/, "").replace(/\)$/, "");
      const list = splitTopLevel(inner).map(unquote);
      return list.includes(String(v));
    }
    default:
      throw new Error(`fake-postgrest: unsupported op ${op}`);
  }
}

function not(t: Tri): Tri {
  return t === null ? null : !t;
}

function and(ts: Tri[]): Tri {
  if (ts.some((t) => t === false)) return false;
  if (ts.some((t) => t === null)) return null;
  return true;
}

function or(ts: Tri[]): Tri {
  if (ts.some((t) => t === true)) return true;
  if (ts.some((t) => t === null)) return null;
  return false;
}

/** One logic-tree term: `or(..)`, `and(..)`, `not.or(..)`, `col.op.val`, `col.not.op.val`. */
function evalTerm(row: FakeRow, term: string): Tri {
  const t = term.trim();
  const logic = /^(not\.)?(or|and)\(([\s\S]*)\)$/.exec(t);
  if (logic) {
    const parts = splitTopLevel(logic[3]).map((p) => evalTerm(row, p));
    const r = logic[2] === "or" ? or(parts) : and(parts);
    return logic[1] ? not(r) : r;
  }
  const firstDot = t.indexOf(".");
  if (firstDot < 0) throw new Error(`fake-postgrest: bad term ${t}`);
  const column = t.slice(0, firstDot);
  return evalColumnFilter(row, column, t.slice(firstDot + 1));
}

function evalColumnFilter(row: FakeRow, column: string, opAndValue: string): Tri {
  let rest = opAndValue;
  let negate = false;
  if (rest.startsWith("not.")) {
    negate = true;
    rest = rest.slice(4);
  }
  const dot = rest.indexOf(".");
  const op = dot < 0 ? rest : rest.slice(0, dot);
  const value = dot < 0 ? "" : rest.slice(dot + 1);
  const r = evalOp(row, column, op, value);
  return negate ? not(r) : r;
}

const RESERVED = new Set(["select", "order", "offset", "limit", "on_conflict", "columns"]);

export function rowMatchesSearchParams(row: FakeRow, params: URLSearchParams): boolean {
  const results: Tri[] = [];
  for (const [key, value] of params.entries()) {
    if (RESERVED.has(key)) continue;
    const logic = /^(not\.)?(or|and)$/.exec(key);
    if (logic) {
      const inner = value.trim().replace(/^\(/, "").replace(/\)$/, "");
      const parts = splitTopLevel(inner).map((p) => evalTerm(row, p));
      const r = logic[2] === "or" ? or(parts) : and(parts);
      results.push(logic[1] ? not(r) : r);
      continue;
    }
    results.push(evalColumnFilter(row, key, value));
  }
  return and(results) === true;
}

function sortRows(rows: FakeRow[], order: string | null): FakeRow[] {
  if (!order) return rows;
  const keys = splitTopLevel(order).map((o) => {
    const [col, dir] = o.split(".");
    return { col, desc: dir === "desc" };
  });
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const av = a[k.col];
      const bv = b[k.col];
      if (av === bv) continue;
      if (av == null) return k.desc ? 1 : -1;
      if (bv == null) return k.desc ? -1 : 1;
      const c = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
      if (c !== 0) return k.desc ? -c : c;
    }
    return 0;
  });
}

export type FakePostgrestOptions = {
  /** Rows for `posts` / `posts_masked`. */
  rows: FakeRow[];
  /** Other tables by name (e.g. `categories`); unknown tables answer `[]`. */
  tables?: Record<string, FakeRow[]>;
  /** Return true to answer this request with HTTP 500 (DB failure injection). */
  failWhen?: (url: URL) => boolean;
  /** Emulates PostgREST `max-rows` (Supabase default 1000): responses are capped at this many rows. */
  maxRows?: number;
  /** Records every request URL (search params) for assertions. */
  log?: URL[];
};

export function createFakePostgrestClient(opts: FakePostgrestOptions): SupabaseClient<any> {
  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    opts.log?.push(url);
    if ((init?.method ?? "GET").toUpperCase() !== "GET") {
      return new Response(JSON.stringify({ message: "fake-postgrest: read-only" }), { status: 405 });
    }
    if (opts.failWhen?.(url)) {
      return new Response(JSON.stringify({ message: "injected failure", code: "XX000" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    const p = url.searchParams;
    const table = /\/rest\/v1\/([^/?]+)/.exec(url.pathname)?.[1] ?? "";
    const source =
      table === "posts" || table === "posts_masked" ? opts.rows : (opts.tables?.[table] ?? []);
    const matched = sortRows(
      source.filter((r) => rowMatchesSearchParams(r, p)),
      p.get("order")
    );
    const offset = Number(p.get("offset") ?? 0) || 0;
    const limit = p.get("limit") != null ? Number(p.get("limit")) : matched.length;
    const page = matched.slice(offset, offset + Math.min(limit, opts.maxRows ?? limit));
    return new Response(JSON.stringify(page), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return createClient("http://fake-postgrest.local", "fake-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fakeFetch as typeof fetch },
  });
}
