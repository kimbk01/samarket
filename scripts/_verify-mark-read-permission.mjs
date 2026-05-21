#!/usr/bin/env node
/**
 * PATCH mark_read — permission seed + structure lock (A–D).
 * @see docs/messenger-mark-read-performance-lock.md
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import {
  assertMarkReadPermissionPathNoServiceDynamicImport,
  evaluateMarkReadPerformanceLock,
  sampleFromDevApiPerf,
  MARK_READ_PERF_LOCK_RULES,
} from "./mark-read-perf-lock.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const devLogPath =
  process.env.BOOTSTRAP_DEV_TERMINAL_LOG ||
  path.join(process.env.USERPROFILE ?? "", ".cursor", "projects", "c-samarket", "terminals", "932385.txt");
const baseUrl = process.env.SAMARKET_BASE_URL || "http://127.0.0.1:3000";
const PASSWORD = process.env.SAMARKET_TEST_PASSWORD || process.env.E2E_TEST_PASSWORD || "1234";
const perfEnv = process.env.SAMARKET_PERF_ENV === "prod_same_region" ? "prod_same_region" : "local_linked";

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnvLocal();

async function login() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const cookieName = `sb-${ref}-auth-token`;
  const email = "aaaa@manual.local";
  const { data, error } = await sb.auth.signInWithPassword({ email, password: PASSWORD });
  if (error || !data.session) throw error ?? new Error("login failed");
  const session = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    expires_in: data.session.expires_in,
    token_type: data.session.token_type,
    user: data.session.user,
  };
  return `${cookieName}=${encodeURIComponent(JSON.stringify(session))}`;
}

/** Multiline `[dev-api-perf] ... PATCH mark_read { ... }` blocks */
function parseMarkReadDevApiPerf(afterLineCount) {
  if (!fs.existsSync(devLogPath)) return [];
  const text = fs.readFileSync(devLogPath, "utf8");
  const slice = text.split(/\r?\n/).slice(afterLineCount).join("\n");
  const hits = [];
  const re = /\[dev-api-perf\]\s+\/api\/community-messenger\/rooms\/\[roomId\]\s+PATCH mark_read\s+\{/g;
  let m;
  while ((m = re.exec(slice)) !== null) {
    const start = m.index + m[0].length - 1;
    let depth = 0;
    let end = start;
    for (let i = start; i < slice.length; i++) {
      const ch = slice[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    const block = slice.slice(start, end);
    const obj = {};
    for (const line of block.split(/\r?\n/)) {
      const t = line.trim().replace(/,$/, "");
      const ci = t.indexOf(":");
      if (ci < 1) continue;
      const key = t.slice(0, ci).trim();
      let val = t.slice(ci + 1).trim();
      if (val === "null") obj[key] = null;
      else if (val === "true") obj[key] = true;
      else if (val === "false") obj[key] = false;
      else if (/^['"]/.test(val)) obj[key] = val.slice(1, -1);
      else if (/^-?\d+(\.\d+)?$/.test(val)) obj[key] = Number(val);
      else obj[key] = val;
    }
    obj.route = "/api/community-messenger/rooms/[roomId] PATCH mark_read";
    hits.push(obj);
  }
  return hits;
}

async function pickRoomId(cookie) {
  if (process.env.CM_VERIFY_ROOM_ID?.trim()) return process.env.CM_VERIFY_ROOM_ID.trim();
  const res = await fetch(`${baseUrl}/api/community-messenger/bootstrap?lite=1`, {
    headers: { cookie },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`bootstrap HTTP ${res.status}`);
  const j = await res.json();
  const rooms = [...(j.chats ?? []), ...(j.groups ?? [])];
  const unread = rooms.find((r) => (r.unreadCount ?? r.unread?.count ?? 0) > 0);
  const id = unread?.id ?? unread?.roomId ?? rooms[0]?.id ?? rooms[0]?.roomId;
  if (id && String(id).length > 30) return String(id);
  throw new Error("no room id from bootstrap");
}

async function markOpen(cookie, roomId) {
  const res = await fetch(`${baseUrl}/api/community-messenger/rooms/${roomId}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ action: "mark_read", flushOpen: true }),
    cache: "no-store",
  });
  return { status: res.status, ok: res.ok };
}

function formatFailures(list) {
  return list.map((f) => `${f.code} (${f.expected} vs ${f.actual})`).join("; ");
}

async function main() {
  const canonApiPath = path.join(
    root,
    "lib/community-messenger/server/messenger-room-canonical-resolve-api.ts"
  );
  const canonSource = fs.readFileSync(canonApiPath, "utf8");
  const staticFail = assertMarkReadPermissionPathNoServiceDynamicImport(canonSource);

  const logLinesBefore = fs.existsSync(devLogPath)
    ? fs.readFileSync(devLogPath, "utf8").split(/\r?\n/).length
    : 0;

  const cookie = await login();
  const roomId = await pickRoomId(cookie);
  console.log("perf_environment", perfEnv);
  console.log("roomId", roomId);
  console.log("devLogPath", devLogPath);

  const steps = [];

  await fetch(
    `${baseUrl}/api/community-messenger/rooms/${roomId}/bootstrap?mode=instant&cmReqSrc=verifyA`,
    { headers: { cookie }, cache: "no-store" }
  );
  await new Promise((r) => setTimeout(r, 300));
  const aStatus = await markOpen(cookie, roomId);
  steps.push({ scenario: "A", http: aStatus.status });
  await new Promise((r) => setTimeout(r, 400));

  await fetch(`${baseUrl}/api/community-messenger/rooms/${roomId}?memberHydration=minimal`, {
    headers: { cookie },
    cache: "no-store",
  });
  await new Promise((r) => setTimeout(r, 200));
  const bStatus = await markOpen(cookie, roomId);
  steps.push({ scenario: "B", http: bStatus.status });
  await new Promise((r) => setTimeout(r, 300));

  const cStatus = await markOpen(cookie, roomId);
  steps.push({ scenario: "C", http: cStatus.status });
  await new Promise((r) => setTimeout(r, 250));

  const [d1, d2] = await Promise.all([
    markOpen(cookie, roomId),
    markOpen(cookie, roomId),
  ]);
  steps.push({ scenario: "D1", http: d1.status });
  steps.push({ scenario: "D2", http: d2.status });
  await new Promise((r) => setTimeout(r, 500));

  const perfs = parseMarkReadDevApiPerf(logLinesBefore);
  const scenarios = [
    {
      id: "A",
      label: "bootstrap → open",
      perf: perfs[0],
      opts: { expect_seeded_permission: true, expect_cold_combined_open: true },
    },
    {
      id: "B",
      label: "GET → open",
      perf: perfs[1],
      opts: { expect_seeded_permission: true, expect_cold_combined_open: false },
    },
    {
      id: "C",
      label: "warm repeat",
      perf: perfs[2],
      opts: { expect_seeded_permission: true },
    },
    {
      id: "D",
      label: "dual-tab parallel",
      perf: perfs[3] && perfs[4] ? mergeDualTab(perfs[3], perfs[4]) : perfs[3] ?? perfs[4],
      opts: { expect_seeded_permission: true },
      dual: perfs[3] && perfs[4] ? [perfs[3], perfs[4]] : null,
    },
  ];

  function mergeDualTab(p1, p2) {
    return {
      ...p2,
      patch_room_inflight_dedupe_hit:
        p1.patch_room_inflight_dedupe_hit === 1 || p2.patch_room_inflight_dedupe_hit === 1 ? 1 : 0,
      patch_room_response_wall_ms: Math.min(
        Number(p1.patch_room_response_wall_ms ?? 999),
        Number(p2.patch_room_response_wall_ms ?? 999)
      ),
    };
  }

  console.log("\n=== mark_read performance lock ===\n");
  if (staticFail) {
    console.log("| static | permission API | FAIL |", staticFail.code, "|");
  } else {
    console.log("| static | permission API | PASS | no service.ts dynamic import |");
  }

  let anyStructFail = Boolean(staticFail);
  let anyWarn = false;

  for (const sc of scenarios) {
    if (!sc.perf) {
      console.log(`| ${sc.id} | ${sc.label} | SKIP | no [dev-api-perf] (HTTP ${steps.find((s) => s.scenario === sc.id || (sc.id === "D" && s.scenario.startsWith("D")))?.http ?? "?"}) |`);
      anyStructFail = true;
      continue;
    }
    const sample = sampleFromDevApiPerf(sc.perf, sc.id === "D" ? "D" : sc.id, {
      perf_environment: perfEnv,
      ...sc.opts,
    });
    const lock = evaluateMarkReadPerformanceLock(sample);
    const verdict = lock.pass ? (lock.warnings.length ? "PASS*" : "PASS") : "FAIL";
    if (!lock.pass) anyStructFail = true;
    if (lock.warnings.length) anyWarn = true;

    console.log(
      `| ${sc.id} | ${sc.label} | ${verdict} | perm=${sample.permission_query_ms}ms hit=${sample.membership_cache_hit} src=${sample.permission_source ?? "-"} combined=${sample.mark_read_combined_rpc_used} rpc_ms=${sample.mark_read_combined_rpc_ms} wall=${sample.patch_room_response_wall_ms}ms |`
    );
    if (lock.failures.length) {
      console.log(`  FAIL: ${formatFailures(lock.failures)}`);
    }
    if (lock.warnings.length) {
      console.log(`  WARN: ${formatFailures(lock.warnings)}`);
    }
    if (sc.id === "D" && sc.dual) {
      console.log(
        `  D detail: dedupe1=${sc.dual[0].patch_room_inflight_dedupe_hit} dedupe2=${sc.dual[1].patch_room_inflight_dedupe_hit} wall1=${sc.dual[0].patch_room_response_wall_ms} wall2=${sc.dual[1].patch_room_response_wall_ms}`
      );
    }
  }

  console.log("\n--- rules (structure) ---");
  console.log(JSON.stringify(MARK_READ_PERF_LOCK_RULES, null, 2));
  console.log("\n--- summary ---");
  if (anyStructFail) {
    console.log("OVERALL: FAIL (structure regression — fix before shipping)");
    process.exit(1);
  }
  if (anyWarn && perfEnv === "local_linked") {
    console.log("OVERALL: PASS (structure) — RTT WARN only; re-measure prod_same_region");
    process.exit(0);
  }
  console.log("OVERALL: PASS");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
