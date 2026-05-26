#!/usr/bin/env node
/**
 * 디바이 C2C baseline — Supabase signIn + Playwright (UI 로그인/test-login 불필요).
 *
 * 전제: `npm run dev` / prod-like `npm run build && npm run start` (PLAYWRIGHT_BASE_URL)
 * 실행: node scripts/capture-trade-c2c-baseline.mjs
 * E2E: 권한 가이드 guideSeen preseed + 「나중에」dismiss (앱 코드 변경 없음)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const outDir = path.join(root, "tests", "e2e", ".artifacts");
const outFile = path.join(outDir, "trade-c2c-baseline.json");

function loadEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

async function signInSession() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY 필요 (.env.local)");
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const password = process.env.E2E_TEST_PASSWORD ?? process.env.SAMARKET_TEST_PASSWORD ?? "1234";
  const loginIds = [
    process.env.E2E_TEST_USERNAME?.trim(),
    "qqqq",
    "aa11",
    "aaaa",
  ].filter(Boolean);

  for (const loginId of loginIds) {
    let email = loginId.includes("@") ? loginId.toLowerCase() : `${loginId.toLowerCase()}@manual.local`;
    if (serviceKey && loginId === "aa11") {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: pr } = await admin
        .from("profiles")
        .select("auth_login_email, email")
        .or("username.eq.aa11")
        .maybeSingle();
      const resolved = String(pr?.auth_login_email ?? pr?.email ?? "").trim().toLowerCase();
      if (resolved.includes("@")) email = resolved;
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      console.warn(`[baseline] signIn skip ${loginId}: ${error?.message ?? "no session"}`);
      continue;
    }
    const session = {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      expires_in: data.session.expires_in,
      token_type: data.session.token_type,
      user: data.session.user,
    };
    const cookies = [
      {
        name: `sb-${ref}-auth-token`,
        value: encodeURIComponent(JSON.stringify(session)),
        domain: "localhost",
        path: "/",
        sameSite: "Lax",
      },
    ];
    if (serviceKey) {
      const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
      const { data: pr } = await admin
        .from("profiles")
        .select("active_session_id")
        .eq("id", data.session.user.id)
        .maybeSingle();
      const activeSession = String(pr?.active_session_id ?? "").trim();
      if (activeSession) {
        cookies.push({
          name: "samarket_active_session_id",
          value: encodeURIComponent(activeSession),
          domain: "localhost",
          path: "/",
          sameSite: "Lax",
        });
      }
    }
    return { cookies, userId: data.session.user.id, loginId, email };
  }
  throw new Error("Supabase signInWithPassword 실패 — test 계정·비밀번호 확인");
}

const E2E_TRADE_PHASE_KEY = "samarket:debug:e2e:tradeC2cPhaseLastMs";

function pickMs(snap, key) {
  const v = snap?.appWidePhaseLastMs?.[key] ?? snap?.e2eTradePhaseLastMs?.[key];
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
}

function pickString(snap, key) {
  const v = snap?.e2eTradePhaseLastMs?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

async function readSnap(page) {
  return page.evaluate((sessionKey) => {
    const w = window;
    let e2eTradePhaseLastMs = null;
    try {
      const raw = sessionStorage.getItem(sessionKey);
      if (raw) e2eTradePhaseLastMs = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    const base = w.getMessengerHomeVerificationSnapshot?.() ?? null;
    if (!base) return e2eTradePhaseLastMs ? { e2eTradePhaseLastMs, appWidePhaseLastMs: {} } : null;
    return { ...base, e2eTradePhaseLastMs: e2eTradePhaseLastMs ?? {} };
  }, E2E_TRADE_PHASE_KEY);
}

const ROOM_URL_RE = /\/community-messenger\/rooms\/[^/?#]+/;
const COMPOSE_URL_RE = /\/mypage\/trade\/chat\/compose/;
const ROOM_WAIT_TIMEOUT_MS = 45_000;
const POST_ROOM_SETTLE_MS = 750;
/** `lib/permissions/device-permission-manager.ts` guideSeen 키와 동일 */
const PERMISSION_GUIDE_PRESEED_KINDS = ["location", "microphone", "speaker"];

function roomWaitFailureReason(chatComposeUrlSeen) {
  return chatComposeUrlSeen ? "compose_stuck" : "room_url_not_reached";
}

/** 채팅 클릭 → 메신저 방 URL 도달까지 (compose 에서 스냅샷 종료 금지) */
async function waitForMessengerRoomAfterChatClick(page, chatClickAt) {
  let chatComposeUrlSeen = COMPOSE_URL_RE.test(page.url());
  const composeWatcher = page
    .waitForURL(COMPOSE_URL_RE, { timeout: ROOM_WAIT_TIMEOUT_MS, waitUntil: "commit" })
    .then(() => {
      chatComposeUrlSeen = true;
    })
    .catch(() => undefined);

  let chatRoomUrlReached = false;
  let chatRoomUrl = null;
  let failureReason = null;

  try {
    await page.waitForURL(ROOM_URL_RE, { timeout: ROOM_WAIT_TIMEOUT_MS, waitUntil: "commit" });
    chatRoomUrlReached = true;
    chatRoomUrl = page.url();
  } catch {
    chatRoomUrlReached = false;
    chatRoomUrl = page.url();
    if (COMPOSE_URL_RE.test(chatRoomUrl)) chatComposeUrlSeen = true;
    failureReason = roomWaitFailureReason(chatComposeUrlSeen);
  } finally {
    await composeWatcher;
  }

  const chatWaitForRoomMs = Math.max(0, Date.now() - chatClickAt);
  return {
    chat_compose_url_seen: chatComposeUrlSeen,
    chat_room_url_reached: chatRoomUrlReached,
    chat_room_url: chatRoomUrlReached ? chatRoomUrl : chatRoomUrl,
    chat_wait_for_room_ms: chatWaitForRoomMs,
    failure_reason: failureReason,
  };
}

async function waitForTradeMetric(page, key, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snap = await readSnap(page);
    const v = pickMs(snap, key);
    if (v != null) return v;
    await waitMs(page, 300);
  }
  return null;
}

async function waitMs(page, ms) {
  await page.waitForTimeout(ms);
}

async function dismissPermissionGuides(page) {
  const later = page.getByRole("button", { name: /^나중에$|^Later$/i });
  for (let i = 0; i < 3; i += 1) {
    if (!(await later.first().isVisible({ timeout: 1500 }).catch(() => false))) break;
    await later.first().click({ timeout: 5000 }).catch(() => undefined);
    await waitMs(page, 300);
  }
}

async function main() {
  const auth = await signInSession();
  console.log(`[baseline] signed in as ${auth.loginId} (${auth.email}) user=${auth.userId?.slice(0, 8)}…`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.addCookies(auth.cookies);
  await context.addInitScript((kinds) => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
      localStorage.setItem("samarket.app.language", "ko");
      for (const k of kinds) {
        localStorage.setItem(`dibay.permission.${k}.guideSeen`, "1");
      }
      sessionStorage.removeItem("samarket.trade-chat-entry");
      sessionStorage.removeItem("samarket:debug:e2e:tradeC2cPhaseLastMs");
    } catch {
      /* ignore */
    }
  }, PERMISSION_GUIDE_PRESEED_KINDS);
  const page = await context.newPage();

  await page.evaluate(() => {
    try {
      for (const k of Object.keys(sessionStorage)) {
        if (/trade|post.*list|home.*feed/i.test(k)) sessionStorage.removeItem(k);
      }
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${baseUrl}/market`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await waitMs(page, 3500);
  await dismissPermissionGuides(page);
  let afterMarket = await readSnap(page);
  if (pickMs(afterMarket, "trade_list_total_ms") == null) {
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
    await waitMs(page, 4000);
    afterMarket = await readSnap(page);
  }

  const postLinks = page.locator('a[href^="/post/"]');
  const postCount = await postLinks.count().catch(() => 0);
  let afterDetail = afterMarket;
  let afterChatOpen = afterMarket;
  const hasPost = postCount > 0;
  const maxPostsToTry = Math.min(postCount, 6);
  let chatRoomCapture = {
    chat_compose_url_seen: false,
    chat_room_url_reached: false,
    chat_room_url: null,
    chat_wait_for_room_ms: null,
    failure_reason: "chat_not_attempted",
  };

  for (let i = 0; i < maxPostsToTry && !chatRoomCapture.chat_room_url_reached; i += 1) {
    await page.goto(`${baseUrl}/market`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await waitMs(page, 2000);
    await dismissPermissionGuides(page);
    const link = postLinks.nth(i);
    if (!(await link.isVisible({ timeout: 8_000 }).catch(() => false))) continue;
    await link.click();
    await page.waitForURL(/\/post\//, { timeout: 45_000 }).catch(() => undefined);
    await waitMs(page, 2000);
    if (!page.url().includes("/post/")) continue;
    afterDetail = await readSnap(page);

    const chatBtn = page.getByRole("button", { name: /채팅하기|채팅 이어가기|Chat/i }).first();
    if (!(await chatBtn.isVisible({ timeout: 8_000 }).catch(() => false))) continue;
    if (!(await chatBtn.isEnabled().catch(() => false))) continue;
    const chatClickAt = Date.now();
    await chatBtn.click();
    chatRoomCapture = await waitForMessengerRoomAfterChatClick(page, chatClickAt);
    if (!chatRoomCapture.chat_room_url_reached) {
      console.warn(
        `[baseline] post#${i + 1} room URL 미도달 — compose_seen=${chatRoomCapture.chat_compose_url_seen} url=${chatRoomCapture.chat_room_url}`
      );
      continue;
    }
    await waitMs(page, POST_ROOM_SETTLE_MS);
    await waitForTradeMetric(page, "chat_click_to_room_ready_ms", 35_000);
    afterChatOpen = await readSnap(page);
    console.log(
      `[baseline] room URL 도달 wait=${chatRoomCapture.chat_wait_for_room_ms}ms compose_seen=${chatRoomCapture.chat_compose_url_seen}`
    );
    break;
  }

  if (!chatRoomCapture.chat_room_url_reached && chatRoomCapture.failure_reason === "chat_not_attempted") {
    chatRoomCapture.failure_reason = hasPost
      ? roomWaitFailureReason(chatRoomCapture.chat_compose_url_seen)
      : "no_post_link";
  }

  await page.goto(`${baseUrl}/community-messenger/trade-chats`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await waitMs(page, 2500);
  await dismissPermissionGuides(page);
  const tradeRows = page.locator('[data-messenger-chat-row="true"]');
  await tradeRows.first().waitFor({ state: "visible", timeout: 90_000 }).catch(() => undefined);
  await waitMs(page, 2000);
  const afterTradeList = await readSnap(page);

  const firstRowTap = tradeRows.first().locator('div[role="button"]').first();
  let afterReenter = afterTradeList;
  if (await firstRowTap.isVisible({ timeout: 8_000 }).catch(() => false)) {
    await dismissPermissionGuides(page);
    await firstRowTap.click({ timeout: 15_000 }).catch(() => undefined);
    await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 60_000 }).catch(() => undefined);
    await waitMs(page, 1500);
    const ta = page.locator("textarea").first();
    if (await ta.isVisible({ timeout: 15_000 }).catch(() => false)) {
      await ta.fill(`baseline-${Date.now()}`);
      await dismissPermissionGuides(page);
      const sendBtn = page.getByRole("button", { name: /^전송$|^Send$/i }).first();
      if (await sendBtn.isVisible().catch(() => false)) {
        await sendBtn.click({ timeout: 15_000 }).catch(() => undefined);
      }
      await waitMs(page, 800);
    }
    await page.goBack({ waitUntil: "domcontentloaded" }).catch(() => undefined);
    await tradeRows.first().waitFor({ state: "visible", timeout: 45_000 }).catch(() => undefined);
    await waitMs(page, 1000);
    if (await firstRowTap.isVisible().catch(() => false)) {
      await dismissPermissionGuides(page);
      await firstRowTap.click({ timeout: 15_000 }).catch(() => undefined);
      await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 60_000 }).catch(() => undefined);
      await waitMs(page, 1000);
    }
    afterReenter = await readSnap(page);
  }

  await page.evaluate(() => {
    const used = performance?.memory?.usedJSHeapSize;
    if (typeof used !== "number" || !Number.isFinite(used)) return;
    const mb = used / (1024 * 1024);
    const key = "__samarketAppWidePhaseLastMs";
    const g = globalThis;
    if (!g[key]) g[key] = {};
    g[key].trade_memory_heap_used_mb = Math.round(mb * 10) / 10;
  });
  const finalSnap = await readSnap(page);

  await page.goto(`${baseUrl}/market`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await waitMs(page, 3500);
  const afterMarketFinal = await readSnap(page);
  const listMs =
    pickMs(afterMarket, "trade_list_total_ms") ??
    pickMs(afterMarketFinal, "trade_list_total_ms") ??
    pickMs(afterMarketFinal, "trade_list_to_paint_ms") ??
    pickMs(afterMarketFinal, "trade_list_fetch_ms");
  const listBytes =
    pickMs(afterMarket, "trade_list_payload_bytes") ?? pickMs(afterMarketFinal, "trade_list_payload_bytes");
  const listMsSource =
    pickMs(afterMarket, "trade_list_total_ms") != null || pickMs(afterMarketFinal, "trade_list_total_ms") != null
      ? "trade_list_total_ms"
      : pickMs(afterMarketFinal, "trade_list_to_paint_ms") != null
        ? "trade_list_to_paint_ms(proxy)"
        : pickMs(afterMarketFinal, "trade_list_fetch_ms") != null
          ? "trade_list_fetch_ms(proxy)"
          : null;

  const metrics = {
    trade_list_total_ms: listMs,
    trade_list_payload_bytes: listBytes,
    trade_detail_total_ms: pickMs(afterDetail, "trade_detail_total_ms"),
    chat_compose_url_seen: chatRoomCapture.chat_compose_url_seen,
    chat_room_url_reached: chatRoomCapture.chat_room_url_reached,
    chat_room_url: chatRoomCapture.chat_room_url,
    chat_wait_for_room_ms: chatRoomCapture.chat_wait_for_room_ms,
    chat_click_to_compose_route_ms: pickMs(afterChatOpen, "chat_click_to_compose_route_ms"),
    compose_route_to_resolve_fetch_start_ms: pickMs(
      afterChatOpen,
      "compose_route_to_resolve_fetch_start_ms"
    ),
    trade_chat_resolve_fetch_ms: pickMs(afterChatOpen, "trade_chat_resolve_fetch_ms"),
    resolve_done_to_prefetch_start_ms: pickMs(afterChatOpen, "resolve_done_to_prefetch_start_ms"),
    room_prefetch_wall_ms: pickMs(afterChatOpen, "room_prefetch_wall_ms"),
    room_prefetch_hit: pickMs(afterChatOpen, "room_prefetch_hit"),
    prefetch_done_to_router_replace_ms: pickMs(afterChatOpen, "prefetch_done_to_router_replace_ms"),
    router_replace_to_room_url_ms: pickMs(afterChatOpen, "router_replace_to_room_url_ms"),
    room_url_to_rsc_ready_ms: pickMs(afterChatOpen, "room_url_to_rsc_ready_ms"),
    room_rsc_to_bootstrap_fetch_start_ms: pickMs(afterChatOpen, "room_rsc_to_bootstrap_fetch_start_ms"),
    cm_room_bootstrap_total_ms: pickMs(afterChatOpen, "cm_room_bootstrap_total_ms"),
    room_bootstrap_to_shell_ready_ms: pickMs(afterChatOpen, "room_bootstrap_to_shell_ready_ms"),
    room_bootstrap_done_to_shell_mount_ms: pickMs(afterChatOpen, "room_bootstrap_done_to_shell_mount_ms"),
    phase1_total_ms: pickMs(afterChatOpen, "phase1_total_ms"),
    phase1_bootstrap_normalize_ms: pickMs(afterChatOpen, "phase1_bootstrap_normalize_ms"),
    phase1_messages_normalize_ms: pickMs(afterChatOpen, "phase1_messages_normalize_ms"),
    phase1_participants_normalize_ms: pickMs(afterChatOpen, "phase1_participants_normalize_ms"),
    phase1_store_hydration_ms: pickMs(afterChatOpen, "phase1_store_hydration_ms"),
    phase1_read_state_init_ms: pickMs(afterChatOpen, "phase1_read_state_init_ms"),
    phase1_unread_state_init_ms: pickMs(afterChatOpen, "phase1_unread_state_init_ms"),
    phase1_realtime_prepare_ms: pickMs(afterChatOpen, "phase1_realtime_prepare_ms"),
    phase1_presence_prepare_ms: pickMs(afterChatOpen, "phase1_presence_prepare_ms"),
    phase1_memo_compute_ms: pickMs(afterChatOpen, "phase1_memo_compute_ms"),
    phase1_large_array_count: pickMs(afterChatOpen, "phase1_large_array_count"),
    phase1_initial_message_count: pickMs(afterChatOpen, "phase1_initial_message_count"),
    phase1_blocking_task_ms: pickMs(afterChatOpen, "phase1_blocking_task_ms"),
    room_shell_mount_to_first_message_ready_ms: pickMs(
      afterChatOpen,
      "room_shell_mount_to_first_message_ready_ms"
    ),
    room_shell_mount_to_header_ready_ms: pickMs(afterChatOpen, "room_shell_mount_to_header_ready_ms"),
    room_shell_mount_to_realtime_ready_ms: pickMs(afterChatOpen, "room_shell_mount_to_realtime_ready_ms"),
    room_shell_mount_to_presence_ready_ms: pickMs(afterChatOpen, "room_shell_mount_to_presence_ready_ms"),
    room_shell_mount_to_read_effect_ready_ms: pickMs(afterChatOpen, "room_shell_mount_to_read_effect_ready_ms"),
    room_shell_mount_to_snapshot_ready_ms: pickMs(afterChatOpen, "room_shell_mount_to_snapshot_ready_ms"),
    room_initial_message_count: pickMs(afterChatOpen, "room_initial_message_count"),
    room_initial_render_blocking_task_ms: pickMs(afterChatOpen, "room_initial_render_blocking_task_ms"),
    room_shell_ready_wait_reason: pickString(afterChatOpen, "room_shell_ready_wait_reason"),
    chat_click_to_room_ready_ms: pickMs(afterChatOpen, "chat_click_to_room_ready_ms"),
    trade_chat_resolve_ms: pickMs(afterChatOpen, "trade_chat_resolve_ms"),
    trade_chat_open_total_ms: pickMs(afterChatOpen, "trade_chat_open_total_ms"),
    trade_chat_bootstrap_ms: pickMs(afterChatOpen, "trade_chat_bootstrap_ms"),
    trade_chat_redirect_ms: pickMs(afterChatOpen, "trade_chat_redirect_ms"),
    cm_room_bootstrap_fetch_ms: pickMs(afterChatOpen, "cm_room_bootstrap_fetch_ms"),
    cm_room_bootstrap_payload_ms: pickMs(afterChatOpen, "cm_room_bootstrap_payload_ms"),
    cm_room_bootstrap_cache_hit: pickMs(afterChatOpen, "cm_room_bootstrap_cache_hit"),
    route_compile_ms: pickMs(afterChatOpen, "route_compile_ms"),
    permission_modal_block_ms: pickMs(afterChatOpen, "permission_modal_block_ms"),
    failure_reason: chatRoomCapture.chat_room_url_reached ? null : chatRoomCapture.failure_reason,
    trade_chat_duplicate_room_guard_ms: pickMs(afterReenter, "trade_chat_duplicate_room_guard_ms"),
    trade_realtime_subscribe_count: pickMs(afterTradeList, "trade_realtime_subscribe_count"),
    trade_realtime_unsubscribe_count: pickMs(afterTradeList, "trade_realtime_unsubscribe_count"),
    trade_realtime_debounce_unsubscribe_count: pickMs(
      afterTradeList,
      "trade_realtime_debounce_unsubscribe_count"
    ),
    trade_memory_heap_used_mb: pickMs(finalSnap, "trade_memory_heap_used_mb"),
    capturedAt: new Date().toISOString(),
    origin: baseUrl,
    auth: { loginId: auth.loginId, userIdTail: auth.userId?.slice(-8) },
    scenarios: {
      hasPost,
      tradeRowCount: await tradeRows.count().catch(() => 0),
      trade_list_ms_source: listMsSource,
      room_wait_timeout_ms: ROOM_WAIT_TIMEOUT_MS,
      post_room_settle_ms: POST_ROOM_SETTLE_MS,
      env: "local dev, qqqq@manual.local, mobile 390px",
    },
  };

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ trade_c2c_baseline: metrics }, null, 2), "utf8");
  console.log("\n=== TRADE_C2C_BASELINE ===\n", JSON.stringify({ trade_c2c_baseline: metrics }, null, 2));
  console.log(`\n[wrote] ${outFile}\n`);

  await browser.close();
  if (metrics.trade_list_total_ms == null) {
    console.warn("[baseline] trade_list_total_ms 미기록 — trade_list_to_paint_ms·RSC 시드 여부 확인");
  }
  if (!metrics.chat_room_url_reached) {
    console.warn(`[baseline] 실패: ${metrics.failure_reason ?? "room_url_not_reached"}`);
  }
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
