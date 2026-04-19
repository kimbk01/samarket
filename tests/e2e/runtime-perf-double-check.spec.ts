/**
 * sessionStorage `samarket:debug:runtime=1` + window 스냅샷으로 실측 수치 수집.
 * 실행: E2E_TEST_USERNAME / E2E_TEST_PASSWORD 설정 후
 *   npx playwright test tests/e2e/runtime-perf-double-check.spec.ts
 */
import { test, expect } from "@playwright/test";

type Snap = {
  appWidePhaseLastMs?: Record<string, number>;
  messengerRenderPerf?: Record<string, number>;
  appWidePerf?: Record<string, number>;
};

async function readSnap(page: import("@playwright/test").Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const w = window as unknown as {
      getMessengerHomeVerificationSnapshot?: () => Snap;
    };
    return w.getMessengerHomeVerificationSnapshot?.() ?? null;
  });
}

function pickMs(s: Snap | null, key: string): number | null {
  const v = s?.appWidePhaseLastMs?.[key];
  return typeof v === "number" ? v : null;
}

function pickPerf(s: Snap | null, key: string): number | null {
  const v = s?.messengerRenderPerf?.[key];
  return typeof v === "number" ? v : null;
}

/**
 * `TestLoginBar` 와 동일 경로 — HttpOnly 쿠키 + sessionStorage `test_user_id` 등 + pub 쿠키.
 * fetch 만 호출하면 메신저 등 클라이언트 게이트에서 미로그인으로 남을 수 있음.
 */
async function testLoginViaUi(
  page: import("@playwright/test").Page,
  baseURL: string,
  username: string,
  password: string
): Promise<void> {
  await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });
  const region = page.getByRole("region", { name: "아이디 로그인" });
  await region.waitFor({ state: "visible", timeout: 15_000 });
  await region.getByPlaceholder("아이디").fill(username);
  await region.getByPlaceholder("비밀번호").fill(password);
  await Promise.all([
    page.waitForURL((u) => u.pathname === "/home" || u.pathname.startsWith("/mypage"), { timeout: 60_000 }),
    region.getByRole("button", { name: "로그인" }).click(),
  ]);
}

async function runScenarioBlock(
  page: import("@playwright/test").Page,
  baseURL: string,
  runLabel: string
): Promise<Record<string, unknown>> {
  const rows: Record<string, unknown> = { run: runLabel };

  await page.goto(`${baseURL}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  let s = await readSnap(page);
  rows.after_home_trade = {
    auth_session_resolve_ms: pickMs(s, "auth_session_resolve_ms"),
    profile_resolve_ms: pickMs(s, "profile_resolve_ms"),
    trade_list_fetch_ms: pickMs(s, "trade_list_fetch_ms"),
    community_list_fetch_ms: pickMs(s, "community_list_fetch_ms"),
    messenger_list_fetch_ms: pickMs(s, "messenger_list_fetch_ms"),
  };

  await page.goto(`${baseURL}/philife`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  s = await readSnap(page);
  rows.after_philife_community = {
    trade_list_fetch_ms: pickMs(s, "trade_list_fetch_ms"),
    community_list_fetch_ms: pickMs(s, "community_list_fetch_ms"),
    messenger_list_fetch_ms: pickMs(s, "messenger_list_fetch_ms"),
  };

  await page.goto(`${baseURL}/community-messenger`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForResponse(
      (r) => r.url().includes("/api/community-messenger/bootstrap") && r.request().method() === "GET",
      { timeout: 90_000 }
    );
  } catch {
    /* bootstrap 없을 수 있음 */
  }
  await page.waitForLoadState("networkidle", { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(3500);
  s = await readSnap(page);
  rows.after_messenger_home = {
    messenger_list_fetch_ms: pickMs(s, "messenger_list_fetch_ms"),
    messenger_room_list_sort: pickPerf(s, "messenger_room_list_sort"),
    messenger_room_list_filter: pickPerf(s, "messenger_room_list_filter"),
    messenger_room_summary_merge: pickPerf(s, "messenger_room_summary_merge"),
    messenger_badge_compute: pickPerf(s, "messenger_badge_compute"),
    messenger_home_render: pickPerf(s, "messenger_home_render"),
    messenger_home_list_render: pickPerf(s, "messenger_home_list_render"),
    messenger_room_row_render: pickPerf(s, "messenger_room_row_render"),
    appWide_list_sort: s?.appWidePerf?.list_sort ?? null,
    appWide_list_filter: s?.appWidePerf?.list_filter ?? null,
    appWide_summary_merge: s?.appWidePerf?.summary_merge ?? null,
    appWide_badge_compute: s?.appWidePerf?.badge_compute ?? null,
  };

  const roomLink = page.locator('a[href^="/community-messenger/rooms/"]').first();
  const roomCount = await roomLink.count().catch(() => 0);
  if (roomCount > 0) {
    const href = await roomLink.getAttribute("href");
    const m = href?.match(/\/community-messenger\/rooms\/([^/?#]+)/);
    const roomId = m?.[1] ? decodeURIComponent(m[1]) : null;

    await roomLink.click();
    await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 30_000 });
    await page.waitForTimeout(600);
    await page.goBack({ waitUntil: "domcontentloaded" });
    await page.locator('a[href^="/community-messenger/rooms/"]').first().waitFor({ state: "visible", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(400);

    await page.locator('a[href^="/community-messenger/rooms/"]').first().click();
    await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 30_000 });
    await page.waitForTimeout(500);
    rows.messenger_room_reenter = "ok";

    if (roomId) {
      await page.goto(`${baseURL}/chats/${encodeURIComponent(roomId)}?source=chat_room`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1200);
      const ta = page.locator("textarea").first();
      await ta.waitFor({ state: "visible", timeout: 25_000 }).catch(() => {});
      await ta.click({ timeout: 10_000 }).catch(() => {});
      await page.keyboard.type("a", { delay: 15 });
      await page.waitForTimeout(100);
      await page.keyboard.type("bc", { delay: 10 });
      await page.keyboard.press("Control+v").catch(() => {});
      await page.waitForTimeout(200);
      s = await readSnap(page);
      rows.after_chat_input = {
        keydown_to_commit_ms: pickMs(s, "keydown_to_commit_ms"),
        keydown_to_paint_ms: pickMs(s, "keydown_to_paint_ms"),
      };
    } else {
      rows.after_chat_input = { note: "roomId_parse_fail" };
    }
  } else {
    rows.messenger_room_reenter = "skip_no_room_link";
    rows.after_chat_input = { note: "skip_no_room" };
  }

  await page.goto(`${baseURL}/home`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  await page.goto(`${baseURL}/philife`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);

  try {
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.waitForTimeout(200);
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  } catch {
    rows.visibility_toggle = "js_failed";
  }
  await page.waitForTimeout(300);
  s = await readSnap(page);
  rows.after_visibility = {
    visibility_resume_count: s?.appWidePerf?.visibility_resume ?? null,
  };

  return rows;
}

test.describe("runtime perf double-check (실측)", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("samarket:debug:runtime", "1");
      } catch {
        /* ignore */
      }
    });
  });

  test("2회 시나리오 — 스냅샷 표 출력", async ({ page, baseURL }) => {
    test.setTimeout(240_000);
    const user = process.env.E2E_TEST_USERNAME?.trim() ?? "";
    const pass = process.env.E2E_TEST_PASSWORD ?? "";
    test.skip(!user || !pass, "E2E_TEST_USERNAME / E2E_TEST_PASSWORD 필요");

    const origin = baseURL ?? "http://localhost:3000";
    await testLoginViaUi(page, origin, user as string, pass);

    const out: Record<string, unknown>[] = [];
    for (let i = 1; i <= 2; i++) {
      const block = await runScenarioBlock(page, origin, `run_${i}`);
      out.push(block);
    }

    // eslint-disable-next-line no-console
    console.log("\n=== RUNTIME_PERF_DOUBLE_CHECK_JSON ===\n", JSON.stringify(out, null, 2), "\n=== END ===\n");
    expect(out.length).toBe(2);
  });
});
