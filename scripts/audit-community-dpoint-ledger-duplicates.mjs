#!/usr/bin/env node
/**
 * PRE-MIGRATION DATA AUDIT — Community D-Point UNIQUE / mismatch.
 * READ-ONLY. Does not apply migration. Does not DELETE/UPDATE ledger.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

loadEnvLocal();

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const PROD_REF = "ckdosyydvgzqwpbwuhon";

async function selectAll(sb, table, columns, extra = (q) => q) {
  const pageSize = 1000;
  const out = [];
  for (let from = 0; ; from += pageSize) {
    let q = sb.from(table).select(columns).range(from, from + pageSize - 1);
    q = extra(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

function mainDupGroups(rows, keyFn) {
  const map = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!k) continue;
    const list = map.get(k) ?? [];
    list.push(r);
    map.set(k, list);
  }
  return [...map.entries()].filter(([, list]) => list.length > 1);
}

async function main() {
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  console.log("DATABASE TARGET:", url || "(missing)");
  console.log("PROJECT REF:", ref || "(missing)");
  console.log("AUDIT READ-ONLY:", "YES");
  console.log("PRODUCTION MATCH:", ref === PROD_REF ? "YES" : "NO");

  if (!url || !key) {
    console.error("missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(2);
  }
  if (ref !== PROD_REF) {
    console.error("REFUSING: URL is not Production project ckdosyydvgzqwpbwuhon");
    process.exit(2);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const ledger = await selectAll(
    sb,
    "point_ledger",
    "id, user_id, entry_type, amount, related_type, related_id, created_at, description",
    (q) => q.in("related_type", ["community_reward", "community_reclaim"])
  );
  const rewards = ledger.filter((r) => r.related_type === "community_reward");
  const reclaims = ledger.filter((r) => r.related_type === "community_reclaim");

  const execs = await selectAll(
    sb,
    "point_reward_executions",
    "id, execution_key, user_id, target_id, target_type, status, final_point, created_at, reversed_at"
  );

  const rewardDupGroups = mainDupGroups(rewards, (r) => `${r.user_id}|${r.related_type}|${r.related_id}`);
  const reclaimDupGroups = mainDupGroups(reclaims, (r) => `${r.user_id}|${r.related_type}|${r.related_id}`);
  const execDupGroups = mainDupGroups(
    execs.filter((e) => String(e.execution_key ?? "").trim()),
    (e) => String(e.execution_key)
  );

  const execByTarget = new Map();
  for (const e of execs) {
    const k = `${e.target_type}|${e.target_id}`;
    const list = execByTarget.get(k) ?? [];
    list.push(e);
    execByTarget.set(k, list);
  }
  const execById = new Map(execs.map((e) => [String(e.id), e]));
  const rewardBySource = new Map();
  for (const r of rewards) {
    rewardBySource.set(`${r.user_id}|${r.related_id}`, r);
  }
  const reclaimByExec = new Map();
  for (const r of reclaims) {
    reclaimByExec.set(String(r.related_id), r);
  }

  const successExecs = execs.filter((e) => e.status === "success");
  const reversedExecs = execs.filter((e) => e.status === "reversed");

  const executionWithoutLedger = successExecs.filter((e) => {
    if (Number(e.final_point ?? 0) < 1) return false;
    return !rewardBySource.has(`${e.user_id}|${e.target_id}`);
  });
  const ledgerWithoutExecution = rewards.filter((r) => {
    const list = execByTarget.get(`post|${r.related_id}`) || execByTarget.get(`comment|${r.related_id}`) || [];
    return list.length === 0;
  });
  const amountMismatch = successExecs.filter((e) => {
    const led = rewardBySource.get(`${e.user_id}|${e.target_id}`);
    if (!led) return false;
    return Number(e.final_point ?? 0) !== Number(led.amount ?? 0);
  });
  const reversalMismatchA = reversedExecs.filter((e) => !reclaimByExec.has(String(e.id)));
  const reversalMismatchB = reclaims.filter((r) => {
    const e = execById.get(String(r.related_id));
    return e && e.status === "success";
  });

  const nullRelated = rewards.filter((r) => !String(r.related_id ?? "").trim());
  const amountByTarget = new Map();
  for (const r of rewards) {
    const k = String(r.related_id);
    const set = amountByTarget.get(k) ?? new Set();
    set.add(Number(r.amount));
    amountByTarget.set(k, set);
  }
  const sameTargetDifferentAmount = [...amountByTarget.entries()].filter(([, s]) => s.size > 1);

  const { data: negProfiles, error: negErr } = await sb
    .from("profiles")
    .select("id, points")
    .lt("points", 0);
  if (negErr) throw new Error(negErr.message);

  const userIds = [...new Set(ledger.map((r) => r.user_id).filter(Boolean))];
  let ledgerNegUsers = 0;
  for (const uid of userIds) {
    const { data: sums } = await sb.from("point_ledger").select("amount").eq("user_id", uid);
    const sum = (sums ?? []).reduce((a, b) => a + Number(b.amount ?? 0), 0);
    if (sum < 0) ledgerNegUsers += 1;
  }

  const affected = new Set([
    ...rewardDupGroups.flatMap(([, list]) => list.map((r) => r.user_id)),
    ...reclaimDupGroups.flatMap(([, list]) => list.map((r) => r.user_id)),
    ...executionWithoutLedger.map((e) => e.user_id),
    ...ledgerWithoutExecution.map((r) => r.user_id),
    ...amountMismatch.map((e) => e.user_id),
    ...reversalMismatchA.map((e) => e.user_id),
    ...reversalMismatchB.map((r) => r.user_id),
  ]);

  console.log("");
  console.log("PRE-MIGRATION DATA AUDIT");
  console.log("DATABASE: PRODUCTION");
  console.log(`COMMUNITY REWARD LEDGER ROWS: ${rewards.length}`);
  console.log(`COMMUNITY RECLAIM LEDGER ROWS: ${reclaims.length}`);
  console.log(`EXECUTION ROWS: ${execs.length}`);
  console.log(`DUPLICATE SOURCE GROUPS: ${rewardDupGroups.length + reclaimDupGroups.length}`);
  console.log(`DUPLICATE EXECUTIONS: ${execDupGroups.length}`);
  console.log(`LEDGER WITHOUT EXECUTION: ${ledgerWithoutExecution.length}`);
  console.log(`EXECUTION WITHOUT LEDGER: ${executionWithoutLedger.length}`);
  console.log(`AMOUNT MISMATCH: ${amountMismatch.length}`);
  console.log(`REVERSAL MISMATCH: ${reversalMismatchA.length + reversalMismatchB.length}`);
  console.log(`EXISTING NEGATIVE BALANCES: profiles=${(negProfiles ?? []).length} ledgerSumUsers=${ledgerNegUsers}`);
  console.log(`AFFECTED USERS: ${affected.size}`);
  console.log(`NULL related_id: ${nullRelated.length}`);
  console.log(`SAME TARGET DIFFERENT AMOUNT: ${sameTargetDifferentAmount.length}`);

  const dump = (title, items, fmt) => {
    console.log(`\n--- ${title} (${items.length}) ---`);
    for (const item of items.slice(0, 50)) console.log(fmt(item));
    if (items.length > 50) console.log(`... truncated ${items.length - 50} more`);
  };

  dump("A reward duplicate groups", rewardDupGroups, ([k, list]) =>
    JSON.stringify({
      key: k,
      count: list.length,
      ids: list.map((r) => r.id),
      amounts: list.map((r) => r.amount),
      created: list.map((r) => r.created_at),
    })
  );
  dump("A reclaim duplicate groups", reclaimDupGroups, ([k, list]) =>
    JSON.stringify({ key: k, count: list.length, ids: list.map((r) => r.id) })
  );
  dump("B execution_key dups", execDupGroups, ([k, list]) =>
    JSON.stringify({ key: k, count: list.length, ids: list.map((e) => e.id) })
  );
  dump("C execution without ledger", executionWithoutLedger, (e) =>
    JSON.stringify({
      execution_id: e.id,
      user_id: e.user_id,
      target_id: e.target_id,
      final_point: e.final_point,
      status: e.status,
    })
  );
  dump("C ledger without execution", ledgerWithoutExecution, (r) =>
    JSON.stringify({ ledger_id: r.id, user_id: r.user_id, related_id: r.related_id, amount: r.amount })
  );
  dump("C amount mismatch", amountMismatch, (e) => {
    const led = rewardBySource.get(`${e.user_id}|${e.target_id}`);
    return JSON.stringify({
      execution_id: e.id,
      final_point: e.final_point,
      ledger_id: led?.id,
      ledger_amount: led?.amount,
    });
  });
  dump("C reversed without reclaim ledger", reversalMismatchA, (e) =>
    JSON.stringify({ execution_id: e.id, user_id: e.user_id, final_point: e.final_point })
  );
  dump("C reclaim ledger but execution success", reversalMismatchB, (r) =>
    JSON.stringify({ ledger_id: r.id, related_id: r.related_id, amount: r.amount })
  );
  dump("D negative profiles.points", negProfiles ?? [], (p) =>
    JSON.stringify({ user_id: p.id, points: p.points })
  );

  const blocked =
    rewardDupGroups.length +
      reclaimDupGroups.length +
      execDupGroups.length +
      ledgerWithoutExecution.length +
      executionWithoutLedger.length +
      amountMismatch.length +
      reversalMismatchA.length +
      reversalMismatchB.length >
    0;

  console.log("\nVERDICT:", blocked ? "MIGRATION BLOCKED — DATA RECONCILIATION REQUIRED" : "MIGRATION SAFE");
  process.exitCode = blocked ? 1 : 0;
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
