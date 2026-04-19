/**
 * 메신저 실사용 시나리오 perf 스냅샷 — `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` + 방 1개 이상 필요.
 *
 * PLAYWRIGHT_NO_WEBSERVER=1 E2E_TEST_USERNAME=… E2E_TEST_PASSWORD=… \
 *   npx playwright test tests/e2e/messenger-scenario-perf-capture.spec.ts
 */
import { test, expect } from "@playwright/test";

type Snap = {
  messengerRenderPerf?: Record<string, number>;
  appWidePhaseLastMs?: Record<string, number>;
  appWidePerf?: Record<string, number>;
};

function pickMs(s: Snap | null, key: string): number | null {
  const v = s?.appWidePhaseLastMs?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function pickPerf(s: Snap | null, key: string): number | null {
  const v = s?.messengerRenderPerf?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function readSnap(page: import("@playwright/test").Page): Promise<Snap | null> {
  return page.evaluate(() => {
    const w = window as unknown as { getMessengerHomeVerificationSnapshot?: () => Snap };
    return w.getMessengerHomeVerificationSnapshot?.() ?? null;
  });
}

async function waitForStablePaint(page: import("@playwright/test").Page, ms = 400): Promise<void> {
  await page.waitForTimeout(ms);
}

test.describe("messenger scenario perf capture", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("samarket:debug:runtime", "1");
      } catch {
        /* ignore */
      }
    });
  });

  test("홈→방→뒤로→재입력→입력/전송 (스냅샷 JSON)", async ({ page, baseURL }) => {
    const user = process.env.E2E_TEST_USERNAME?.trim();
    const pass = process.env.E2E_TEST_PASSWORD ?? "";
    test.skip(!user || !pass, "E2E_TEST_USERNAME / E2E_TEST_PASSWORD 필요");

    const origin = baseURL ?? "http://127.0.0.1:3000";

    /**
     * UI `TestLoginBar` 는 성공 시 `/home` 으로 `assign` 해 `/home` 에서 부트스트랩이 먼저 나가
     * `goto(/community-messenger)` 직후 GET 레이스를 깨기 쉽다.
     * `fetch(test-login)` + sessionStorage 는 `messenger-home-render-perf.spec.ts` 와 동일하게 HttpOnly+클라 힌트를 맞춘다.
     */
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    const loginResult = await page.evaluate(
      async ({ o, username, password }) => {
        const r = await fetch(`${o}/api/test-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username, password }),
        });
        const data = (await r.json()) as { ok?: boolean; userId?: string; username?: string; role?: string };
        if (!data?.ok || !data.userId || !data.username) return false;
        try {
          sessionStorage.removeItem("samarket.messenger.bootstrap.v1");
        } catch {
          /* ignore */
        }
        sessionStorage.setItem("test_user_id", data.userId);
        sessionStorage.setItem("test_username", data.username);
        sessionStorage.setItem("test_role", data.role || "member");
        try {
          document.cookie = `kasama_dev_uid_pub=${encodeURIComponent(data.userId)}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
        } catch {
          /* ignore */
        }
        window.dispatchEvent(new Event("kasama-test-auth-changed"));
        return true;
      },
      { o: origin, username: user, password: pass }
    );
    expect(loginResult, "test-login + test auth 세션 실패 — test_users·표면 확인").toBe(true);

    await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded" });
    /** 프록시는 미인증 시 `/login` 으로만 보냄 — 여기서 걸러야 bootstrap 75초 헛대기를 막음 */
    await expect(page, "test-login 쿠키 없으면 /login — 동일 셸에서 E2E 재실행·계정 확인").toHaveURL(
      /\/community-messenger(\/|$|\?)/,
      { timeout: 20_000 }
    );
    const gateLogin = page.getByRole("heading", { name: "로그인", exact: true });
    if (new URL(page.url()).pathname.startsWith("/community-messenger") && (await gateLogin.isVisible().catch(() => false))) {
      throw new Error(
        "메신저 라우트에 로그인 게이트가 보임 — kasama 쿠키·test_users 계정 확인"
      );
    }
    /** 기본 리스트 행은 `MessengerChatListItem` 이 `Link` 가 아니라 `div[role=button]` 탭 — `a[href^=…]` 는 비어 있음 */
    const roomRows = page.locator('[data-messenger-chat-row="true"]');
    const firstRoomTap = roomRows.first().locator("div[role=\"button\"]").first();
    const homeEmpty = page.locator('[data-cm-home-empty-state="true"]');
    /**
     * `waitForResponse` 는 `goto` 직전에 걸면 메인 프레임 전환과 겹쳐 이벤트를 놓칠 수 있음(서버엔 200이 찍혀도 PW 타임아웃).
     * URL 확정 후 `race` 안에서만 건다.
     */
    await Promise.race([
      page.waitForResponse(
        (r) => r.url().includes("/api/community-messenger/bootstrap") && r.request().method() === "GET",
        { timeout: 75_000 }
      ),
      roomRows.first().waitFor({ state: "visible", timeout: 75_000 }),
      homeEmpty.waitFor({ state: "visible", timeout: 75_000 }),
    ]);
    if (await homeEmpty.isVisible().catch(() => false)) {
      throw new Error("메신저 채팅 목록이 비어 있음 — 방이 있는 E2E_TEST_USERNAME 계정으로 실행");
    }
    const roomCount = await roomRows.count();
    expect(roomCount, "방이 1개 이상 있어야 시나리오 측정 가능").toBeGreaterThan(0);

    await waitForStablePaint(page, 500);
    const homeFirst = await readSnap(page);
    expect(homeFirst, "getMessengerHomeVerificationSnapshot 없음").not.toBeNull();

    await firstRoomTap.click();
    await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 30_000 });
    const ta = page.locator("textarea").first();
    await ta.waitFor({ state: "visible", timeout: 30_000 });
    await waitForStablePaint(page, 400);
    const roomFirst = await readSnap(page);

    await page.goBack({ waitUntil: "domcontentloaded" });
    await roomRows.first().waitFor({ state: "visible", timeout: 30_000 });
    await waitForStablePaint(page, 300);
    const homeAfterBack = await readSnap(page);

    await firstRoomTap.click();
    await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 30_000 });
    await ta.waitFor({ state: "visible", timeout: 30_000 });
    await waitForStablePaint(page, 400);
    const roomReenter = await readSnap(page);

    await ta.fill("");
    await ta.pressSequentially("a", { delay: 30 });
    await waitForStablePaint(page, 120);
    const afterOneChar = await readSnap(page);

    await ta.pressSequentially("bcd", { delay: 20 });
    await waitForStablePaint(page, 120);
    const afterSeq = await readSnap(page);

    await ta.fill("paste-line-1\npaste-line-2");
    await waitForStablePaint(page, 120);
    const afterPaste = await readSnap(page);

    await ta.fill("sendprobe");
    await page.getByRole("button", { name: "전송" }).click();
    await waitForStablePaint(page, 400);
    const afterSend = await readSnap(page);

    const row = (label: string, s: Snap | null) => ({
      label,
      messenger_bootstrap_fetch_network_ms: pickMs(s, "messenger_bootstrap_fetch_network_ms"),
      messenger_bootstrap_to_paint_ms: pickMs(s, "messenger_bootstrap_to_paint_ms"),
      messenger_bootstrap_response_size_bytes: pickMs(s, "messenger_bootstrap_response_size_bytes"),
      messenger_bootstrap_json_parse_complete_ms: pickMs(s, "messenger_bootstrap_json_parse_complete_ms"),
      messenger_bootstrap_first_list_item_render_ms: pickMs(s, "messenger_bootstrap_first_list_item_render_ms"),
      messenger_bootstrap_full_list_render_ms: pickMs(s, "messenger_bootstrap_full_list_render_ms"),
      messenger_bootstrap_first_interactive_ms: pickMs(s, "messenger_bootstrap_first_interactive_ms"),
      keydown_to_commit_ms: pickMs(s, "keydown_to_commit_ms"),
      keydown_to_paint_ms: pickMs(s, "keydown_to_paint_ms"),
      messenger_home_render: pickPerf(s, "messenger_home_render"),
      messenger_home_list_render: pickPerf(s, "messenger_home_list_render"),
      messenger_room_row_render: pickPerf(s, "messenger_room_row_render"),
      chat_input_keydown: s?.appWidePerf?.chat_input_keydown ?? null,
      chat_input_state_commit: s?.appWidePerf?.chat_input_state_commit ?? null,
    });

    const report = {
      roomCount,
      homeFirst: row("1_messenger_home_first", homeFirst),
      roomFirst: row("2_room_first_enter", roomFirst),
      homeAfterBack: row("3_home_after_back", homeAfterBack),
      roomReenter: row("4_room_reenter", roomReenter),
      afterOneChar: row("5_input_one_char", afterOneChar),
      afterSeq: row("6_input_sequential", afterSeq),
      afterPaste: row("7_paste_simulated", afterPaste),
      afterSend: row("8_after_send_click", afterSend),
    };

    // eslint-disable-next-line no-console
    console.log("\n=== MESSENGER_SCENARIO_PERF_JSON ===\n" + JSON.stringify(report, null, 2) + "\n=== END ===\n");

    expect(pickPerf(homeFirst, "messenger_home_render")).toBeGreaterThan(0);
    expect(pickPerf(homeFirst, "messenger_home_list_render")).toBeGreaterThan(0);
  });
});
