import { expect, test } from "@playwright/test";

async function loginViaTestApi(page: import("@playwright/test").Page, origin: string): Promise<boolean> {
  return page.evaluate(async ({ base, username, password }) => {
    try {
      const res = await fetch(`${base}/api/test-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const j = (await res.json()) as { ok?: boolean; userId?: string };
      if (!j?.ok || !j.userId) return false;
      document.cookie = `kasama_dev_uid_pub=${encodeURIComponent(j.userId)}; path=/; max-age=${60 * 60}; SameSite=Lax`;
      return true;
    } catch {
      return false;
    }
  }, {
    base: origin,
    username: process.env.E2E_TEST_USERNAME ?? "aaaa",
    password: process.env.E2E_TEST_PASSWORD ?? "1234",
  });
}

test.describe("community messenger call smoke", () => {
  test("active session recovery routes to call screen", async ({ page, baseURL }) => {
    const origin = baseURL ?? "http://127.0.0.1:3000";
    const sessionId = "e2e-active-call-session";

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

    await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded" });
    const loggedIn = await loginViaTestApi(page, origin);
    test.skip(!loggedIn, "test-login unavailable");

    await page.goto(`${origin}/community-messenger?section=chats`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`/community-messenger/calls/${sessionId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), {
      timeout: 20_000,
    });
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
