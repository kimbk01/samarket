import { test, expect } from "@playwright/test";

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

    await page.goto(baseURL ?? "http://localhost:3000/", { waitUntil: "domcontentloaded" });
    const loginOk = await page.evaluate(
      async ({ origin, username, password }) => {
        const r = await fetch(`${origin}/api/test-login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username, password }),
        });
        return r.ok;
      },
      { origin: baseURL ?? "http://localhost:3000", username: user, password: pass }
    );
    expect(loginOk, "test-login 실패 — test_users·NEXT_PUBLIC 표면 확인").toBe(true);

    await page.goto(`${baseURL ?? "http://localhost:3000"}/community-messenger`, { waitUntil: "domcontentloaded" });
    await page.waitForResponse(
      (r) => r.url().includes("/api/community-messenger/bootstrap") && r.request().method() === "GET",
      { timeout: 60_000 }
    );

    const roomLink = page.locator('a[href^="/community-messenger/rooms/"]').first();
    await roomLink.waitFor({ state: "visible", timeout: 60_000 });

    const snapAfterList = await readFullSnapshot(page);
    expect(snapAfterList, "getMessengerHomeVerificationSnapshot 없음").not.toBeNull();
    const perf0 = snapAfterList!.messengerRenderPerf ?? {};
    expect(
      Number(perf0.messenger_home_render ?? 0),
      "메신저 홈 본문 미마운트(messenger_home_render=0) — 로그인·호스트·경로 확인"
    ).toBeGreaterThan(0);
    expect(Number(perf0.messenger_home_list_render ?? 0)).toBeGreaterThan(0);

    for (let i = 0; i < 3; i++) {
      const link = page.locator('a[href^="/community-messenger/rooms/"]').nth(i);
      if ((await link.count()) === 0) break;
      await link.click();
      await page.waitForURL(/\/community-messenger\/rooms\//, { timeout: 30_000 });
      await page.goBack({ waitUntil: "domcontentloaded" });
      await roomLink.waitFor({ state: "visible", timeout: 30_000 });
    }

    await page.goto(`${baseURL ?? "http://localhost:3000"}/home`, { waitUntil: "domcontentloaded" });
    await page.goto(`${baseURL ?? "http://localhost:3000"}/community-messenger`, { waitUntil: "domcontentloaded" });
    await roomLink.waitFor({ state: "visible", timeout: 60_000 });

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
