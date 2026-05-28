import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const origin = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const outPath = path.join(repoRoot, "docs", "perf", "cm-r16-row-not-found-harness-validation.json");

const TEST_USERNAME = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "1234";

function loadEnvLocal() {
  const raw = readFileSync(path.resolve(repoRoot, ".env.local"), "utf8");
  const out = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, i).trim()] = v;
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dist(arr, key) {
  return arr.reduce((m, x) => {
    const k = x[key] == null ? "null" : String(x[key]);
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});
}

async function login(page) {
  const candidates = [
    { id: TEST_USERNAME, pass: TEST_PASSWORD },
    { id: `${TEST_USERNAME}@manual.local`, pass: TEST_PASSWORD },
    { id: `${TEST_USERNAME}@samarket.local`, pass: TEST_PASSWORD },
  ];
  for (const c of candidates) {
    await page.goto(`${origin}/login?next=%2Fcommunity-messenger`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "로그인", exact: true }) });
    await form.locator('input[type="text"]').first().fill(c.id);
    await form.locator('input[type="password"]').first().fill(c.pass);
    await form.getByRole("button", { name: "로그인", exact: true }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 40_000 }).catch(() => {});
    if (!page.url().includes("/login")) return;
  }
  throw new Error("login failed");
}

async function resolveTestUserId(sb) {
  const { data, error } = await sb
    .from("profiles")
    .select("id, username, email")
    .or(`username.eq.${TEST_USERNAME},email.ilike.${TEST_USERNAME}@%`)
    .limit(5);
  if (error) throw new Error(`profiles query failed: ${error.message}`);
  const row = (data ?? []).find((r) => String(r.username || "").toLowerCase() === TEST_USERNAME.toLowerCase()) ?? data?.[0];
  if (!row?.id) throw new Error("test user not found");
  return String(row.id);
}

async function deletePerfRooms(sb) {
  const keys = ["perf_r15:%", "perf_r16:%", "store_order:perf_r15%", "store_order:perf_r16%"];
  for (const key of keys) {
    const { data, error } = await sb.from("community_messenger_rooms").select("id").like("direct_key", key).limit(200);
    if (error) throw new Error(`room lookup failed(${key}): ${error.message}`);
    const ids = (data ?? []).map((r) => String(r.id)).filter(Boolean);
    if (ids.length <= 0) continue;
    const { error: delErr } = await sb.from("community_messenger_rooms").delete().in("id", ids);
    if (delErr) throw new Error(`room delete failed(${key}): ${delErr.message}`);
  }
}

async function ensureHarnessRoom(sb, userId, directKey, title) {
  const now = new Date().toISOString();
  const { data: existing } = await sb
    .from("community_messenger_rooms")
    .select("id")
    .eq("direct_key", directKey)
    .maybeSingle();
  const roomId = existing?.id
    ? String(existing.id)
    : String(
        (
          await sb
            .from("community_messenger_rooms")
            .insert({
              room_type: "direct",
              direct_key: directKey,
              title,
              summary: `[PERF-R16] ${title}`,
              created_by: userId,
              last_message: "[PERF-R16] init",
              last_message_type: "system",
              last_message_at: now,
              updated_at: now,
            })
            .select("id")
            .single()
        ).data.id
      );
  await sb.from("community_messenger_participants").upsert(
    {
      room_id: roomId,
      user_id: userId,
      role: "owner",
      unread_count: 0,
      joined_at: now,
      is_muted: false,
      is_pinned: false,
    },
    { onConflict: "room_id,user_id" }
  );
  await sb.from("community_messenger_messages").delete().eq("room_id", roomId);
  const rows = Array.from({ length: 16 }, (_, i) => ({
    room_id: roomId,
    sender_id: userId,
    message_type: "text",
    content: `[PERF-R16] harness msg ${i + 1}`,
    metadata: { perf_test: "r16", fixture: "harness", idx: i + 1 },
    created_at: new Date(Date.now() - (16 - i) * 60_000).toISOString(),
  }));
  await sb.from("community_messenger_messages").insert(rows);
  await sb
    .from("community_messenger_rooms")
    .update({
      last_message: rows.at(-1)?.content ?? "[PERF-R16] init",
      last_message_type: "text",
      last_message_at: rows.at(-1)?.created_at ?? now,
      summary: "[PERF-R16] harness room",
      updated_at: now,
    })
    .eq("id", roomId);
  return roomId;
}

function runNodeScript(command) {
  execSync(command, {
    cwd: repoRoot,
    env: { ...process.env, PLAYWRIGHT_BASE_URL: origin },
    stdio: "inherit",
  });
}

function readR3Summary() {
  const p = path.join(repoRoot, "docs", "perf", "cm-r3-room-realtime-burst-validation.json");
  const j = JSON.parse(readFileSync(p, "utf8"));
  const burstRuns = (j.results ?? []).filter((r) => r.scenario === "realtime_burst_synthetic" && !r.skipped);
  const burstOk = burstRuns.length > 0 && burstRuns.every((r) => r.batch_first === 28 && r.batch_second === 12);
  return {
    capturedAt: j.capturedAt,
    timeline_empty_flash_rate: j.averages?.timeline_empty_flash_rate ?? null,
    reentry_empty_flash_rate: j.averages?.reentry_empty_flash_rate ?? null,
    visibility_silent_delta: j.r2_regression?.visibility_silent_delta ?? null,
    visibility_home_sync_delta: j.r2_regression?.visibility_home_sync_delta ?? null,
    burst_28_plus_12: burstOk,
  };
}

async function perfCursor(page) {
  return page.evaluate(() => (window.__cmPerfEvents ?? []).length);
}

async function collectAfter(page, cursor) {
  return page.evaluate((start) => {
    const ev = (window.__cmPerfEvents ?? []).slice(start);
    const picked = ev.filter((e) => {
      if (!e || typeof e !== "object") return false;
      return (
        Object.prototype.hasOwnProperty.call(e, "forced_case") ||
        Object.prototype.hasOwnProperty.call(e, "first_row_query_result") ||
        Object.prototype.hasOwnProperty.call(e, "first_row_blocker") ||
        Object.prototype.hasOwnProperty.call(e, "first_row_commit_span_source") ||
        Object.prototype.hasOwnProperty.call(e, "direct_layout_rows_source")
      );
    });
    return picked.map((e) => ({
      forced_case: e.forced_case ?? null,
      first_row_query_result: e.first_row_query_result ?? null,
      first_row_blocker_reason: e.first_row_blocker_reason ?? null,
      first_row_blocker: e.first_row_blocker ?? null,
      row_not_found_no_rows: e.first_row_blocker === "row_not_found_no_rows",
      row_not_found_parent_hidden: e.first_row_blocker === "row_not_found_parent_hidden",
      row_not_found_query_too_early: e.first_row_blocker === "row_not_found_query_too_early",
      row_not_found_selector_mismatch: e.first_row_blocker === "row_not_found_selector_mismatch",
      row_not_found_unknown: e.first_row_blocker === "row_not_found_unknown",
      first_row_rows_count_at_query: e.first_row_rows_count_at_query ?? null,
      first_row_container_found: e.first_row_container_found ?? null,
      first_row_parent_hidden: e.first_row_parent_hidden ?? null,
      first_row_query_selector: e.first_row_query_selector ?? null,
      first_row_commit_span_source: e.first_row_commit_span_source ?? null,
      render_source:
        typeof e.direct_layout_rows_source === "string"
          ? e.direct_layout_rows_source.split(":").slice(1).join(":")
          : null,
      direct_layout_rows_source: e.direct_layout_rows_source ?? null,
    }));
  }, cursor);
}

async function runForcedCase(page, roomId, forcedCase) {
  await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.evaluate((value) => {
    try {
      if (value) window.localStorage.setItem("cm.r16.forceRowNotFoundCase", value);
      else window.localStorage.removeItem("cm.r16.forceRowNotFoundCase");
      sessionStorage.setItem("samarket:debug:runtime", "1");
    } catch {
      /* ignore */
    }
  }, forcedCase);
  const cursor = await perfCursor(page);
  await page.goto(`${origin}/community-messenger/rooms/${roomId}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await sleep(1500);
  const events = await collectAfter(page, cursor);
  return { forced_case: forcedCase, events };
}

const env = loadEnvLocal();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const testUserId = await resolveTestUserId(sb);

// 1) visibility delta 분리: baseline(무 fixture)
await deletePerfRooms(sb);
runNodeScript("node scripts/perf/cm-r3-room-realtime-burst-validate.mjs");
const visibilityBaselineNoFixture = readR3Summary();

// 2) fixture 생성 후 R3
const harnessRoomId = await ensureHarnessRoom(
  sb,
  testUserId,
  "perf_r16:harness_room",
  "[PERF-R16] harness room"
);
runNodeScript("node scripts/perf/cm-r3-room-realtime-burst-validate.mjs");
const visibilityWithFixture = readR3Summary();

// 3) fixture room 접근 직후 R3
{
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);
  await page.goto(`${origin}/community-messenger/rooms/${harnessRoomId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await sleep(1200);
  await context.close();
  await browser.close();
}
runNodeScript("node scripts/perf/cm-r3-room-realtime-burst-validate.mjs");
const visibilityAfterFixtureAccess = readR3Summary();

// harness 분기 강제 재현
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await login(page);
const forcedCases = ["parent_hidden", "query_too_early", "selector_mismatch"];
const harnessCases = [];
for (const c of forcedCases) {
  harnessCases.push(await runForcedCase(page, harnessRoomId, c));
}
await context.close();
await browser.close();

const harnessEvents = harnessCases.flatMap((c) => c.events.map((e) => ({ ...e, forced_case: c.forced_case })));
const rowNotFoundEvents = harnessEvents.filter((e) => String(e.first_row_blocker || "").startsWith("row_not_found"));
const caseVerdict = Object.fromEntries(
  forcedCases.map((c) => [
    c,
    rowNotFoundEvents.some((e) => e.forced_case === c),
  ])
);

const out = {
  capturedAt: new Date().toISOString(),
  round: "CM-R16-row-not-found-harness-validation",
  origin,
  harness_room_id: harnessRoomId,
  forced_cases: harnessCases,
  forced_case_reproduced: caseVerdict,
  row_not_found_distribution: dist(rowNotFoundEvents, "first_row_blocker"),
  row_not_found_unknown_count: rowNotFoundEvents.filter((e) => e.row_not_found_unknown).length,
  distributions: {
    first_row_query_result: dist(harnessEvents, "first_row_query_result"),
    first_row_blocker_reason: dist(harnessEvents, "first_row_blocker_reason"),
    first_row_commit_span_source: dist(harnessEvents, "first_row_commit_span_source"),
    render_source: dist(harnessEvents, "render_source"),
    direct_layout_rows_source: dist(harnessEvents, "direct_layout_rows_source"),
  },
  r3_visibility_split: {
    baseline_no_fixture: visibilityBaselineNoFixture,
    with_fixture: visibilityWithFixture,
    after_fixture_access: visibilityAfterFixtureAccess,
  },
};

writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
