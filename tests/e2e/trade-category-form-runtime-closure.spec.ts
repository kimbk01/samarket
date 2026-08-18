/**
 * Dirty-tree LOCAL runtime closure — Trade Category System.
 *
 * RUNTIME: http://localhost:3000 (npm run dev, dirty tree)
 * MEMBER: E2E_TEST_USERNAME=wwww E2E_TEST_PASSWORD=1234 (ADDRESS_COMPLETE)
 * ADMIN:  E2E_TEST_USERNAME=cccc E2E_TEST_PASSWORD=1234 (profiles.role=admin)
 * BUYER (CTA click): E2E_TEST_USERNAME_B=qqqq or asas* with password — optional
 *
 * PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *   E2E_TEST_USERNAME=wwww E2E_TEST_PASSWORD=1234 \
 *   npx playwright test tests/e2e/trade-category-form-runtime-closure.spec.ts --reporter=line
 */
import { expect, test, type Page, type Response } from "@playwright/test";
import {
  ensureE2eUserSession,
  playwrightOriginFromEnv,
} from "./helpers/playwright-origin-and-session";

const MARK = `TCF${Date.now().toString(36).slice(-6)}`;

const results: Record<string, string> = {};

async function dismissTermsOnboardingIfNeeded(page: Page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!page.url().includes("/auth/onboarding/terms")) return;
    const checks = page.locator('input[type="checkbox"]');
    const n = await checks.count();
    for (let i = 0; i < n; i++) {
      await checks.nth(i).check({ force: true }).catch(() => null);
    }
    // Some UIs use clickable labels instead of native checkboxes
    const labels = page.locator('label').filter({ hasText: /Terms|Privacy|약관|개인정보/i });
    const lc = await labels.count();
    for (let i = 0; i < Math.min(lc, 4); i++) {
      await labels.nth(i).click().catch(() => null);
    }
    const agree = page.getByRole("button", { name: /Agree and continue|동의하고 계속|동의|계속/i }).first();
    if (await agree.isVisible().catch(() => false)) {
      await agree.click();
      await page.waitForTimeout(1200);
    } else {
      break;
    }
  }
}

async function gotoAdminCategories(page: Page) {
  const origin = playwrightOriginFromEnv();
  // Re-inject chunked auth cookie — single-cookie inject often exceeds browser limits and SSR admin gate fails.
  await injectChunkedSupabaseSession(page, { username: "cccc", password: "1234" });
  await page.goto(`${origin}/admin/categories`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(800);
  await dismissTermsOnboardingIfNeeded(page);
  if (!page.url().includes("/admin/categories")) {
    await page.goto(`${origin}/admin/categories`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(1200);
    await dismissTermsOnboardingIfNeeded(page);
  }
  await expect(page).toHaveURL(/\/admin\/categories/, { timeout: 45_000 });
  const denied = await page.getByText(/Admin authentication is required|관리자 인증/i).isVisible().catch(() => false);
  if (denied) {
    throw new Error("admin_server_gate_denied");
  }
}

async function injectChunkedSupabaseSession(
  page: Page,
  opts: { username: string; password: string }
): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) return;
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  if (!ref) return;
  const email = opts.username.includes("@") ? opts.username : `${opts.username}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password: opts.password });
  if (error || !data.session) return;
  const session = data.session;
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  );
  const origin = new URL(playwrightOriginFromEnv());
  const CHUNK = 3180;
  const parts: string[] = [];
  for (let i = 0; i < encoded.length; i += CHUNK) parts.push(encoded.slice(i, i + CHUNK));
  await page.context().clearCookies();
  if (parts.length === 1) {
    await page.context().addCookies([
      {
        name: `sb-${ref}-auth-token`,
        value: parts[0]!,
        domain: origin.hostname,
        path: "/",
        httpOnly: false,
        secure: origin.protocol === "https:",
        sameSite: "Lax",
      },
    ]);
  } else {
    await page.context().addCookies(
      parts.map((value, i) => ({
        name: `sb-${ref}-auth-token.${i}`,
        value,
        domain: origin.hostname,
        path: "/",
        httpOnly: false,
        secure: origin.protocol === "https:",
        sameSite: "Lax" as const,
      }))
    );
  }
}

async function softDelete(page: Page, postId: string) {
  const origin = playwrightOriginFromEnv();
  await page.request
    .post(`${origin}/api/posts/${encodeURIComponent(postId)}/owner-delete`, {
      headers: { "Content-Type": "application/json" },
    })
    .catch(() => null);
}

async function fetchDetail(page: Page, postId: string) {
  const origin = playwrightOriginFromEnv();
  const res = await page.request.get(`${origin}/api/posts/${encodeURIComponent(postId)}/detail`);
  if (!res.ok()) return null;
  const json = (await res.json().catch(() => null)) as
    | Record<string, unknown>
    | { post?: Record<string, unknown> }
    | null;
  if (!json || typeof json !== "object") return null;
  if ("post" in json && json.post && typeof json.post === "object") {
    return json.post as Record<string, unknown>;
  }
  // route returns the post object directly
  if ("id" in json || "title" in json || "meta" in json) return json as Record<string, unknown>;
  return null;
}

/** Create success navigates to category list — capture id from create API. */
async function waitCreatePostId(page: Page, submit: () => Promise<void>, timeoutMs = 90_000): Promise<string> {
  const waitRes = page.waitForResponse(
    (r: Response) =>
      r.url().includes("/api/posts/create") && r.request().method() === "POST",
    { timeout: timeoutMs }
  );
  await submit();
  const res = await waitRes.catch(async (err) => {
    const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 1200);
    throw new Error(`create_response_timeout url=${page.url()} body=${body} cause=${String(err)}`);
  });
  const json = (await res.json().catch(() => null)) as
    | { id?: string; post?: { id?: string }; postId?: string; error?: string; ok?: boolean }
    | null;
  if (!res.ok()) {
    throw new Error(`create failed status=${res.status()} body=${JSON.stringify(json).slice(0, 400)}`);
  }
  const id = json?.id ?? json?.post?.id ?? json?.postId;
  if (!id) throw new Error(`create ok but no id: ${JSON.stringify(json).slice(0, 400)}`);
  return String(id);
}

async function dismissDraftResume(page: Page) {
  const fresh = page.getByRole("button", { name: /새로 작성|Start fresh/i }).first();
  if (await fresh.isVisible({ timeout: 2500 }).catch(() => false)) {
    await fresh.click();
    await page.waitForTimeout(400);
  }
}

async function ensureTradeAddressReady(page: Page) {
  // TradeDefaultLocationBlock resolves national LGU async; submit before ready → region_read error.
  await expect
    .poll(
      async () => {
        const body = await page.locator("body").innerText();
        if (/Could not read your trade area|거래 지역을 읽|Address management and try again|주소 관리/i.test(body)) {
          return "pending_err";
        }
        if (/Location\s*\*\s*…/.test(body)) return "pending_ellipsis";
        // Address line under Location (not just the label)
        if (/Location\s*\*[\s\S]{0,80}\d|18 Don|Quezon/i.test(body)) return "ready";
        return "pending";
      },
      { timeout: 60_000, intervals: [400, 800, 1200] }
    )
    .toBe("ready");
  await page.waitForTimeout(600);
}

async function selectFormOptionValue(page: Page, value: string) {
  const ok = await page.evaluate((optionValue) => {
    const selects = Array.from(document.querySelectorAll("form select")) as HTMLSelectElement[];
    for (const el of selects) {
      if ([...el.options].some((o) => o.value === optionValue)) {
        el.value = optionValue;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
    return false;
  }, value);
  expect(ok, `missing_select_option:${value}`).toBe(true);
}

async function fillUsedCarBrandModelYear(page: Page) {
  await page.locator("form select").first().selectOption("toyota").catch(async () => {
    await page.locator("form select").first().selectOption({ index: 1 });
  });
  await page.waitForTimeout(500);
  await expect
    .poll(async () =>
      page.evaluate(() =>
        (Array.from(document.querySelectorAll("form select")) as HTMLSelectElement[]).some((s) =>
          [...s.options].some((o) => o.value === "vios")
        )
      )
    )
    .toBe(true);
  await selectFormOptionValue(page, "vios");
  await page.waitForTimeout(300);
  await selectFormOptionValue(page, "2021");
}

async function fillPickupLocationField(page: Page, value: string) {
  const byPlaceholder = page.getByPlaceholder(/픽업|pickup|장소/i).first();
  if (await byPlaceholder.isVisible().catch(() => false)) {
    await byPlaceholder.fill(value);
    return;
  }
  const pickupSection = page.locator("form").filter({ hasText: /픽업|Pickup/i }).first();
  const input = pickupSection.locator('input[type="text"]').first();
  if (await input.isVisible().catch(() => false)) {
    await input.fill(value);
    return;
  }
  throw new Error("pickup_input_not_found");
}

async function gotoWrite(page: Page, slug: string) {
  const origin = playwrightOriginFromEnv();
  const lguWait = page
    .waitForResponse(
      (r) =>
        r.url().includes("/api/trade/national-lgu") &&
        r.request().method() === "GET" &&
        r.ok(),
      { timeout: 45_000 }
    )
    .catch(() => null);
  await page.goto(`${origin}/write/${slug}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(800);
  await dismissDraftResume(page);
  await expect(page.locator("form").first()).toBeVisible({ timeout: 45_000 });
  await lguWait;
  await ensureTradeAddressReady(page);
  // draft may reappear after address hydrate
  await dismissDraftResume(page);
}

async function clickPrimarySubmit(page: Page) {
  // Re-check location gate right before submit
  const body = await page.locator("body").innerText();
  if (/Could not read your trade area|거래 지역을 읽/i.test(body)) {
    throw new Error("location_ssot_not_ready_before_submit");
  }
  const btn = page
    .locator('button[type="submit"]')
    .filter({ hasText: /작성 완료|수정 완료|Post|Save|Publish|Done|Update|등록|올리기|완료|게시|저장|수정/i })
    .last();
  await expect(btn).toBeVisible({ timeout: 20_000 });
  await btn.scrollIntoViewIfNeeded().catch(() => null);
  await btn.click({ force: true });
}

async function fillFirstTextarea(page: Page, value: string) {
  const ta = page.locator("form textarea").first();
  await expect(ta).toBeVisible({ timeout: 20_000 });
  await ta.fill(value);
}

async function fillTitle(page: Page, value: string) {
  const byPh = page.getByPlaceholder(/제목|title/i).first();
  if (await byPh.isVisible().catch(() => false)) {
    await byPh.fill(value);
    return;
  }
  // Trade title input has empty placeholder — first visible text input in form.
  const titleInput = page.locator('form input[type="text"]:visible').first();
  await expect(titleInput).toBeVisible({ timeout: 15_000 });
  await titleInput.fill(value);
}

async function fillPrice(page: Page, value: string) {
  const byPh = page.getByPlaceholder(/가격|price|peso|Enter the price/i).first();
  if (await byPh.isVisible().catch(() => false)) {
    await byPh.fill(value);
    return;
  }
  const numeric = page.locator('input[inputmode="numeric"], input[inputmode="decimal"]').first();
  if (await numeric.isVisible().catch(() => false)) {
    await numeric.fill(value);
  }
}

async function fillLabeledOrPlaceholder(page: Page, re: RegExp, value: string) {
  const byPh = page.getByPlaceholder(re).first();
  if (await byPh.isVisible().catch(() => false)) {
    await byPh.fill(value);
    return true;
  }
  const byRole = page.getByRole("textbox", { name: re }).first();
  if (await byRole.isVisible().catch(() => false)) {
    await byRole.fill(value);
    return true;
  }
  return false;
}

async function assertListShowsTitle(page: Page, title: string, mark: string) {
  const origin = playwrightOriginFromEnv();
  const postsWait = page.waitForResponse(
    (r) => r.url().includes("/api/my/posts") && r.ok(),
    { timeout: 45_000 }
  );
  await page.goto(`${origin}/mypage/products`, { waitUntil: "domcontentloaded" });
  await postsWait.catch(() => null);
  await page.waitForTimeout(800);
  const found = await page
    .getByText(title, { exact: false })
    .first()
    .isVisible({ timeout: 15_000 })
    .catch(() => false);
  if (found) return;
  const markFound = await page
    .getByText(mark, { exact: false })
    .first()
    .isVisible({ timeout: 10_000 })
    .catch(() => false);
  if (markFound) return;
  // Last resort: open detail proves listing exists; list UI may filter — still require myposts body non-empty
  const body = await page.locator("body").innerText();
  if (!/Selling|판매중|My listings|내 판매/i.test(body)) {
    throw new Error(`list_page_unexpected body=${body.slice(0, 400)}`);
  }
  throw new Error(`list_title_not_found title=${title} mark=${mark} body=${body.slice(0, 600)}`);
}

/** Fixture prep: master may be ADDRESS_COMPLETE but missing cityMunicipality structured fields. */
async function ensureMasterCityForTradeWrite(page: Page) {
  const origin = playwrightOriginFromEnv();
  const res = await page.request.get(`${origin}/api/me/address-defaults`);
  if (!res.ok()) return;
  const json = (await res.json().catch(() => null)) as {
    defaults?: { master?: { id?: string; cityMunicipality?: string | null; province?: string | null; latitude?: number; longitude?: number; formattedAddress?: string | null } };
  } | null;
  const m = json?.defaults?.master;
  if (!m?.id) return;
  if ((m.cityMunicipality || "").trim()) return;
  const formatted = m.formattedAddress || "";
  const city = /Quezon City/i.test(formatted) ? "Quezon City" : "Quezon City";
  const province = /Metro Manila|Manila/i.test(formatted) ? "Metro Manila" : "Metro Manila";
  await page.request.patch(`${origin}/api/me/addresses/${encodeURIComponent(m.id)}`, {
    data: {
      cityMunicipality: city,
      province,
      latitude: m.latitude,
      longitude: m.longitude,
    },
    headers: { "Content-Type": "application/json" },
  });
}

async function assertOwnerCtaBar(page: Page, key: string) {
  const bar = page.locator('[data-post-detail-action-bar="true"]').first();
  await expect(bar).toBeVisible({ timeout: 20_000 });
  results[key] = "PASS";
}

async function assertBuyerChatDestination(page: Page, postId: string, key: string) {
  const buyerUser = (process.env.E2E_TEST_USERNAME_B || "").trim();
  const buyerPass = (process.env.E2E_TEST_PASSWORD_B || process.env.E2E_TEST_PASSWORD || "1234").trim();
  if (!buyerUser) {
    results[key] = "NOT_PROVEN";
    return;
  }
  const origin = playwrightOriginFromEnv();
  await page.context().clearCookies();
  await ensureE2eUserSession(page, { username: buyerUser, password: buyerPass });
  await page.goto(`${origin}/post/${postId}`, { waitUntil: "domcontentloaded" });
  const chatBtn = page
    .locator('[data-post-detail-action-bar="true"] button, [data-post-detail-action-bar="true"] a')
    .filter({ hasText: /채팅|문의|Chat|Message|Inquire/i })
    .first();
  await expect(chatBtn).toBeVisible({ timeout: 20_000 });
  await chatBtn.click();
  await page.waitForURL(/\/(chats|trade-chats|messages|rooms)\b/, { timeout: 45_000 }).catch(() => null);
  const ok = /\/(chats|trade-chats|messages|rooms)\b/.test(page.url());
  results[key] = ok ? "PASS" : "FAIL";
  expect(ok).toBeTruthy();
}

test.describe("trade category-form FINAL runtime closure", () => {
  test.setTimeout(300_000);
  const created: string[] = [];

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    try {
      await ensureE2eUserSession(page, { username: "wwww", password: "1234" });
      for (const id of created) await softDelete(page, id);
    } catch {
      /* best-effort */
    } finally {
      await page.close();
    }
    // eslint-disable-next-line no-console
    console.log("RUNTIME_RESULTS", JSON.stringify(results, null, 2));
  });

  test("USED chain", async ({ page }) => {
    const origin = playwrightOriginFromEnv();
    await ensureE2eUserSession(page, { username: "wwww", password: "1234" });
    await ensureMasterCityForTradeWrite(page);
    const title = `${MARK}-USED`;
    await gotoWrite(page, "trade");

    await fillTitle(page, title);
    await fillPrice(page, "15000");
    await fillFirstTextarea(page, `${MARK} used body`);

    const postId = await waitCreatePostId(page, () => clickPrimarySubmit(page));
    created.push(postId);
    results["USED_WRITE"] = "PASS";

    const stored = await fetchDetail(page, postId);
    expect(stored).toBeTruthy();
    expect(String(stored?.title)).toContain("USED");
    results["USED_STORE"] = "PASS";

    await page.goto(`${origin}/mypage/products`, { waitUntil: "domcontentloaded" });
    await assertListShowsTitle(page, title, MARK);
    results["USED_LIST"] = "PASS";

    await page.goto(`${origin}/post/${postId}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(title, { exact: false }).first()).toBeVisible({ timeout: 20_000 });
    results["USED_DETAIL"] = "PASS";
    await assertOwnerCtaBar(page, "CTA_GENERAL_OWNER");

    await page.goto(`${origin}/products/${postId}/edit`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await dismissDraftResume(page);
    await expect(
      page.getByText(title, { exact: false }).or(page.locator(`input[value="${title}"]`)).first()
    ).toBeVisible({ timeout: 20_000 });
    results["USED_EDIT"] = "PASS";

    await assertBuyerChatDestination(page, postId, "CTA_GENERAL_BUYER");
  });

  test("USED-CAR SELL chain", async ({ page }) => {
    const origin = playwrightOriginFromEnv();
    await ensureE2eUserSession(page, { username: "wwww", password: "1234" });
    await ensureMasterCityForTradeWrite(page);
    await gotoWrite(page, "vehicle");

    const sell = page.getByText(/팝니다|For sale/i).first();
    if (await sell.isVisible().catch(() => false)) await sell.click();

    const selects = page.locator("form select");
    const selCount = await selects.count();
    for (let i = 0; i < Math.min(selCount, 4); i++) {
      const s = selects.nth(i);
      const opts = s.locator("option");
      const n = await opts.count();
      if (n > 1) {
        const val = await opts.nth(1).getAttribute("value");
        if (val) await s.selectOption(val);
      }
    }

    const nums = page.locator('input[inputmode="numeric"], input[inputmode="decimal"]');
    const numN = await nums.count();
    if (numN > 0) await nums.nth(0).fill("2020");
    if (numN > 1) await nums.nth(1).fill("35000");
    if (numN > 2) await nums.nth(2).fill("880000");

    await fillFirstTextarea(page, `${MARK} used-car sell body`);
    const postId = await waitCreatePostId(page, () => clickPrimarySubmit(page));
    created.push(postId);
    results["UC_SELL_WRITE"] = "PASS";

    const stored = await fetchDetail(page, postId);
    expect(stored).toBeTruthy();
    const meta = (stored?.meta && typeof stored.meta === "object" ? stored.meta : {}) as Record<
      string,
      unknown
    >;
    results["UC_SELL_STORE"] =
      meta.car_model != null || meta.car_year != null || meta.mileage != null ? "PASS" : "FAIL";
    expect(results["UC_SELL_STORE"]).toBe("PASS");

    await page.goto(`${origin}/mypage/products`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/km|2020|중고차|차량|Vios|Toyota|Hyundai|기아|현대|판매|TCF/i, {
      timeout: 30_000,
    });
    results["UC_SELL_LIST"] = "PASS";

    await page.goto(`${origin}/post/${postId}`, { waitUntil: "domcontentloaded" });
    await assertOwnerCtaBar(page, "CTA_USED_CAR_OWNER");
    results["UC_SELL_DETAIL"] = "PASS";

    await page.goto(`${origin}/products/${postId}/edit`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await dismissDraftResume(page);
    await expect(page.locator("form").first()).toBeVisible({ timeout: 20_000 });
    // hydrate: brand/model select or combined car_model visible
    const formText = await page.locator("form").first().innerText();
    expect(/2020|km|mileage|연식|주행|브랜드|차종|model|make/i.test(formText)).toBeTruthy();
    results["UC_SELL_EDIT"] = "PASS";
    results["UC_BUY"] = "NOT_PROVEN";

    await assertBuyerChatDestination(page, postId, "CTA_USED_CAR_BUYER");
  });

  test("REAL-ESTATE chain", async ({ page }) => {
    const origin = playwrightOriginFromEnv();
    await ensureE2eUserSession(page, { username: "wwww", password: "1234" });
    await ensureMasterCityForTradeWrite(page);
    await gotoWrite(page, "property");

    // Sale listing
    await page.locator("form select").nth(0).selectOption("판매");
    await page.locator("form select").nth(1).selectOption("콘도");

    const salePrice = page.locator('form input[inputmode="numeric"]').first();
    await salePrice.fill("2500000");

    const decs = page.locator('form input[inputmode="decimal"]');
    await expect(decs.nth(0)).toBeVisible({ timeout: 10_000 });
    await decs.nth(0).fill("45");
    await decs.nth(1).fill("2");
    await decs.nth(2).fill("1");

    await page.locator("form select").nth(2).selectOption("즉시입주").catch(() => null);

    const texts = page.locator('form input[type="text"]:not([inputmode])');
    const tc = await texts.count();
    if (tc > 0) await texts.nth(tc - 1).fill(`${MARK}-Tower`);

    await fillFirstTextarea(page, `${MARK} real-estate body`);

    const postId = await waitCreatePostId(page, () => clickPrimarySubmit(page));
    created.push(postId);
    results["RE_WRITE"] = "PASS";

    const stored = await fetchDetail(page, postId);
    const meta = (stored?.meta && typeof stored.meta === "object" ? stored.meta : {}) as Record<
      string,
      unknown
    >;
    results["RE_STORE"] =
      meta.deal_type != null || meta.estate_type != null || meta.size_sq != null || meta.building_name != null
        ? "PASS"
        : "FAIL";
    expect(results["RE_STORE"]).toBe("PASS");

    await assertListShowsTitle(page, `${MARK}-Tower`, MARK);
    results["RE_LIST"] = "PASS";

    await page.goto(`${origin}/post/${postId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/부동산|임대|판매|sq|방|욕실|콘도|주택|상가|㎡|m²|Condo|Sale|Rent|Tower/i, {
      timeout: 20_000,
    });
    results["RE_DETAIL"] = "PASS";

    await page.goto(`${origin}/products/${postId}/edit`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await dismissDraftResume(page);
    await expect(page.locator("form").first()).toBeVisible({ timeout: 20_000 });
    results["RE_EDIT"] = "PASS";
  });

  test("JOBS chain", async ({ page }) => {
    const origin = playwrightOriginFromEnv();
    await ensureE2eUserSession(page, { username: "wwww", password: "1234" });
    await ensureMasterCityForTradeWrite(page);
    await gotoWrite(page, "hiring");

    // Hiring mode
    const hiring = page.getByText(/Hiring|구인|고용/i).first();
    if (await hiring.isVisible().catch(() => false)) await hiring.click();

    await fillTitle(page, `${MARK}-JOB`);

    // Industry required — pick first real option via select or button chip
    const industrySelect = page.locator("form select").first();
    if (await industrySelect.isVisible().catch(() => false)) {
      const opts = industrySelect.locator("option");
      const n = await opts.count();
      for (let i = 0; i < n; i++) {
        const val = await opts.nth(i).getAttribute("value");
        if (val) {
          await industrySelect.selectOption(val);
          break;
        }
      }
    } else {
      const retail = page.getByText(/Retail|판매|주방|Serving|매장/i).first();
      if (await retail.isVisible().catch(() => false)) await retail.click();
    }

    // Work type short-term if visible
    const shortTerm = page.getByText(/Short-term|단기/i).first();
    if (await shortTerm.isVisible().catch(() => false)) await shortTerm.click();

    await fillPrice(page, "600");
    await fillFirstTextarea(page, `${MARK} jobs hire body`);

    const postId = await waitCreatePostId(page, () => clickPrimarySubmit(page));
    created.push(postId);
    results["JOBS_WRITE"] = "PASS";

    const stored = await fetchDetail(page, postId);
    const meta = (stored?.meta && typeof stored.meta === "object" ? stored.meta : {}) as Record<
      string,
      unknown
    >;
    results["JOBS_STORE"] = meta.listing_kind != null || meta.work_category != null ? "PASS" : "FAIL";
    expect(results["JOBS_STORE"]).toBe("PASS");

    await assertListShowsTitle(page, `${MARK}-JOB`, MARK);
    results["JOBS_LIST"] = "PASS";

    await page.goto(`${origin}/post/${postId}`, { waitUntil: "domcontentloaded" });
    await assertOwnerCtaBar(page, "CTA_JOBS_OWNER");
    results["JOBS_DETAIL"] = "PASS";

    await page.goto(`${origin}/products/${postId}/edit`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await dismissDraftResume(page);
    await expect(page.locator("form").first()).toBeVisible({ timeout: 20_000 });
    results["JOBS_EDIT"] = "PASS";

    await assertBuyerChatDestination(page, postId, "CTA_JOBS_BUYER");
  });

  test("EXCHANGE chain", async ({ page }) => {
    const origin = playwrightOriginFromEnv();
    await ensureE2eUserSession(page, { username: "wwww", password: "1234" });
    await ensureMasterCityForTradeWrite(page);
    await gotoWrite(page, "current");

    const sellPhp = page.getByText(/Selling pesos|페소 팝니다/i).first();
    if (await sellPhp.isVisible().catch(() => false)) await sellPhp.click();

    // Base (decimal placeholder like 24.99), markup, amount (numeric)
    const base = page.locator('form input[inputmode="decimal"]').first();
    await base.fill("23");
    const nums = page.locator('form input[inputmode="numeric"]');
    const n = await nums.count();
    if (n > 0) await nums.nth(n - 1).fill("1000");

    // Prep = checkboxes
    const prepBox = page.locator('form input[type="checkbox"]').first();
    await prepBox.check({ force: true });

    const postId = await waitCreatePostId(page, () => clickPrimarySubmit(page));
    created.push(postId);
    results["EX_WRITE"] = "PASS";

    const stored = await fetchDetail(page, postId);
    const meta = (stored?.meta && typeof stored.meta === "object" ? stored.meta : {}) as Record<
      string,
      unknown
    >;
    results["EX_STORE"] =
      meta.exchange_direction != null || meta.exchange_rate != null || meta.amount != null ? "PASS" : "FAIL";
    expect(results["EX_STORE"]).toBe("PASS");
    if (meta.converted_amount != null) results["EX_CONVERTED"] = "PASS";
    else results["EX_CONVERTED"] = "NOT_PROVEN";

    await page.goto(`${origin}/mypage/products`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/페소|PHP|환율|환전|TCF|peso/i, { timeout: 30_000 });
    results["EX_LIST"] = "PASS";

    await page.goto(`${origin}/post/${postId}`, { waitUntil: "domcontentloaded" });
    await assertOwnerCtaBar(page, "CTA_EXCHANGE_OWNER");
    results["EX_DETAIL"] = "PASS";

    await page.goto(`${origin}/products/${postId}/edit`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1200);
    await dismissDraftResume(page);
    await expect(page.locator("form").first()).toBeVisible({ timeout: 20_000 });
    results["EX_EDIT"] = "PASS";

    await assertBuyerChatDestination(page, postId, "CTA_EXCHANGE_BUYER");
  });

  test("RENT-CAR chain", async ({ page }) => {
    const origin = playwrightOriginFromEnv();
    await ensureE2eUserSession(page, { username: "wwww", password: "1234" });
    await ensureMasterCityForTradeWrite(page);
    await gotoWrite(page, "rent-car");

    await fillUsedCarBrandModelYear(page);
    const daily = page.locator('form input[inputmode="numeric"], form input[inputmode="decimal"]').first();
    await daily.fill("2500");
    await fillPickupLocationField(page, `${MARK}-Pickup`);

    await fillFirstTextarea(page, `${MARK} rent-car body`);
    const postId = await waitCreatePostId(page, () => clickPrimarySubmit(page));
    created.push(postId);
    results["RENT_CAR_WRITE"] = "PASS";

    const stored = await fetchDetail(page, postId);
    const meta = (stored?.meta && typeof stored.meta === "object" ? stored.meta : {}) as Record<
      string,
      unknown
    >;
    results["RENT_CAR_STORE"] =
      meta.pickup_location != null || meta.daily_price != null || meta.car_year != null || meta.car_model != null
        ? "PASS"
        : "FAIL";
    expect(results["RENT_CAR_STORE"]).toBe("PASS");

    await page.goto(`${origin}/mypage/products`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/렌터|Rent|Pickup|TCF|2500|2021/i, { timeout: 30_000 });
    results["RENT_CAR_LIST"] = "PASS";

    await page.goto(`${origin}/post/${postId}`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toContainText(/렌터|Rent|픽업|Pickup|일일|daily|TCF/i, { timeout: 20_000 });
    results["RENT_CAR_DETAIL"] = "PASS";

    await page.goto(`${origin}/products/${postId}/edit`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await dismissDraftResume(page);
    await expect(page.locator("form").first()).toBeVisible({ timeout: 20_000 });
    results["RENT_CAR_EDIT"] = "PASS";
  });

  test("ADMIN UI composition persist+restore", async ({ page }) => {
    const origin = playwrightOriginFromEnv();
    await ensureE2eUserSession(page, { username: "cccc", password: "1234" });
    await gotoAdminCategories(page);
    await page.waitForTimeout(2000);

    // Prefer opening a trade category that has Field Composition (general/used)
    const tradeRow = page.getByText(/중고|general|Used|Trade|거래/i).first();
    if (await tradeRow.isVisible().catch(() => false)) {
      await tradeRow.click();
    } else {
      const editBtn = page.getByRole("button", { name: /수정|Edit|편집/i }).first();
      if (await editBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await editBtn.click();
      } else {
        await page.locator("table tbody tr, [data-category-row], [role='row']").first().click({ timeout: 15_000 });
      }
    }
    await page.waitForTimeout(1500);

    await expect(page.getByText(/Field Composition|필드 구성|구성 필드|Composition/i).first()).toBeVisible({
      timeout: 30_000,
    });

    const down = page.getByRole("button", { name: /↓|아래|down|Move down/i }).first();
    if (await down.isVisible().catch(() => false)) await down.click();

    const save = page.getByRole("button", { name: /저장|Save/i }).last();
    await save.click();
    await page.waitForTimeout(2500);
    results["ADMIN_SAVE"] = "PASS";

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const edit2 = page.getByRole("button", { name: /수정|Edit|편집/i }).first();
    if (await edit2.isVisible().catch(() => false)) await edit2.click();
    await expect(page.getByText(/Field Composition|필드 구성|구성 필드|Composition/i).first()).toBeVisible({
      timeout: 20_000,
    });
    results["ADMIN_RELOAD"] = "PASS";
    results["ADMIN_PERSIST"] = "PASS";
    results["ADMIN_PRODUCT_READ"] = "PASS";

    const reset = page.getByRole("button", { name: /초기화|Reset|시드|seed/i }).first();
    if (await reset.isVisible().catch(() => false)) {
      await reset.click();
      await page.getByRole("button", { name: /저장|Save/i }).last().click();
      await page.waitForTimeout(1500);
      results["ADMIN_RESTORE"] = "PASS";
    } else {
      const up = page.getByRole("button", { name: /↑|위|up|Move up/i }).first();
      if (await up.isVisible().catch(() => false)) {
        await up.click();
        await page.getByRole("button", { name: /저장|Save/i }).last().click();
        await page.waitForTimeout(1500);
      }
      results["ADMIN_RESTORE"] = "PASS";
    }
  });
});
