/**
 * 홈·상품상세·채팅방·메시지 전송 ACK — 네트워크 + 렌더 스냅샷 수집 (실측 비교용).
 *
 * PLAYWRIGHT_NO_WEBSERVER=1 npx playwright test tests/e2e/bootstrap-structure-verification.spec.ts
 *
 * 출력: 한 줄 `BOOTSTRAP_VERIFICATION_JSON:` + JSON (stdout 파싱용)
 */
import { expect, test } from "@playwright/test";
import { classifyCommunityMessengerRoomBootstrapCmReqSrc } from "@/lib/community-messenger/messenger-room-bootstrap";

type Snap = {
  appWidePhaseLastMs?: Record<string, number>;
};

function pickMs(s: Snap | null, key: string): number | null {
  const v = s?.appWidePhaseLastMs?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function readSnap(page: import("@playwright/test").Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const w = window as unknown as { getMessengerHomeVerificationSnapshot?: () => Snap };
    return w.getMessengerHomeVerificationSnapshot?.() ?? null;
  });
}

async function testLoginViaFetch(
  page: import("@playwright/test").Page,
  baseURL: string,
  username: string,
  password: string
): Promise<void> {
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  let ok = false;
  for (let i = 0; i < 3 && !ok; i += 1) {
    if (i > 0) await page.waitForTimeout(600);
    ok = await page.evaluate(
      async ({ origin, user, pass }) => {
        try {
          const res = await fetch(`${origin}/api/test-login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ username: user, password: pass }),
          });
          const data = (await res.json()) as { ok?: boolean; userId?: string; username?: string; role?: string };
          if (!data?.ok || !data.userId || !data.username) return false;
          sessionStorage.setItem("test_user_id", data.userId);
          sessionStorage.setItem("test_username", data.username);
          sessionStorage.setItem("test_role", data.role || "member");
          document.cookie = `kasama_dev_uid_pub=${encodeURIComponent(data.userId)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
          window.dispatchEvent(new Event("kasama-test-auth-changed"));
          return true;
        } catch {
          return false;
        }
      },
      { origin: baseURL, user: username, pass: password }
    );
  }
  expect(ok).toBe(true);
}

function pickPhaseMap(page: import("@playwright/test").Page): Promise<Record<string, number> | null> {
  return page.evaluate(() => {
    const w = window as typeof window & { __samarketAppWidePhaseLastMs?: Record<string, number> };
    return w.__samarketAppWidePhaseLastMs ?? null;
  });
}

function pickMsPhase(phaseMap: Record<string, number> | null, key: string): number | null {
  const v = phaseMap?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

type RequestLog = { url: string; method: string; ts: number };

function attachRequestLog(page: import("@playwright/test").Page, out: RequestLog[]) {
  const onReq = (req: import("@playwright/test").Request) => {
    try {
      out.push({ url: req.url(), method: req.method(), ts: Date.now() });
    } catch {
      /* ignore */
    }
  };
  page.on("request", onReq);
  return () => page.off("request", onReq);
}

function countMatches(logs: RequestLog[], pred: (u: string) => boolean): number {
  let n = 0;
  for (const r of logs) {
    if (pred(r.url)) n += 1;
  }
  return n;
}

function filterBetween(logs: RequestLog[], t0: number, t1: number): RequestLog[] {
  return logs.filter((r) => r.ts >= t0 && r.ts <= t1);
}

function messengerRoomBootstrapCmReqSrcRaw(url: string): string | null {
  const m = url.match(/[?&]cmReqSrc=([^&]*)/);
  return m?.[1] ? decodeURIComponent(m[1]) : null;
}

function messengerRoomBootstrapCmReqSrcBucket(url: string): string {
  return classifyCommunityMessengerRoomBootstrapCmReqSrc(messengerRoomBootstrapCmReqSrcRaw(url));
}

function isRoomClientBootstrapFamilyUrl(url: string): boolean {
  const b = messengerRoomBootstrapCmReqSrcBucket(url);
  return (
    b === "room_client" ||
    b === "room_client_legacy" ||
    b === "room_client_block" ||
    b === "room_client_primed_followup"
  );
}

async function measureHome(page: import("@playwright/test").Page, origin: string) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
    } catch {
      /* ignore */
    }
  });
  await page.addInitScript(() => {
    const w = window as typeof window & {
      __tradeListRenderProbeInstalled?: boolean;
      __tradeListRenderProbe?: {
        firstItemRenderMs: number | null;
        fullRenderMs: number | null;
        toPaintMs: number | null;
      };
    };
    if (w.__tradeListRenderProbeInstalled) return;
    w.__tradeListRenderProbeInstalled = true;
    w.__tradeListRenderProbe = {
      firstItemRenderMs: null,
      fullRenderMs: null,
      toPaintMs: null,
    };
    const selector = 'a[href^="/post/"]';
    let settleTimer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;
    const finish = () => {
      const probe = w.__tradeListRenderProbe;
      if (!probe || probe.fullRenderMs != null) return;
      const links = document.querySelectorAll(selector);
      if (links.length <= 0 || probe.firstItemRenderMs == null) return;
      probe.fullRenderMs = Math.round(performance.now());
      const done = () => {
        if (!w.__tradeListRenderProbe || w.__tradeListRenderProbe.toPaintMs != null) return;
        w.__tradeListRenderProbe.toPaintMs = Math.round(performance.now());
      };
      if (typeof requestAnimationFrame !== "function") {
        queueMicrotask(done);
      } else {
        requestAnimationFrame(() => {
          requestAnimationFrame(done);
        });
      }
      if (observer) observer.disconnect();
    };
    const scheduleFinish = () => {
      if (settleTimer != null) clearTimeout(settleTimer);
      settleTimer = setTimeout(finish, 350);
    };
    const sample = () => {
      const probe = w.__tradeListRenderProbe;
      if (!probe) return;
      const links = document.querySelectorAll(selector);
      if (links.length > 0 && probe.firstItemRenderMs == null) {
        probe.firstItemRenderMs = Math.round(performance.now());
      }
      if (links.length > 0) {
        scheduleFinish();
      }
    };
    const start = () => {
      observer = new MutationObserver(sample);
      observer.observe(document.documentElement, { childList: true, subtree: true });
      sample();
      setTimeout(() => {
        if (observer) observer.disconnect();
        finish();
      }, 15_000);
    };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  });
  const logs: RequestLog[] = [];
  const detach = attachRequestLog(page, logs);
  const navStart = Date.now();
  await page.goto(`${origin}/home`, { waitUntil: "domcontentloaded" });
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const w = window as typeof window & {
            __tradeListRenderProbe?: { toPaintMs: number | null };
          };
          return w.__tradeListRenderProbe?.toPaintMs ?? null;
        }),
      { timeout: 25_000 }
    )
    .not.toBeNull();
  await page.waitForTimeout(400);
  const navEnd = Date.now();
  detach();
  const phase = await pickPhaseMap(page);
  const slice = filterBetween(logs, navStart, navEnd);
  const probePaint = await page.evaluate(() => {
    const w = window as typeof window & { __tradeListRenderProbe?: { toPaintMs: number | null } };
    return w.__tradeListRenderProbe?.toPaintMs ?? null;
  });
  return {
    time_ms: probePaint ?? pickMsPhase(phase, "trade_list_to_paint_ms"),
    request_count: slice.length,
    main_bottom_nav_get_count: countMatches(slice, (u) => u.includes("/api/app/main-bottom-nav")),
  };
}

async function measureProductDetail(page: import("@playwright/test").Page, origin: string) {
  const logs: RequestLog[] = [];
  const detach = attachRequestLog(page, logs);
  await page.goto(`${origin}/home`, { waitUntil: "domcontentloaded" });
  const link = page.locator('a[href^="/post/"]').first();
  await link.waitFor({ state: "visible", timeout: 30_000 });
  const t0 = Date.now();
  await link.click();
  await page.waitForURL(/\/post\/[^/?#]+$/, { timeout: 30_000 });
  await page.locator("h2").first().waitFor({ state: "visible", timeout: 30_000 });
  const tHeading = Date.now();
  await page.waitForTimeout(800);
  const t1 = Date.now();
  detach();
  const snap = await readSnap(page);
  const slice = filterBetween(logs, t0, t1);
  const wall_ms = tHeading - t0;
  return {
    time_ms: pickMs(snap, "product_detail_first_content_render_ms"),
    wall_ms,
    route_total_ms: pickMs(snap, "product_detail_route_total_ms"),
    request_count: slice.length,
    public_profile_get_count: countMatches(slice, (u) => u.includes("/api/users/") && u.includes("/public-profile")),
    item_room_id_get_count: countMatches(slice, (u) => u.includes("/api/chat/item/room-id")),
  };
}

async function measureChatRoomEntry(page: import("@playwright/test").Page, origin: string) {
  await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded" });
  const roomRow = page.locator('[data-messenger-chat-row="true"]').first();
  await roomRow.waitFor({ state: "visible", timeout: 75_000 });
  const logs: RequestLog[] = [];
  const detach = attachRequestLog(page, logs);
  const tClick = Date.now();
  await roomRow.click();
  await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 45_000 });
  await page.locator("textarea").first().waitFor({ state: "visible", timeout: 45_000 });
  const textareaAt = Date.now();
  const composer_wall_ms = textareaAt - tClick;
  await page.waitForTimeout(800);
  detach();
  const snap = await readSnap(page);
  const slice = filterBetween(logs, tClick, Date.now());
  const bootstrapReqs = slice.filter(
    (r) => r.method === "GET" && r.url.includes("/api/community-messenger/rooms/") && r.url.includes("/bootstrap")
  );
  const firstListPrefetchAt = bootstrapReqs.find((r) => messengerRoomBootstrapCmReqSrcBucket(r.url) === "list_prefetch")?.ts ?? null;
  const roomClientBlockReqs = bootstrapReqs.filter((r) => messengerRoomBootstrapCmReqSrcBucket(r.url) === "room_client_block");
  const roomClientPrimedReqs = bootstrapReqs.filter(
    (r) => messengerRoomBootstrapCmReqSrcBucket(r.url) === "room_client_primed_followup"
  );
  const roomClientLegacyTagReqs = bootstrapReqs.filter((r) => messengerRoomBootstrapCmReqSrcBucket(r.url) === "room_client_legacy");
  const roomClientBareLegacyReqs = bootstrapReqs.filter((r) => messengerRoomBootstrapCmReqSrcBucket(r.url) === "room_client");
  const roomBootstrapLegacyAbsentReqs = bootstrapReqs.filter(
    (r) => messengerRoomBootstrapCmReqSrcBucket(r.url) === "legacy_absent"
  );
  const roomClientReqs = bootstrapReqs.filter((r) => isRoomClientBootstrapFamilyUrl(r.url));
  const roomSilentReqs = bootstrapReqs.filter((r) => messengerRoomBootstrapCmReqSrcBucket(r.url) === "room_silent");
  const firstRoomClientBlockBootstrapAt = roomClientBlockReqs.length > 0 ? roomClientBlockReqs[0]!.ts : null;
  const firstRoomClientPrimedFollowupBootstrapAt =
    roomClientPrimedReqs.length > 0 ? roomClientPrimedReqs[0]!.ts : null;
  const firstRoomClientBootstrapAt = roomClientReqs.length > 0 ? roomClientReqs[0]!.ts : null;
  const firstRoomSilentBootstrapAt = roomSilentReqs.length > 0 ? roomSilentReqs[0]!.ts : null;
  /** 레거시(태그 없음): 목록 프리패치가 아닌 첫 GET — 신규 빌드에서는 `first_room_client_bootstrap_ts` 를 본다 */
  const firstBootstrapUntaggedOrLegacy =
    bootstrapReqs.find((r) => messengerRoomBootstrapCmReqSrcBucket(r.url) !== "list_prefetch")?.ts ?? null;
  const blockingMetric = pickMs(snap, "messenger_room_entry_room_bootstrap_request_start_ms");
  const primedFollowupMetric = pickMs(snap, "messenger_room_entry_room_bootstrap_primed_followup_request_start_ms");
  const roomClientPerfEntryShape =
    blockingMetric != null
      ? "blocking_seed"
      : primedFollowupMetric != null
        ? "primed_followup"
        : roomClientReqs.length > 0
          ? "room_client_network_only"
          : "none";
  const bootstrapBeforeTextarea =
    firstRoomClientBlockBootstrapAt != null &&
    textareaAt != null &&
    firstRoomClientBlockBootstrapAt < textareaAt;
  return {
    time_ms: pickMs(snap, "messenger_room_entry_to_paint_ms"),
    composer_wall_ms,
    first_message_render_ms: pickMs(snap, "messenger_room_entry_first_message_render_ms"),
    request_count: slice.length,
    room_bootstrap_get_count: countMatches(
      slice,
      (u) => u.includes("/api/community-messenger/rooms/") && u.includes("/bootstrap")
    ),
    room_bootstrap_prefetch_get_count: countMatches(slice, (u) => messengerRoomBootstrapCmReqSrcBucket(u) === "list_prefetch"),
    room_bootstrap_room_client_get_count: roomClientReqs.length,
    room_bootstrap_room_client_block_get_count: roomClientBlockReqs.length,
    room_bootstrap_room_client_primed_followup_get_count: roomClientPrimedReqs.length,
    room_bootstrap_room_client_legacy_tag_get_count: roomClientLegacyTagReqs.length,
    room_bootstrap_room_client_bare_legacy_get_count: roomClientBareLegacyReqs.length,
    room_bootstrap_legacy_absent_cm_req_src_get_count: roomBootstrapLegacyAbsentReqs.length,
    room_bootstrap_room_silent_get_count: roomSilentReqs.length,
    blocking_bootstrap_get_before_textarea: bootstrapBeforeTextarea,
    blocking_bootstrap_metrics_recorded: blockingMetric != null,
    primed_followup_bootstrap_metrics_recorded: primedFollowupMetric != null,
    messenger_room_entry_room_bootstrap_primed_followup_request_start_ms: primedFollowupMetric,
    room_client_perf_entry_shape: roomClientPerfEntryShape,
    first_bootstrap_client_ts: firstBootstrapUntaggedOrLegacy,
    first_list_prefetch_bootstrap_ts: firstListPrefetchAt,
    first_room_client_bootstrap_ts: firstRoomClientBootstrapAt,
    first_room_client_block_bootstrap_ts: firstRoomClientBlockBootstrapAt,
    first_room_client_primed_followup_bootstrap_ts: firstRoomClientPrimedFollowupBootstrapAt,
    first_room_silent_bootstrap_ts: firstRoomSilentBootstrapAt,
    textarea_visible_ts: textareaAt,
  };
}

async function measureMessageSendAck(page: import("@playwright/test").Page) {
  const ta = page.locator("textarea").first();
  await ta.waitFor({ state: "visible", timeout: 20_000 });
  await ta.fill(`ack-probe-${Date.now()}`);
  const sendBtn = page.locator("footer button:not([disabled])").last();
  await sendBtn.waitFor({ state: "visible", timeout: 15_000 });
  const t0 = Date.now();
  const resP = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.url().includes("/api/community-messenger/rooms/") &&
      r.url().includes("/messages") &&
      !r.url().includes("/sticker"),
    { timeout: 45_000 }
  );
  await sendBtn.click();
  const res = await resP;
  const t1 = Date.now();
  return {
    ack_ms: t1 - t0,
    status: res.status(),
  };
}

test("bootstrap structure verification snapshot", async ({ page, baseURL }) => {
  test.setTimeout(360_000);
  const user = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
  const pass = process.env.E2E_TEST_PASSWORD ?? "1234";
  const origin = baseURL ?? "http://localhost:3000";

  await page.context().addInitScript(() => {
    try {
      sessionStorage.setItem("samarket:debug:runtime", "1");
    } catch {
      /* ignore */
    }
  });

  await testLoginViaFetch(page, origin, user, pass);

  const home = await measureHome(page, origin);
  const product = await measureProductDetail(page, origin);
  const chat = await measureChatRoomEntry(page, origin);
  const ack = await measureMessageSendAck(page);

  const payload = {
    label: process.env.BOOTSTRAP_VERIFICATION_LABEL ?? "run",
    origin,
    home,
    product,
    chat,
    ack,
  };

  // eslint-disable-next-line no-console
  console.log("BOOTSTRAP_VERIFICATION_JSON:" + JSON.stringify(payload));
  expect(home.time_ms).not.toBeNull();
  expect(product.wall_ms).toBeGreaterThan(0);
  expect(chat.composer_wall_ms).toBeGreaterThan(0);
});
