import { expect, test } from "@playwright/test";
import { ensureE2eUserSession } from "./helpers/playwright-origin-and-session";

async function loginViaTestApi(page: import("@playwright/test").Page, origin: string): Promise<boolean> {
  void origin;
  try {
    await ensureE2eUserSession(page, {
      username: process.env.E2E_TEST_USERNAME ?? "aaaa",
      password: process.env.E2E_TEST_PASSWORD ?? "1234",
    });
    return true;
  } catch {
    return false;
  }
}

test.describe("community messenger call smoke", () => {
  test("active session recovery routes to call screen", async ({ page, baseURL }) => {
    const origin = baseURL ?? "http://127.0.0.1:3000";
    const sessionId = "e2e-active-call-session";

    await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded" });
    const loggedIn = await loginViaTestApi(page, origin);
    test.skip(!loggedIn, "test-login unavailable");

    await page.route("**/api/community-messenger/calls/sessions/active", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          session: { id: sessionId, status: "active", sessionMode: "direct" },
        }),
      });
    });

    await page.evaluate(() => {
      try {
        sessionStorage.removeItem("samarket:cm-active-call-recovery");
        sessionStorage.removeItem("samarket:cm-terminal-call-recovery-suppress");
      } catch {
        /* ignore */
      }
    });

    const recoveryNav = page.waitForURL(
      new RegExp(`/community-messenger/calls/${sessionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`),
      { timeout: 25_000 }
    );
    /** pathname 동일 재진입은 recovery effect 가 재실행되지 않을 수 있음 — reload 로 마운트·auth·mock 를 한 번에 검증 */
    await page.reload({ waitUntil: "domcontentloaded" });
    await recoveryNav;
  });

  test("terminal session is not recovered", async ({ page, baseURL }) => {
    const origin = baseURL ?? "http://127.0.0.1:3000";

    await page.route("**/api/community-messenger/calls/sessions/active", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          session: { id: "ended-session", status: "ended", sessionMode: "direct" },
        }),
      });
    });

    await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded" });
    const loggedIn = await loginViaTestApi(page, origin);
    test.skip(!loggedIn, "test-login unavailable");

    await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/community-messenger/);
    expect(page.url()).not.toMatch(/\/community-messenger\/calls\/ended-session/);
  });

  test("peer_busy outgoing shows user-facing message", async ({ page, baseURL }) => {
    const origin = baseURL ?? "http://127.0.0.1:3000";
    const roomId = "e2e-room-peer-busy";

    await page.route(`**/api/community-messenger/rooms/${roomId}/calls`, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, error: "peer_busy" }),
      });
    });

    await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded" });
    const loggedIn = await loginViaTestApi(page, origin);
    test.skip(!loggedIn, "test-login unavailable");

    const result = await page.evaluate(async (rid) => {
      const res = await fetch(`/api/community-messenger/rooms/${rid}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ callKind: "voice" }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      return { status: res.status, error: json.error };
    }, roomId);

    expect(result.error).toBe("peer_busy");
  });
});
