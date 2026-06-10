import { test, expect } from "@playwright/test";
import { ensureE2eUserSession } from "./helpers/playwright-origin-and-session";

type FullSnap = Record<string, unknown> & {
  messengerRenderPerf?: Record<string, number>;
  realtimeStore?: Record<string, unknown>;
};

async function readFullSnapshot(page: import("@playwright/test").Page): Promise<FullSnap | null> {
  return page.evaluate(() => {
    const w = window as unknown as { getMessengerHomeVerificationSnapshot?: () => FullSnap };
    return w.getMessengerHomeVerificationSnapshot ? w.getMessengerHomeVerificationSnapshot() : null;
  });
}

test.describe("messenger home render perf (로그인·본문 마운트)", () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      try {
        sessionStorage.setItem("samarket:debug:runtime", "1");
      } catch {
        /* ignore */
      }
    });
  });

  test("렌더·스토어 스냅샷 — 로그인 필수", async ({ page, baseURL }) => {
    const user = process.env.E2E_TEST_USERNAME?.trim();
    const pass = process.env.E2E_TEST_PASSWORD ?? "";
    test.skip(!user || !pass, "E2E_TEST_USERNAME / E2E_TEST_PASSWORD 환경변수로 test-login 가능한 계정 필요");

    const origin = baseURL ?? "http://localhost:3000";
    await ensureE2eUserSession(page, { username: user, password: pass });
    await page.evaluate(() => {
      try {
        sessionStorage.removeItem("samarket.messenger.bootstrap.v1");
      } catch {
        /* ignore */
      }
    });

    await page.goto(`${baseURL ?? "http://localhost:3000"}/community-messenger`, { waitUntil: "domcontentloaded" });
    await page.waitForResponse(
      (r) => r.url().includes("/api/community-messenger/bootstrap") && r.request().method() === "GET",
      { timeout: 60_000 }
    );

    const roomRow = page.locator('[data-messenger-chat-row="true"]').first();
    await roomRow.waitFor({ state: "visible", timeout: 60_000 });

    const snapAfterList = await readFullSnapshot(page);
    expect(snapAfterList, "getMessengerHomeVerificationSnapshot 없음").not.toBeNull();
    const perf0 = snapAfterList!.messengerRenderPerf ?? {};
    expect(
      Number(perf0.messenger_home_render ?? 0),
      "메신저 홈 본문 미마운트(messenger_home_render=0) — 로그인·호스트·경로 확인"
    ).toBeGreaterThan(0);
    expect(Number(perf0.messenger_home_list_render ?? 0)).toBeGreaterThan(0);

    for (let i = 0; i < 3; i++) {
      const row = page.locator('[data-messenger-chat-row="true"]').nth(i);
      if ((await row.count()) === 0) break;
      await row.click();
      await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 30_000 });
      await page.goBack({ waitUntil: "domcontentloaded" });
      await roomRow.waitFor({ state: "visible", timeout: 30_000 });
    }

    await page.goto(`${baseURL ?? "http://localhost:3000"}/philife`, { waitUntil: "domcontentloaded" });
    await page.goto(`${baseURL ?? "http://localhost:3000"}/community-messenger`, { waitUntil: "domcontentloaded" });
    await roomRow.waitFor({ state: "visible", timeout: 60_000 });

    const snapEnd = await readFullSnapshot(page);
    expect(snapEnd).not.toBeNull();
    const perf = snapEnd!.messengerRenderPerf ?? {};
    const rt = (snapEnd!.realtimeStore ?? {}) as Record<string, unknown>;

    // eslint-disable-next-line no-console
    console.log("\n=== MESSENGER_RENDER_PERF (logged-in) ===");
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ messengerRenderPerf: perf, realtimeStore: rt }, null, 2));
    // eslint-disable-next-line no-console
    console.log("=== END ===\n");

    expect(Number(perf.messenger_home_render ?? 0)).toBeGreaterThan(Number(perf0.messenger_home_render ?? 0) - 1);
    expect(Number(perf.messenger_room_row_render ?? 0)).toBeGreaterThan(0);
  });
});
