/**
 * Phase 4 — production Marketplace location/radius UI runtime (browser).
 * GPS / master mutation need real device+login → reported separately when skipped.
 *
 *   PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 *     npx playwright test tests/e2e/trade-location-phase4-runtime.spec.ts
 */
import { expect, test, type Page } from "@playwright/test";

const BASE = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(
  /\/$/,
  ""
);

async function expectLocationPageOpened(page: Page) {
  await expect
    .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
    .toBe("/market/location");
  await expect(
    page.getByText(/위치 선택|Select location/i, { exact: true })
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: /도시·지역 검색|Search city or area/i })
  ).toBeVisible({ timeout: 15_000 });
}

test.describe("trade location phase4 runtime", () => {
  test.setTimeout(120_000);

  test("pin → sheet → Quezon City → distance → apply → URL/radius → cancel keeps committed → ALL clears", async ({
    page,
  }) => {
    const marks: string[] = [];
    await page.addInitScript(() => {
      const orig = performance.mark.bind(performance);
      (window as unknown as { __tlbMarks?: string[] }).__tlbMarks = [];
      performance.mark = ((name: string, ...rest: unknown[]) => {
        (window as unknown as { __tlbMarks?: string[] }).__tlbMarks?.push(name);
        return orig(name, ...(rest as []));
      }) as typeof performance.mark;
    });

    await page.goto(`${BASE}/market`, { waitUntil: "domcontentloaded" });

    const pin = page.getByRole("button", { name: /거래 지역|Trade location/i });
    await expect(pin).toBeVisible({ timeout: 30_000 });
    const t0 = Date.now();
    await pin.click();

    await expectLocationPageOpened(page);
    const pinToSheetMs = Date.now() - t0;

    // Search → Quezon City
    await page.getByRole("button", { name: /도시·지역 검색|Search city/i }).click();
    const search = page.getByPlaceholder(/도시|Search by city/i);
    await expect(search).toBeVisible({ timeout: 10_000 });
    await search.fill("Quezon City");
    const qcHit = page.getByRole("button", { name: /Quezon City/i }).first();
    await expect(qcHit).toBeVisible({ timeout: 15_000 });
    await qcHit.click();

    // Continue to distance
    const continueBtn = page.getByRole("button", { name: /거리 설정|Set distance/i });
    await expect(continueBtn).toBeVisible({ timeout: 10_000 });
    await continueBtn.click();

    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
      .toMatch(/\/market\/location\/distance$/);
    await expect(page.getByText(/거리 설정|Set distance/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("32km", { exact: true })).toBeVisible({ timeout: 15_000 });

    // Pick 32km preset (not recommended)
    await page.getByText("32km", { exact: true }).click();
    await page.getByRole("button", { name: /품목 보기|See items/i }).click();

    await expect
      .poll(() => page.url(), { timeout: 15_000 })
      .toMatch(/location=city/);
    await expect.poll(() => page.url()).toMatch(/radius=32/);
    expect(page.url()).toMatch(/lgu=/);

    // Reopen → draft should show committed; change draft then X cancel
    await pin.click();
    await expectLocationPageOpened(page);
    await continueBtn.click();
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 15_000 })
      .toMatch(/\/market\/location\/distance$/);
    await expect(page.getByText(/거리 설정|Set distance/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("160km", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByText("160km", { exact: true }).click();
    // Prefer Escape — backdrop Close is under the dialog and intercepts pointer events.
    await page.keyboard.press("Escape");
    await expect
      .poll(() => new URL(page.url()).pathname, { timeout: 10_000 })
      .toBe("/market/location/distance");

    // URL must still be 32
    expect(page.url()).toMatch(/radius=32/);
    expect(page.url()).not.toMatch(/radius=160/);

    marks.push(
      ...(((await page.evaluate(
        () => (window as unknown as { __tlbMarks?: string[] }).__tlbMarks || []
      )) as string[]) || [])
    );
    // eslint-disable-next-line no-console
    console.log(
      "PHASE4_UI_EVIDENCE",
      JSON.stringify({ pinToSheetMs, marks, urlAfterCancel: page.url() })
    );
    expect(pinToSheetMs).toBeLessThan(3000);
  });

  test("ALL restore strips location/lgu/radius from committed URL", async ({ page }) => {
    await page.goto(`${BASE}/market?location=city&lgu=quezon-city&radius=64`, {
      waitUntil: "domcontentloaded",
    });
    const pin = page.getByRole("button", { name: /거래 지역|Trade location/i });
    await expect(pin).toBeVisible({ timeout: 30_000 });
    await pin.click();
    await expectLocationPageOpened(page);

    const viewAll = page.getByRole("button", { name: /전체 상품 보기|See all listings/i });
    await expect(viewAll).toBeVisible();
    await viewAll.evaluate((el: HTMLElement) => {
      el.scrollIntoView({ block: "center" });
      el.click();
    });

    await expect
      .poll(() => page.url(), { timeout: 15_000 })
      .not.toMatch(/location=city/);
    expect(page.url()).not.toMatch(/[?&]lgu=/);
    expect(page.url()).not.toMatch(/[?&]radius=/);
  });

  test("reload restores URL city+radius; detail→back keeps query", async ({ page }) => {
    const href = `${BASE}/market?location=city&lgu=quezon-city&radius=64`;
    await page.goto(href, { waitUntil: "domcontentloaded" });
    await expect.poll(() => page.url()).toMatch(/radius=64/);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => page.url()).toMatch(/location=city/);
    await expect.poll(() => page.url()).toMatch(/radius=64/);

    const card = page.locator('a[href*="/post/"]').first();
    if (await card.count()) {
      await card.click({ timeout: 10_000 }).catch(() => null);
      await page.waitForTimeout(800);
      await page.goBack({ waitUntil: "domcontentloaded" });
      await expect.poll(() => page.url()).toMatch(/location=city/);
      await expect.poll(() => page.url()).toMatch(/radius=64/);
    }
  });
});
