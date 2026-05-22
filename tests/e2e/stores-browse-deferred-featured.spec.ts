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

function countApiGets(urls: string[], pathPart: string): string[] {
  return urls.filter(
    (u) =>
      u.includes(pathPart) &&
      !u.includes("bypassCache=1") &&
      !u.includes("fresh=1")
  );
}

test.describe("stores browse deferred featured hydrate", () => {
  test("hard reload: browse 1x, featured-items batch on scroll (not per card)", async ({
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://127.0.0.1:3000";
    const browseGets: string[] = [];
    const featuredGets: string[] = [];

    page.on("request", (req) => {
      if (req.method() !== "GET") return;
      const u = req.url();
      if (u.includes("/api/stores/browse-featured-items")) featuredGets.push(u);
      else if (u.includes("/api/stores/browse?") || u.match(/\/api\/stores\/browse(\?|$)/))
        browseGets.push(u);
    });

    await loginViaTestApi(page, origin);

    await page.goto(`${origin}/stores/browse/restaurant?sub=all`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    test.skip(page.url().includes("/login"), "로그인 필요 — DevTools 수동 검증 참고");

    await page.waitForResponse(
      (res) => res.url().includes("/api/stores/browse?") && res.request().method() === "GET",
      { timeout: 60_000 }
    ).catch(() => null);

    await page.waitForTimeout(1200);
    const browseAfterLoad = countApiGets(browseGets, "/api/stores/browse");
    expect(
      browseAfterLoad.length,
      `browse GET count after load: ${browseAfterLoad.join("\n")}`
    ).toBeLessThanOrEqual(2);

    featuredGets.length = 0;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);

    const featuredAfterScroll = countApiGets(featuredGets, "/api/stores/browse-featured-items");
    expect(
      featuredAfterScroll.length,
      `featured-items should batch (got ${featuredAfterScroll.length}): ${featuredAfterScroll.join("\n")}`
    ).toBeLessThanOrEqual(2);
    expect(featuredAfterScroll.length).toBeGreaterThanOrEqual(1);
  });

  test("/stores home feed: featured-items batch on scroll (same contract as browse)", async ({
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://127.0.0.1:3000";
    const featuredGets: string[] = [];

    page.on("request", (req) => {
      if (req.method() !== "GET") return;
      const u = req.url();
      if (u.includes("/api/stores/browse-featured-items")) featuredGets.push(u);
    });

    await loginViaTestApi(page, origin);
    await page.goto(`${origin}/stores`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    test.skip(page.url().includes("/login"), "로그인 필요 — DevTools 수동 검증 참고");

    await page
      .waitForResponse(
        (res) => res.url().includes("/api/stores/home-feed") && res.request().method() === "GET",
        { timeout: 60_000 }
      )
      .catch(() => null);

    featuredGets.length = 0;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1200);

    const featuredAfterScroll = countApiGets(featuredGets, "/api/stores/browse-featured-items");
    expect(
      featuredAfterScroll.length,
      `home feed featured-items batch: ${featuredAfterScroll.join("\n")}`
    ).toBeGreaterThanOrEqual(1);
    expect(featuredAfterScroll.length).toBeLessThanOrEqual(3);
  });

  test("skeleton menu row keeps stable height (no large CLS)", async ({ page, baseURL }) => {
    const origin = baseURL ?? "http://127.0.0.1:3000";
    await loginViaTestApi(page, origin);

    await page.goto(`${origin}/stores/browse/restaurant?sub=all`, {
      waitUntil: "domcontentloaded",
    });

    test.skip(page.url().includes("/login"), "로그인 필요");

    const firstCard = page.locator("ul.space-y-2 > li.list-none").first();
    await firstCard.waitFor({ state: "visible", timeout: 60_000 });

    const measureMenuBand = () =>
      firstCard.evaluate((li) => {
        const skeleton = li.querySelector(".animate-pulse");
        const menuScroller = li.querySelector('[aria-label]') as HTMLElement | null;
        const band =
          skeleton?.parentElement ??
          menuScroller?.parentElement ??
          li.querySelector(".relative")?.firstElementChild;
        if (!band || !(band instanceof HTMLElement)) return null;
        const r = band.getBoundingClientRect();
        return { height: r.height, top: r.top };
      });

    let before = await measureMenuBand();
    for (let i = 0; i < 20 && (!before || before.height < 40); i++) {
      await page.waitForTimeout(100);
      before = await measureMenuBand();
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1500);

    const after = await measureMenuBand();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    if (before && after) {
      const deltaH = Math.abs(after.height - before.height);
      const deltaTop = Math.abs(after.top - before.top);
      expect(deltaH, `menu band height shift ${before.height} -> ${after.height}`).toBeLessThan(24);
      expect(deltaTop, `menu band top shift ${before.top} -> ${after.top}`).toBeLessThan(16);
    }
  });
});
