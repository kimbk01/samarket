/**
 * End-to-end check of lib/admin/data-reset/full/service.ts against a local Postgres that has the
 * fixture + migration (database "dra"/"drb" style, created by scripts/data-reset-local-test.sh).
 * A psql-backed stand-in replaces supabase-js (rpc / from().select…/storage.remove) so the real
 * orchestration code (advance loop, Storage marking, abort, state, re-lock) runs unchanged.
 *   PGHOST=/tmp PGPORT=54329 DB=drsvc bun run supabase/tests/data-reset/service_flow_test.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321"; // loopback → P0 guard: non_production
process.env.DATA_RESET_QA_SUPABASE_REFS = "loopback"; // QA allowlist (required)

const DB = process.env.DB ?? "drsvc";
const lit = (v: unknown): string =>
  v === null || v === undefined ? "NULL" : typeof v === "object" ? `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb` : `'${String(v).replace(/'/g, "''")}'`;

function psql(sql: string, role = "service_role"): string {
  return execFileSync("psql", ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-d", DB, "-c", `set role ${role}; ${sql}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function run<T>(sql: string): { data: T | null; error: { message: string; code?: string } | null } {
  try {
    const out = psql(sql);
    return { data: (out ? JSON.parse(out) : null) as T, error: null };
  } catch (e) {
    const msg = String((e as { stderr?: string }).stderr ?? e);
    return { data: null, error: { message: msg, code: /duplicate key/.test(msg) ? "23505" : undefined } };
  }
}

const ARRAY_ARGS = new Set(["p_names"]);
function rpc(fn: string, args: Record<string, unknown> = {}) {
  const named = Object.entries(args)
    .map(([k, v]) => `${k} => ${ARRAY_ARGS.has(k) ? `ARRAY[${(v as string[]).map(lit).join(",")}]::text[]` : lit(v)}`)
    .join(", ");
  const r = run<unknown>(`select to_jsonb(x) from public.${fn}(${named}) x`);
  if (r.data && typeof r.data === "object" && !Array.isArray(r.data) && fn !== "data_reset_window_current") {
    // scalar-returning functions come back as {"<fn>": value} through to_jsonb(x)
    const o = r.data as Record<string, unknown>;
    if (fn in o && Object.keys(o).length === 1) return Promise.resolve({ data: o[fn], error: null });
  }
  return Promise.resolve(r);
}

function from(table: string) {
  const where: string[] = [];
  let cols = "*";
  let order: string[] = [];
  let lim: number | null = null;
  let head = false;
  let single = false;
  let mode: "select" | "insert" = "select";
  let row: Record<string, unknown> = {};
  const b: Record<string, unknown> = {
    select(c: string, o?: { count?: string; head?: boolean }) { cols = c; head = Boolean(o?.head); return b; },
    insert(r: Record<string, unknown>) { mode = "insert"; row = r; return b; },
    eq(c: string, v: unknown) { where.push(`${c} = ${lit(v)}`); return b; },
    gte(c: string, v: unknown) { where.push(`${c} >= ${lit(v)}`); return b; },
    in(c: string, v: unknown[]) { where.push(v.length ? `${c} in (${v.map(lit).join(",")})` : "false"); return b; },
    order(c: string, o?: { ascending?: boolean }) { order.push(`${c} ${o?.ascending === false ? "desc" : "asc"}`); return b; },
    limit(n: number) { lim = n; return b; },
    maybeSingle() { single = true; return b; },
    then(res: (v: unknown) => void) {
      if (mode === "insert") {
        const keys = Object.keys(row);
        const r = run(`insert into public.${table} (${keys.join(",")}) values (${keys.map((k) => lit(row[k])).join(",")}) returning null`);
        return res({ error: r.error });
      }
      const w = where.length ? `where ${where.join(" and ")}` : "";
      if (head) {
        const r = run<number>(`select count(*) from public.${table} ${w}`);
        return res({ count: r.data, error: r.error });
      }
      const q = `select ${cols} from public.${table} ${w} ${order.length ? "order by " + order.join(",") : ""} ${lim ? "limit " + lim : ""}`;
      const r = run<unknown[]>(`select coalesce(json_agg(t), '[]') from (${q}) t`);
      if (single) return res({ data: r.data?.[0] ?? null, error: r.error });
      return res(r);
    },
  };
  return b;
}

const sb = {
  rpc,
  from,
  storage: {
    from(bucket: string) {
      return {
        remove(names: string[]) {
          psql(`delete from storage.objects where bucket_id = ${lit(bucket)} and name in (${names.map(lit).join(",")})`, "postgres");
          return Promise.resolve({ data: names.map((name) => ({ name })), error: null });
        },
      };
    },
  },
};

const A1 = "a0000000-0000-0000-0000-000000000001";
const A2 = "a0000000-0000-0000-0000-000000000002";
let fails = 0;
const check = (cond: boolean, label: string, extra?: unknown) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${cond ? "" : " " + JSON.stringify(extra)}`);
  if (!cond) fails += 1;
};

async function main() {
  const svc = await import("@/lib/admin/data-reset/full/service");
  const manifest = JSON.parse(readFileSync("supabase/tests/data-reset/manifest.fixture.json", "utf8"));
  const { FULL_RESET_MANIFEST } = await import("@/lib/admin/data-reset/full/manifest");
  Object.assign(FULL_RESET_MANIFEST, manifest); // service sends FULL_RESET_MANIFEST; use the fixture manifest here

  let st = await svc.getFullResetState(sb, A1);
  check(st.ok && st.data.locked && st.data.lockReasons.includes("window_not_open"), "initial state LOCKED", st);

  const w = await svc.requestWindow(sb, A1, "service flow test");
  check(w.ok, "window requested", w);
  const wid = w.ok ? (w.data as string) : "";
  check(!(await svc.decideWindow(sb, A1, wid, true, 60)).ok, "requester cannot open own window");
  check((await svc.decideWindow(sb, A2, wid, true, 60)).ok, "second admin opens window");

  const plan = await svc.buildPlan(sb, A1, wid);
  check(plan.ok && (plan.data.summary as { deleteRows: number }).deleteRows === 6045, "dry-run 6045 rows", plan);
  const planId = plan.ok ? plan.data.planId : "";
  const hash = plan.ok ? String((plan.data.summary as { planHash: string }).planHash) : "";
  check((await svc.confirmPlan(sb, A1, planId, hash, "local-dump")).ok, "confirm");
  check(!(await svc.approvePlan(sb, A1, planId, hash)).ok, "confirmer cannot approve");
  check((await svc.approvePlan(sb, A2, planId, hash)).ok, "approve by second admin");
  const started = await svc.startRun(sb, A2, planId);
  check(started.ok, "start run", started);
  const runId = started.ok ? started.data : "";

  let loops = 0;
  let outcome: unknown = null;
  for (;;) {
    loops += 1;
    const a = await svc.advanceRun(sb, A2, runId, 2_000);
    if (!a.ok) { check(false, "advance", a); break; }
    if (a.data.finished) { outcome = a.data; break; }
    if (loops > 500) { check(false, "advance did not finish"); break; }
  }
  const fin = outcome as { status: string; finish?: { status: string; result: { verify: { ok: boolean }; db: { deleted: number } } } };
  check(fin?.status === "completed", "run completed (no concurrent changes in this scenario)", fin);
  check(fin?.finish?.result.verify.ok === true && fin.finish.result.db.deleted === 6045, "verify ok, 6045 rows deleted", fin?.finish?.result);

  st = await svc.getFullResetState(sb, A1);
  check(st.ok && st.data.locked && st.data.window === null, "re-locked after completion (window closed)", st.ok ? st.data.window : st);
  check(st.ok && st.data.storageProgress.deleted === 31 && st.data.authProgress.deleted === 2, "storage 31 / auth 2 deleted", st.ok ? [st.data.storageProgress, st.data.authProgress] : st);
  check(st.ok && st.data.history.length >= 1 && st.data.audit.some((x) => x.action === "run_finished"), "history + audit visible");

  // Abort path: new window, plan, start, abort → finished as aborted on next state read, re-locked.
  const w2 = await svc.requestWindow(sb, A2, "abort scenario");
  const w2id = w2.ok ? (w2.data as string) : "";
  await svc.decideWindow(sb, A1, w2id, true, 30);
  // add fresh tester data so the plan has something to do
  psql(`insert into public.posts (user_id, title) select 'b0000000-0000-0000-0000-000000000004', 'x' || g from generate_series(1, 2500) g`, "postgres");
  const p2 = await svc.buildPlan(sb, A2, w2id);
  const p2id = p2.ok ? p2.data.planId : "";
  const h2 = p2.ok ? String((p2.data.summary as { planHash: string }).planHash) : "";
  await svc.confirmPlan(sb, A2, p2id, h2, "local-dump-2");
  await svc.approvePlan(sb, A1, p2id, h2);
  const r2 = await svc.startRun(sb, A1, p2id);
  const r2id = r2.ok ? r2.data : "";
  await sb.rpc("data_reset_full_execute_batch", { p_run_id: r2id, p_limit: 1000 });
  check((await svc.requestAbort(sb, A1, r2id)).ok, "abort requested");
  st = await svc.getFullResetState(sb, A1);
  check(st.ok && st.data.run?.id === r2id && st.data.run.status === "aborted" && st.data.window === null, "aborted run finished + window re-locked", st.ok ? [st.data.run?.status, st.data.window] : st);
  const left = Number(psql(`select count(*) from public.posts where user_id = 'b0000000-0000-0000-0000-000000000004'`, "postgres"));
  check(left === 1500, "abort stopped after one 1,000-row batch (1,500 left, state consistent)", left);

  // Production target: destructive service calls refuse before touching the database.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ckdosyydvgzqwpbwuhon.supabase.co";
  const prod = await svc.startRun(sb, A1, p2id);
  check(!prod.ok && prod.error === "database_target_production", "P0: Production target refused", prod);

  console.log(fails ? `SERVICE FLOW: ${fails} FAILED` : "SERVICE FLOW: PASS");
  process.exit(fails ? 1 : 0);
}

void main();
