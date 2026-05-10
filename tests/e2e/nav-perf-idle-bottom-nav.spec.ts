import { test, expect } from "@playwright/test";

/**
 * NAV-PERF-3: idle 후 첫 하단탭 클릭 vs 연속 클릭 — 브라우저 측정값을 터미널에 출력.
 *
 * 사전조건:
 * - `npm run dev` (localhost:3000)
 * - 메인 셸 탭은 로그인 세션 필요. `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` 로 test-login 시도.
 * - `POST /api/test-login` 이 410 이면(임시 테스트 로그인 비활성) 하단 네비까지 진입 불가 → 이 스크립트도 실패.
 * - `beforeEach` 가 `sessionStorage samarket:debug:runtime` + **`localStorage samarket:debug:navPerf`** 를 켜 `[nav-perf]` 이벤트를 수집합니다.
 *
 * 실행: `npm run measure:nav-perf`
 */

type NavPerfRow = Record<string, unknown>;

test.describe.configure({ timeout: 240_000 });

test.describe("nav-perf idle bottom-nav (터미널 덤프)", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("samarket:debug:runtime", "1");
        window.localStorage.setItem("samarket:debug:navPerf", "1");
      } catch {
        /* ignore */
      }
    });
  });

  test("시나리오 후 __NAV_PERF_EVENTS JSON 출력", async ({ page, baseURL }) => {
    test.setTimeout(240_000);

    const user = process.env.E2E_TEST_USERNAME?.trim();
    const pass = process.env.E2E_TEST_PASSWORD ?? "";

    const origin = baseURL ?? "http://localhost:3000";

    if (user && pass) {
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
      // eslint-disable-next-line no-console
      console.log("[nav-perf-e2e] test-login", loginResult ? "ok" : "failed — 비로그인으로 진행");
    } else {
      // eslint-disable-next-line no-console
      console.log("[nav-perf-e2e] E2E 자격 증명 없음 — 비로그인으로 진행");
    }

    await page.goto(`${origin}/market`, { waitUntil: "domcontentloaded" });

    const messengerTab = page.locator('a.app-bottom-nav-item[href^="/community-messenger"]').first();
    try {
      await messengerTab.waitFor({ state: "visible", timeout: 15_000 });
    } catch {
      throw new Error(
        `[nav-perf-e2e] 하단 네비(메신저 탭) 없음 — 현재 URL=${page.url()}. ` +
          `비로그인이면 proxy 가 /login 으로 보냅니다. ` +
          `POST /api/test-login 이 200(process.env·테스트 표면)일 때만 측정 가능합니다.`
      );
    }

    // 1–3: /market 에서 30초 idle
    await page.waitForTimeout(30_000);

    // 4: 메신저 탭
    await messengerTab.click();
    await page.waitForURL(/\/community-messenger/, { timeout: 60_000 });

    // 5: 스토어 탭 (바로 다음)
    await page.locator('a.app-bottom-nav-item[href="/stores"]').first().click();
    await page.waitForURL(/\/stores/, { timeout: 60_000 });

    // 7: 30초 idle
    await page.waitForTimeout(30_000);

    // 8: 마이페이지
    await page.locator('a.app-bottom-nav-item[href="/mypage"]').first().click();
    await page.waitForURL(/\/mypage/, { timeout: 60_000 });

    // 10: 거래(/market)
    await page.locator('a.app-bottom-nav-item[href="/market"]').first().click();
    await page.waitForURL(/\/market/, { timeout: 60_000 });

    // apis_sampled_1500ms 가 각 행에 붙을 시간
    await page.waitForTimeout(3500);

    const events = await page.evaluate(() => {
      const w = window as unknown as { __NAV_PERF_EVENTS?: NavPerfRow[] };
      return JSON.parse(JSON.stringify(w.__NAV_PERF_EVENTS ?? [])) as NavPerfRow[];
    });

    // eslint-disable-next-line no-console
    console.log("\n=== NAV_PERF_EVENTS (browser → terminal) ===");
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(events, null, 2));
    // eslint-disable-next-line no-console
    console.log("=== COUNT ===", events.length);
    // eslint-disable-next-line no-console
    console.log("=== END ===\n");

    expect(events.length, "nav-perf 이벤트 없음 — dev 빌드·하단탭 소스 bottom-nav 확인").toBeGreaterThanOrEqual(1);
  });
});
