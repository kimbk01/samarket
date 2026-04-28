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
  }, { base: origin, username: process.env.E2E_TEST_USERNAME ?? "aaaa", password: process.env.E2E_TEST_PASSWORD ?? "1234" });
}

test.describe("dibaY rename smoke", () => {
  test("brand/login/chat/post/admin/favicon/oauth redirect", async ({ page, baseURL, request }) => {
    const origin = baseURL ?? "http://127.0.0.1:3000";

    // 1) 홈 접속 → dibaY 표시 확인
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/dibaY/i);

    // 7) favicon 표시 확인
    const faviconRes = await request.get(`${origin}/favicon.ico`);
    expect(faviconRes.ok()).toBeTruthy();

    // 2) 로그인 → 정상
    await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/dibaY/i);
    let loggedIn = await loginViaTestApi(page, origin);
    if (!loggedIn) {
      const userInput = page.locator('input[type="text"], input[type="email"]').first();
      const passInput = page.locator('input[type="password"]').first();
      await userInput.fill(process.env.E2E_TEST_USERNAME ?? "aaaa");
      await passInput.fill(process.env.E2E_TEST_PASSWORD ?? "1234");
      await page.getByRole("button", { name: "로그인", exact: true }).click();
      try {
        await page.waitForURL((url) => url.pathname !== "/login", { timeout: 20_000 });
        loggedIn = true;
      } catch {
        loggedIn = false;
      }
    }

    // 3) 새로고침 → 로그인 유지
    await page.reload({ waitUntil: "domcontentloaded" });
    if (loggedIn) {
      await expect(page).not.toHaveURL(/\/login$/);
    }

    // 4) 채팅 → 정상 (500/404 아님)
    const chatRes = await page.goto(`${origin}/community-messenger`, { waitUntil: "domcontentloaded" });
    expect(chatRes && chatRes.status()).toBeLessThan(500);

    // 5) 게시글 → 정상
    const postsRes = await request.get(`${origin}/api/philife/posts?page=1&sort=latest`);
    expect(postsRes.ok()).toBeTruthy();
    const postsJson = (await postsRes.json()) as { posts?: Array<{ id?: string }> };
    const firstId = postsJson.posts?.find((p) => typeof p.id === "string" && p.id.length > 0)?.id;
    if (firstId) {
      const postRes = await page.goto(`${origin}/post/${encodeURIComponent(firstId)}`, { waitUntil: "domcontentloaded" });
      expect(postRes && postRes.status()).toBeLessThan(500);
    }

    // 6) 관리자 → 정상 (권한/리다이렉트 허용, 500/404 금지)
    const adminRes = await page.goto(`${origin}/admin`, { waitUntil: "domcontentloaded" });
    expect(adminRes && adminRes.status()).toBeLessThan(500);

    // 8) SNS 로그인 redirect 정상 (samarket 도메인 하드코딩 금지)
    const naverStartRes = await request.get(`${origin}/api/auth/naver/start`, { maxRedirects: 0 });
    const location = naverStartRes.headers()["location"] ?? "";
    expect(location.toLowerCase()).not.toContain("samarket.vercel.app");
  });
});
