/**
 * R15 — row_not_found fixture seed + scenario validation.
 * 안전 원칙:
 * - 테스트 계정(기본 aaaa) 기반 fixture room만 생성/갱신
 * - perf 전용 direct_key / 제목만 사용
 * - 기존 실제 사용자 room은 수정하지 않음
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const outPath = path.join(repoRoot, "docs", "perf", "cm-r15-row-not-found-fixture-validation.json");
const origin = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

const TEST_USERNAME = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "1234";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function nowIsoMinus(mins) {
  return new Date(Date.now() - mins * 60_000).toISOString();
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
  if (!row?.id) throw new Error(`test user not found for username=${TEST_USERNAME}`);
  return String(row.id);
}

async function ensureDirectRoom(sb, { directKey, title, createdBy }) {
  const now = new Date().toISOString();
  const { data: existing, error: qErr } = await sb
    .from("community_messenger_rooms")
    .select("id, direct_key")
    .eq("direct_key", directKey)
    .maybeSingle();
  if (qErr) throw new Error(`room query failed (${directKey}): ${qErr.message}`);
  if (existing?.id) {
    const { error: uErr } = await sb
      .from("community_messenger_rooms")
      .update({
        title,
        summary: `[PERF-R15] ${title}`,
        updated_at: now,
      })
      .eq("id", existing.id);
    if (uErr) throw new Error(`room update failed (${directKey}): ${uErr.message}`);
    return String(existing.id);
  }
  const { data: inserted, error: iErr } = await sb
    .from("community_messenger_rooms")
    .insert({
      room_type: "direct",
      direct_key: directKey,
      title,
      summary: `[PERF-R15] ${title}`,
      created_by: createdBy,
      last_message: "[PERF-R15] fixture created",
      last_message_type: "system",
      last_message_at: now,
      updated_at: now,
    })
    .select("id")
    .single();
  if (iErr || !inserted?.id) throw new Error(`room insert failed (${directKey}): ${iErr?.message || "no id"}`);
  return String(inserted.id);
}

async function ensureParticipant(sb, { roomId, userId, unreadCount }) {
  const now = new Date().toISOString();
  const { error } = await sb.from("community_messenger_participants").upsert(
    {
      room_id: roomId,
      user_id: userId,
      role: "owner",
      unread_count: unreadCount,
      joined_at: now,
      is_muted: false,
      is_pinned: false,
    },
    { onConflict: "room_id,user_id" }
  );
  if (error) throw new Error(`participant upsert failed (${roomId}): ${error.message}`);
}

async function replaceRoomMessages(sb, { roomId, userId, mode }) {
  const { error: delErr } = await sb.from("community_messenger_messages").delete().eq("room_id", roomId);
  if (delErr) throw new Error(`message delete failed (${roomId}): ${delErr.message}`);

  const rows = [];
  if (mode === "empty") {
    // no rows
  } else if (mode === "cold16") {
    for (let i = 0; i < 16; i += 1) {
      rows.push({
        room_id: roomId,
        sender_id: userId,
        message_type: "text",
        content: `[PERF-R15][cold16] message ${i + 1}`,
        metadata: { perf_test: "r15", fixture: "cold16", idx: i + 1 },
        created_at: nowIsoMinus(40 - i),
      });
    }
  } else if (mode === "media") {
    for (let i = 0; i < 4; i += 1) {
      rows.push({
        room_id: roomId,
        sender_id: userId,
        message_type: "image",
        content: `[PERF-R15][media] image ${i + 1}`,
        metadata: {
          perf_test: "r15",
          fixture: "media",
          image_url: `https://example.com/perf-r15-${i + 1}.jpg`,
          width: 720,
          height: 960,
        },
        created_at: nowIsoMinus(30 - i),
      });
    }
    rows.push({
      room_id: roomId,
      sender_id: userId,
      message_type: "text",
      content: "[PERF-R15][media] tail",
      metadata: { perf_test: "r15", fixture: "media_tail" },
      created_at: nowIsoMinus(20),
    });
  } else if (mode === "switch") {
    for (let i = 0; i < 6; i += 1) {
      rows.push({
        room_id: roomId,
        sender_id: userId,
        message_type: "text",
        content: `[PERF-R15][switch] message ${i + 1}`,
        metadata: { perf_test: "r15", fixture: "switch", idx: i + 1 },
        created_at: nowIsoMinus(18 - i),
      });
    }
  }

  if (rows.length > 0) {
    const { error: insErr } = await sb.from("community_messenger_messages").insert(rows);
    if (insErr) throw new Error(`message insert failed (${roomId}/${mode}): ${insErr.message}`);
  }

  const last = rows.at(-1);
  const { error: roomErr } = await sb
    .from("community_messenger_rooms")
    .update({
      last_message: last?.content ?? "[PERF-R15] empty fixture",
      last_message_type: last?.message_type ?? "system",
      last_message_at: last?.created_at ?? new Date().toISOString(),
      summary: `[PERF-R15] fixture:${mode}`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roomId);
  if (roomErr) throw new Error(`room last_message update failed (${roomId}): ${roomErr.message}`);
}

async function setupFixtures(sb, userId) {
  const defs = [
    { key: "empty_room", directKey: "perf_r15:empty_room", title: "[PERF-R15] empty room", mode: "empty", unread: 0 },
    { key: "cold_seeded_room", directKey: "perf_r15:cold_seeded_16", title: "[PERF-R15] cold seeded 16", mode: "cold16", unread: 0 },
    { key: "delivery_unread_room", directKey: "store_order:perf_r15_delivery_unread", title: "[PERF-R15] 배달 unread fixture", mode: "switch", unread: 3 },
    { key: "media_room", directKey: "perf_r15:media_room", title: "[PERF-R15] media fixture", mode: "media", unread: 0 },
    { key: "fast_switch_room_a", directKey: "perf_r15:fast_switch_a", title: "[PERF-R15] switch room A", mode: "switch", unread: 0 },
    { key: "fast_switch_room_b", directKey: "perf_r15:fast_switch_b", title: "[PERF-R15] switch room B", mode: "switch", unread: 0 },
  ];

  const out = {};
  for (const d of defs) {
    const roomId = await ensureDirectRoom(sb, { directKey: d.directKey, title: d.title, createdBy: userId });
    await ensureParticipant(sb, { roomId, userId, unreadCount: d.unread });
    await replaceRoomMessages(sb, { roomId, userId, mode: d.mode });
    out[d.key] = { roomId, directKey: d.directKey, title: d.title, mode: d.mode, unread: d.unread };
  }
  return out;
}

async function perfCursor(page) {
  return page.evaluate(() => (window.__cmPerfEvents ?? []).length);
}

async function collectFieldsAfter(page, cursor) {
  return page.evaluate((start) => {
    const ev = (window.__cmPerfEvents ?? []).slice(start);
    const interesting = ev.filter((e) => {
      if (!e || typeof e !== "object") return false;
      return (
        Object.prototype.hasOwnProperty.call(e, "first_row_query_result") ||
        Object.prototype.hasOwnProperty.call(e, "first_row_blocker") ||
        Object.prototype.hasOwnProperty.call(e, "first_row_commit_span_source") ||
        Object.prototype.hasOwnProperty.call(e, "direct_layout_rows_source")
      );
    });
    return interesting.map((e) => ({
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
      render_source: typeof e.direct_layout_rows_source === "string" ? e.direct_layout_rows_source.split(":").slice(1).join(":") : null,
      direct_layout_rows_source: e.direct_layout_rows_source ?? null,
    }));
  }, cursor);
}

async function openRoom(page, roomId) {
  await page.goto(`${origin}/community-messenger/rooms/${roomId}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await sleep(1400);
  return { ok: true };
}

async function runScenario(page, name, fn) {
  const c = await perfCursor(page);
  const res = await fn();
  if (!res?.ok) return { scenario: name, ok: false, reason: res?.reason ?? "failed", events: [] };
  const events = await collectFieldsAfter(page, c);
  return { scenario: name, ok: true, events };
}

function dist(arr, key) {
  return arr.reduce((m, x) => {
    const k = x[key] == null ? "null" : String(x[key]);
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});
}

const env = loadEnvLocal();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const testUserId = await resolveTestUserId(sb);
const fixtures = await setupFixtures(sb, testUserId);

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
await login(page);
await page.evaluate(() => {
  try {
    sessionStorage.setItem("samarket:debug:runtime", "1");
  } catch {
    /* */
  }
});

const scenarios = [];
scenarios.push(
  await runScenario(page, "cold_room_entry", async () => openRoom(page, fixtures.cold_seeded_room.roomId))
);
scenarios.push(
  await runScenario(page, "empty_room_entry", async () => openRoom(page, fixtures.empty_room.roomId))
);
scenarios.push(
  await runScenario(page, "delivery_unread_room_entry", async () => {
    await page.goto(`${origin}/community-messenger/delivery-chats?filter=unread`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await sleep(900);
    return openRoom(page, fixtures.delivery_unread_room.roomId);
  })
);
scenarios.push(
  await runScenario(page, "media_room_entry", async () => openRoom(page, fixtures.media_room.roomId))
);
scenarios.push(
  await runScenario(page, "fast_switch_a_b_a", async () => {
    await openRoom(page, fixtures.fast_switch_room_a.roomId);
    await openRoom(page, fixtures.fast_switch_room_b.roomId);
    await openRoom(page, fixtures.fast_switch_room_a.roomId);
    return { ok: true };
  })
);
scenarios.push(
  await runScenario(page, "burst_then_reentry", async () => {
    await openRoom(page, fixtures.cold_seeded_room.roomId);
    await page.evaluate(() => {
      window.dispatchEvent(
        new CustomEvent("samarket:cm:r3:synthetic-burst", { detail: { count: 40, intervalMs: 0, textPrefix: "R15 burst" } })
      );
    });
    await sleep(700);
    return openRoom(page, fixtures.cold_seeded_room.roomId);
  })
);
scenarios.push(
  await runScenario(page, "visibility_restore_then_entry", async () => {
    await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await sleep(350);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("pageshow"));
    });
    await sleep(500);
    return openRoom(page, fixtures.cold_seeded_room.roomId);
  })
);

await context.close();
await browser.close();

const allEvents = scenarios.flatMap((s) => s.events || []);
const rowNotFoundEvents = allEvents.filter((e) => String(e.first_row_blocker || "").startsWith("row_not_found"));

const summary = {
  capturedAt: new Date().toISOString(),
  origin,
  fixtures,
  scenarios,
  distributions: {
    first_row_query_result: dist(allEvents, "first_row_query_result"),
    first_row_blocker_reason: dist(allEvents, "first_row_blocker_reason"),
    row_not_found: dist(rowNotFoundEvents, "first_row_blocker"),
    first_row_commit_span_source: dist(allEvents, "first_row_commit_span_source"),
    direct_layout_rows_source: dist(allEvents, "direct_layout_rows_source"),
    render_source: dist(allEvents, "render_source"),
  },
  row_not_found_unknown_count: rowNotFoundEvents.filter((e) => e.row_not_found_unknown).length,
};

writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
