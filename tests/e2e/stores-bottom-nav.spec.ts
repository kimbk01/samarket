import { expect, test, type Page } from "@playwright/test";

function playwrightOrigin(baseURL: string | undefined): string {
  return (baseURL ?? "http://localhost:3000").replace(/\/$/, "");
}

function deliveryBottomNavLocator(page: Page) {
  return page.getByRole("navigation", { name: "배달 전용 메뉴" });
}

function globalBottomNavLocator(page: Page) {
  return page.getByRole("navigation", { name: "주요 메뉴" });
}

async function loginViaLoginPage(page: Page, origin: string): Promise<boolean> {
  const user = process.env.E2E_TEST_USERNAME?.trim();
  const pass = process.env.E2E_TEST_PASSWORD ?? "";
  if (!user || !pass) return false;

  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const userInput = page.locator('input[type="text"], input[type="email"]').first();
  const passInput = page.locator('input[type="password"]').first();
  await userInput.fill(user);
  await passInput.fill(pass);
  const loginBtn = page.getByRole("button", { name: "로그인", exact: true });
  if ((await loginBtn.count()) === 0) return false;
  await loginBtn.click();
  try {
    await page.waitForURL((url) => url.pathname !== "/login" && !url.pathname.startsWith("/login/"), {
      timeout: 30_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * `proxy.ts` 인증 게이트 — 배달/필라이프 등 대부분의 사용자 페이지는 세션 필요.
 * 로그인 불가 시 해당 테스트는 스킵한다 (서버 HTML fetch 검증 금지).
 */
async function ensureAuthenticatedForStores(page: Page, baseURL: string | undefined): Promise<void> {
  const origin = playwrightOrigin(baseURL);

  await page.goto(`${origin}/stores`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  if (!page.url().includes("/login")) return;

  const ok = await loginViaLoginPage(page, origin);
  test.skip(!ok, "인증 필요: 로그인 실패 또는 E2E_TEST_USERNAME / E2E_TEST_PASSWORD 미설정");

  await page.goto(`${origin}/stores`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await expect(page).not.toHaveURL(/\/login/);
}

test.describe("stores unified bottom nav (smoke)", () => {
  test("/stores — 전역 BottomNav 노출, 배달 전용 네비 없음", async ({ page, baseURL }) => {
    await ensureAuthenticatedForStores(page, baseURL);

    await expect(globalBottomNavLocator(page)).toBeVisible({ timeout: 25_000 });
    await expect(deliveryBottomNavLocator(page)).toHaveCount(0);
  });

  test("/stores/cart — 전역 BottomNav 노출, 배달 전용 네비 없음", async ({ page, baseURL }) => {
    await ensureAuthenticatedForStores(page, baseURL);

    await page.goto(`${playwrightOrigin(baseURL)}/stores/cart`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await expect(globalBottomNavLocator(page)).toBeVisible({ timeout: 25_000 });
    await expect(deliveryBottomNavLocator(page)).toHaveCount(0);
  });

  test("/home — 배달 전용 네비 없음 (라우트 없으면 스킵)", async ({ page, baseURL }) => {
    await ensureAuthenticatedForStores(page, baseURL);
    const origin = playwrightOrigin(baseURL);
    const res = await page.goto(`${origin}/home`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    if (!res || res.status() === 404) {
      test.skip(true, "/home 라우트가 없거나 404 — scripts/verify-app-routes 에 (main)/home 누락");
    }
    await expect(deliveryBottomNavLocator(page)).toHaveCount(0);
  });

  test("/philife — 배달 전용 네비 없음", async ({ page, baseURL }) => {
    await ensureAuthenticatedForStores(page, baseURL);
    await page.goto(`${playwrightOrigin(baseURL)}/philife`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await expect(deliveryBottomNavLocator(page)).toHaveCount(0);
  });

  test("/community-messenger — 배달 전용 네비 없음", async ({ page, baseURL }) => {
    await ensureAuthenticatedForStores(page, baseURL);
    await page.goto(`${playwrightOrigin(baseURL)}/community-messenger`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await expect(deliveryBottomNavLocator(page)).toHaveCount(0);
  });

  test("/mypage — 배달 전용 네비 없음", async ({ page, baseURL }) => {
    await ensureAuthenticatedForStores(page, baseURL);
    await page.goto(`${playwrightOrigin(baseURL)}/mypage`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await expect(deliveryBottomNavLocator(page)).toHaveCount(0);
  });

  test("/stores — 커뮤니티 탭 → /philife", async ({ page, baseURL }) => {
    await ensureAuthenticatedForStores(page, baseURL);

    const nav = globalBottomNavLocator(page);
    await expect(nav).toBeVisible({ timeout: 25_000 });
    const community = nav.locator('a[href="/philife"]').first();
    await expect(community).toBeVisible();
    await community.click();
    await expect(page).toHaveURL(/\/philife(?:\/|\?|$)/, { timeout: 20_000 });
  });
});
