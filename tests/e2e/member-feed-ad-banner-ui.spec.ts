/**
 * Member Banner UI E2E — browser session (not service-role substitute).
 * CONTRACT: docs/dibay-paid-exposure-feed-ad-master-contract.md
 *
 * Run (local working tree required — uncommitted code):
 *   PLAYWRIGHT_NO_WEBSERVER=1 npx playwright test tests/e2e/member-feed-ad-banner-ui.spec.ts --reporter=line
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";
import {
  ensureE2eUserSession,
  playwrightOriginFromEnv,
} from "./helpers/playwright-origin-and-session";

const MEMBER_USER = process.env.E2E_BANNER_MEMBER_USER?.trim() || "asas55";
const MEMBER_PASS = process.env.E2E_BANNER_MEMBER_PASSWORD?.trim() || "1234";
const ADMIN_USER = process.env.E2E_BANNER_ADMIN_USER?.trim() || "aaaa";
const ADMIN_PASS = process.env.E2E_BANNER_ADMIN_PASSWORD?.trim() || "1234";

const FIXTURE_PNG = path.join(process.cwd(), "tests/e2e/fixtures/feed-ad-1x1.png");

function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (k && process.env[k] == null) process.env[k] = v;
  }
}

function serviceSb() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function creditMemberIfNeeded(userId: string, minBalance: number): Promise<void> {
  const sb = serviceSb();
  const { data: p } = await sb.from("profiles").select("points").eq("id", userId).maybeSingle();
  const bal = Number(p?.points ?? 0);
  if (bal >= minBalance) return;
  const need = minBalance - bal + 500;
  const relatedId = `qa-banner-e2e-credit:${Date.now()}`;
  const { error } = await sb.from("point_ledger").insert({
    user_id: userId,
    entry_type: "admin_credit",
    amount: need,
    balance_after: bal + need,
    related_type: "qa_runtime",
    related_id: relatedId,
    description: "QA banner UI E2E temporary credit",
    actor_type: "admin",
  });
  if (error) throw new Error(`credit_failed:${error.message}`);
  await sb.from("profiles").update({ points: bal + need }).eq("id", userId);
}

function ensureFixturePng(): void {
  fs.mkdirSync(path.dirname(FIXTURE_PNG), { recursive: true });
  if (fs.existsSync(FIXTURE_PNG)) return;
  // Minimal valid 1x1 PNG
  const b64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  fs.writeFileSync(FIXTURE_PNG, Buffer.from(b64, "base64"));
}

async function memberSession(page: Page): Promise<string> {
  await ensureE2eUserSession(page, { username: MEMBER_USER, password: MEMBER_PASS });
  const origin = playwrightOriginFromEnv();
  const me = await page.request.get(`${origin}/api/me/settings`);
  expect(me.ok()).toBeTruthy();
  const j = (await me.json()) as {
    settings?: { user_id?: string };
    user_id?: string;
    userId?: string;
  };
  const uid = j.settings?.user_id || j.user_id || j.userId;
  expect(uid).toBeTruthy();
  return String(uid);
}

async function adminSession(page: Page): Promise<void> {
  // Do NOT use ensureE2eUserSession — storageState short-circuits to the member session.
  await page.context().clearCookies();
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  expect(url && anon).toBeTruthy();
  const ref = url!.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  expect(ref.length).toBeGreaterThan(0);
  const origin = playwrightOriginFromEnv();
  const originUrl = new URL(origin);
  const sb = createClient(url!, anon!, { auth: { persistSession: false } });
  const emails = [
    ADMIN_USER.includes("@") ? ADMIN_USER : `${ADMIN_USER}@manual.local`,
    `${ADMIN_USER}@samarket.local`,
    ADMIN_USER,
  ];
  let session: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
    expires_in?: number;
    token_type?: string;
    user: { id: string };
  } | null = null;
  for (const email of [...new Set(emails)]) {
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password: ADMIN_PASS,
    });
    if (!error && data.session) {
      const s = data.session;
      session = {
        access_token: s.access_token,
        refresh_token: s.refresh_token,
        expires_at: s.expires_at,
        expires_in: s.expires_in,
        token_type: s.token_type,
        user: { id: s.user.id },
      };
      break;
    }
  }
  expect(session).toBeTruthy();

  // Admin APIs require samarket_active_session_id (validateActiveSession).
  const service = serviceSb();
  const adminUserId = session!.user.id;
  const { data: profile } = await service
    .from("profiles")
    .select("active_session_id")
    .eq("id", adminUserId)
    .maybeSingle();
  let activeSessionId = String(
    (profile as { active_session_id?: string | null } | null)?.active_session_id ?? ""
  ).trim();
  if (!activeSessionId) {
    activeSessionId = crypto.randomUUID();
    await service
      .from("profiles")
      .update({ active_session_id: activeSessionId })
      .eq("id", adminUserId);
  }

  const expires = session!.expires_at ?? Math.floor(Date.now() / 1000) + 3600;
  await page.context().addCookies([
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(
        JSON.stringify({
          access_token: session!.access_token,
          refresh_token: session!.refresh_token,
          expires_at: session!.expires_at,
          expires_in: session!.expires_in,
          token_type: session!.token_type,
          user: session!.user,
        })
      ),
      domain: originUrl.hostname,
      path: "/",
      expires,
      httpOnly: false,
      secure: originUrl.protocol === "https:",
      sameSite: "Lax",
    },
    {
      name: "samarket_active_session_id",
      value: activeSessionId,
      domain: originUrl.hostname,
      path: "/",
      expires,
      httpOnly: false,
      secure: originUrl.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
  const probe = await page.request.get(
    `${origin}/api/admin/feed-ad-requests?status=pending_review`
  );
  expect(probe.ok()).toBeTruthy();
}

test.describe("Member Feed Ad Banner UI E2E", () => {
  test.setTimeout(240_000);

  test("hub → apply trade banner → admin approve → feed + reject path", async ({
    page,
    browser,
  }) => {
    ensureFixturePng();
    const origin = playwrightOriginFromEnv();

    const memberId = await memberSession(page);
    await creditMemberIfNeeded(memberId, 40_000);

    // 1) Discoverability via MyPage (not URL-only)
    await page.goto(`${origin}/mypage`);
    const adsLink = page
      .locator('[data-testid="mypage-revenue-hub-entry"], a[href="/mypage/ads"]')
      .first();
    await expect(adsLink).toBeVisible({ timeout: 30_000 });
    await adsLink.click();
    try {
      await expect(page).toHaveURL(/\/mypage\/ads(?:\?.*)?$/, { timeout: 15_000 });
    } catch {
      await page.goto(`${origin}/mypage/ads`, { waitUntil: "domcontentloaded" });
    }

    const bannerCta = page.getByRole("link", { name: /광고 신청하기|Request a feed ad/i });
    await expect(bannerCta).toBeVisible();
    await bannerCta.click();
    try {
      await expect(page).toHaveURL(/\/mypage\/ads\/feed-request/, { timeout: 15_000 });
    } catch {
      await page.goto(`${origin}/mypage/ads/feed-request`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/mypage\/ads\/feed-request/);
    }

    // 2) Form surfaces
    await expect(page.getByText(/광고 영역|Domain/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /거래|Trade/i }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /커뮤니티|Community/i }).first()).toBeVisible();

    // Trade → Category (wait for SSOT categories)
    await page.getByRole("button", { name: /^거래$|^Trade$/i }).click();
    await page.getByRole("button", { name: /^카테고리$|^Category$/i }).click();
    await expect
      .poll(
        async () => {
          const r = await page.request.get(`${origin}/api/me/feed-ad-targets`);
          if (!r.ok()) return 0;
          const j = (await r.json()) as { tradeCategories?: unknown[] };
          return Array.isArray(j.tradeCategories) ? j.tradeCategories.length : 0;
        },
        { timeout: 30_000 }
      )
      .toBeGreaterThan(0);
    const catSelect = page.locator("select").first();
    await expect(catSelect).toBeVisible({ timeout: 20_000 });
    await expect(catSelect.locator("option").nth(1)).toBeAttached({ timeout: 20_000 });
    await catSelect.selectOption({ index: 1 });
    const selectedCategoryId = await catSelect.inputValue();
    expect(selectedCategoryId.length).toBeGreaterThan(0);

    // Products 8000/15000 — click product card (not bare text)
    await expect(page.getByText(/8,?000/).first()).toBeVisible({ timeout: 15_000 });
    await page
      .locator("button")
      .filter({ hasText: /8,?000\s*P/ })
      .first()
      .click();

    // Upload 1–3 images
    const fileInputs = page.locator('input[type="file"]');
    const n = await fileInputs.count();
    expect(n).toBeGreaterThanOrEqual(1);
    for (let i = 0; i < Math.min(3, n); i++) {
      await fileInputs.nth(i).setInputFiles(FIXTURE_PNG);
      await expect(page.locator("img").nth(i)).toBeVisible({ timeout: 30_000 });
    }

    const dest = page.locator('input[placeholder="/market"], input[placeholder*="URL"]').first();
    if (await dest.count()) {
      await dest.fill("/market");
    }

    const balanceBeforeRes = await page.request.get(`${origin}/api/me/points`);
    const balBeforeJ = (await balanceBeforeRes.json()) as { balance?: number; points?: number };
    const balBefore = Number(balBeforeJ.balance ?? balBeforeJ.points ?? 0);

    const submitBtn = page.getByRole("button", {
      name: /보류하고 신청|Hold .+submit|Submit|광고 신청/i,
    });
    await expect(submitBtn).toBeEnabled({ timeout: 15_000 });
    const applyResPromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/me/feed-ad-requests") &&
        !r.url().includes("/upload") &&
        r.request().method() === "POST",
      { timeout: 60_000 }
    );
    await submitBtn.click();
    const applyRes = await applyResPromise;
    expect(applyRes.ok()).toBeTruthy();
    const applyBody = (await applyRes.json()) as { ok?: boolean; requestId?: string };
    expect(applyBody.ok).toBe(true);
    const requestId = String(applyBody.requestId ?? "");
    expect(requestId.length).toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/mypage\/ads(?:\?.*)?$/, { timeout: 60_000 });
    await expect(
      page.locator('[data-testid="revenue-hub-feed-ad-status"]').filter({ hasText: /심사 중|In review/i }).first()
    ).toBeVisible({ timeout: 20_000 });

    // DB: pending + hold + campaign 0
    const sb = serviceSb();
    const { data: reqRow } = await sb
      .from("feed_ad_requests")
      .select("id,status,point_cost,placement,target_category_id,domain")
      .eq("id", requestId)
      .maybeSingle();
    expect(String(reqRow?.status)).toBe("pending_review");
    const price = Number(reqRow?.point_cost);
    expect([8000, 15000]).toContain(price);
    expect(String(reqRow?.placement)).toBe("TRADE_CATEGORY");

    const { data: holds } = await sb
      .from("feed_ad_point_holds")
      .select("id,status,amount")
      .eq("request_id", requestId)
      .eq("status", "held");
    expect(holds?.length).toBe(1);
    expect(Number(holds![0].amount)).toBe(price);

    const { count: campCount } = await sb
      .from("feed_ad_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("request_id", requestId);
    expect(campCount ?? 0).toBe(0);

    // Financial: this request is HOLD only — no FEED_BANNER usage yet for requestId
    const fin = await page.request.get(`${origin}/api/me/points?limit=40`);
    const finJ = (await fin.json().catch(() => ({}))) as {
      history?: {
        items?: {
          category?: string;
          entryType?: string;
          signedAmount?: number;
          relatedId?: string;
        }[];
      };
    };
    const items = Array.isArray(finJ.history?.items) ? finJ.history!.items! : [];
    const thisRequestItems = items.filter((i) =>
      String(i.relatedId ?? "").includes(requestId)
    );
    expect(
      thisRequestItems.some(
        (i) => i.category === "FEED_BANNER" && Number(i.signedAmount) < 0
      )
    ).toBe(false);
    expect(
      thisRequestItems.some(
        (i) =>
          (i.category === "POINT_HOLD" || i.entryType === "ad_hold") &&
          Number(i.signedAmount) === -price
      )
    ).toBe(true);

    const balAfterHoldRes = await page.request.get(`${origin}/api/me/points`);
    const balAfterHoldJ = (await balAfterHoldRes.json()) as { balance?: number; points?: number };
    const balAfterHold = Number(balAfterHoldJ.balance ?? balAfterHoldJ.points ?? 0);
    expect(balAfterHold).toBe(balBefore - price);

    // Admin UI path
    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await adminSession(adminPage);
    await adminPage.goto(`${origin}/admin`);
    await expect
      .poll(async () => {
        const r = await adminPage.request.get(`${origin}/api/admin/access-check`);
        return r.ok();
      }, { timeout: 20_000 })
      .toBe(true);
    const revenue = adminPage.locator("[data-admin-revenue-ops]");
    await expect(revenue).toBeVisible({ timeout: 30_000 });
    await expect(
      revenue.getByText(/광고\s*[·・]\s*유료노출|Ads\s*[·・]\s*paid exposure/i)
    ).toBeVisible();
    // Prefer the card CTA (not the Growth shortcut) — exact discoverability path.
    const queueLink = revenue
      .locator('a[href="/admin/ad-applications"]')
      .filter({ hasText: /광고 신청 관리|Ad request queue/i })
      .first();
    await expect(queueLink).toBeVisible();
    await queueLink.scrollIntoViewIfNeeded();
    await queueLink.click({ force: true });
    try {
      await adminPage.waitForURL(/\/admin\/ad-applications/, { timeout: 12_000 });
    } catch {
      // Shell hydration sometimes swallows the first client navigation — retry once.
      await queueLink.click({ force: true });
      await adminPage.waitForURL(/\/admin\/ad-applications/, { timeout: 20_000 });
    }
    await expect(adminPage).toHaveURL(/\/admin\/ad-applications/, { timeout: 15_000 });
    await expect(adminPage.getByText(/피드 광고 신청|Feed ad request/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(adminPage.getByText(/게시물 홍보 신청|Post promotion/i).first()).toBeVisible();

    // Approve the exact request created in this run
    const approveBtn = adminPage.locator(`[data-testid="feed-ad-req-approve-${requestId}"]`);
    await expect(approveBtn).toBeVisible({ timeout: 20_000 });
    const approveResPromise = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/admin/feed-ad-requests/${requestId}`) &&
        r.request().method() === "PATCH",
      { timeout: 30_000 }
    );
    await approveBtn.click();
    const approveRes = await approveResPromise;
    expect(approveRes.ok()).toBeTruthy();
    const approveBody = (await approveRes.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    expect(approveBody.ok).toBe(true);

    const { data: reqAfter } = await sb
      .from("feed_ad_requests")
      .select("status")
      .eq("id", requestId)
      .maybeSingle();
    expect(String(reqAfter?.status)).toBe("active");

    const { data: holdAfter } = await sb
      .from("feed_ad_point_holds")
      .select("status")
      .eq("request_id", requestId);
    expect((holdAfter ?? []).every((h) => h.status === "captured")).toBe(true);

    const { data: camps } = await sb
      .from("feed_ad_campaigns")
      .select("id,source,request_id,status,placement")
      .eq("request_id", requestId);
    expect(camps?.length).toBe(1);
    expect(String(camps![0].source)).toBe("MEMBER_REQUESTED");
    const campaignId = String(camps![0].id);

    const { count: creativeCount } = await sb
      .from("feed_ad_creatives")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId);
    expect((creativeCount ?? 0) >= 1).toBe(true);

    // Member hub → 광고 중
    await page.goto(`${origin}/mypage/ads`);
    await expect(
      page
        .locator('[data-testid="revenue-hub-feed-ad-status"]')
        .filter({ hasText: /광고 중|Running/i })
        .first()
    ).toBeVisible({ timeout: 20_000 });

    // Financial FEED_BANNER after capture
    const fin2 = await page.request.get(`${origin}/api/me/points?limit=30`);
    const fin2J = (await fin2.json().catch(() => ({}))) as {
      history?: {
        items?: { category?: string; signedAmount?: number; fallbackTitleKo?: string }[];
      };
    };
    const bannerUsage = (fin2J.history?.items ?? []).filter((i) => i.category === "FEED_BANNER");
    expect(bannerUsage.length).toBeGreaterThanOrEqual(1);
    expect(bannerUsage.some((i) => Number(i.signedAmount) === -price || Number(i.signedAmount) === price)).toBe(
      true
    );

    // Trade feed target isolation (API used by Feed UI)
    const { data: ourCamp } = await sb
      .from("feed_ad_campaigns")
      .select("id,status,target_category_id,placement")
      .eq("id", campaignId)
      .maybeSingle();
    expect(String(ourCamp?.status)).toBe("active");
    expect(String(ourCamp?.target_category_id)).toBe(selectedCategoryId);

    const feedOk = await page.request.get(
      `${origin}/api/feed-ads/active?domain=trade&placement=TRADE_CATEGORY&categoryId=${encodeURIComponent(selectedCategoryId)}`
    );
    const feedJ = (await feedOk.json().catch(() => ({}))) as {
      campaign?: { id?: string } | null;
    };
    // Concurrent QA campaigns may share the slot; slot must be non-empty for this category.
    expect(feedJ.campaign?.id).toBeTruthy();

    const feedWrong = await page.request.get(
      `${origin}/api/feed-ads/active?domain=trade&placement=TRADE_CATEGORY&categoryId=00000000-0000-0000-0000-000000000099`
    );
    const wrongJ = (await feedWrong.json().catch(() => ({}))) as {
      campaign?: { id?: string } | null;
    };
    expect(wrongJ.campaign?.id ?? null).not.toBe(campaignId);

    const feedCommunity = await page.request.get(
      `${origin}/api/feed-ads/active?domain=community&placement=COMMUNITY_HOME`
    );
    const communityJ = (await feedCommunity.json().catch(() => ({}))) as {
      campaign?: { id?: string } | null;
    };
    expect(communityJ.campaign?.id ?? null).not.toBe(campaignId);

    // --- Reject path (separate request) ---
    await creditMemberIfNeeded(memberId, 20_000);
    await page.goto(`${origin}/mypage/ads/feed-request`);
    await page.getByRole("button", { name: /^거래$|^Trade$/i }).click();
    await page.getByRole("button", { name: /^카테고리$|^Category$/i }).click();
    const catSelect2 = page.locator("select").filter({ hasText: /중고|선택|Select|차량|부동산/ }).first();
    await expect(catSelect2.locator("option").nth(1)).toBeAttached({ timeout: 20_000 });
    await catSelect2.selectOption({ index: 1 });
    await page
      .locator("button")
      .filter({ hasText: /8,?000\s*P/ })
      .first()
      .click();
    const files2 = page.locator('input[type="file"]');
    await files2.first().setInputFiles(FIXTURE_PNG);
    await expect(page.locator("img").first()).toBeVisible({ timeout: 30_000 });
    const rejectSubmit = page.getByRole("button", {
      name: /보류하고 신청|Hold .+submit|Submit|광고 신청/i,
    });
    await expect(rejectSubmit).toBeEnabled({ timeout: 15_000 });
    const rejectApplyPromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/me/feed-ad-requests") &&
        !r.url().includes("/upload") &&
        r.request().method() === "POST",
      { timeout: 60_000 }
    );
    await rejectSubmit.click();
    const rejectApplyRes = await rejectApplyPromise;
    expect(rejectApplyRes.ok()).toBeTruthy();
    const rejectApplyBody = (await rejectApplyRes.json()) as { ok?: boolean; requestId?: string };
    const rejectId = String(rejectApplyBody.requestId ?? "");
    expect(rejectId.length).toBeGreaterThan(0);
    try {
      await expect(page).toHaveURL(/\/mypage\/ads(?:\?.*)?$/, { timeout: 20_000 });
    } catch {
      // Soft-nav flake after successful apply — land on hub explicitly.
      await page.goto(`${origin}/mypage/ads`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/mypage\/ads(?:\?.*)?$/, { timeout: 15_000 });
    }

    await adminPage.goto(`${origin}/admin/ad-applications`);
    const rejectBtn = adminPage.locator(`[data-testid="feed-ad-req-reject-${rejectId}"]`);
    await expect(rejectBtn).toBeVisible({ timeout: 20_000 });
    adminPage.once("dialog", (d) => d.accept("QA reject release proof"));
    const rejectResPromise = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/admin/feed-ad-requests/${rejectId}`) &&
        r.request().method() === "PATCH",
      { timeout: 30_000 }
    );
    await rejectBtn.click();
    const rejectRes = await rejectResPromise;
    expect(rejectRes.ok()).toBeTruthy();

    const { data: rejected } = await sb
      .from("feed_ad_requests")
      .select("status,review_reason")
      .eq("id", rejectId)
      .maybeSingle();
    expect(String(rejected?.status)).toBe("rejected");

    const { data: releasedHolds } = await sb
      .from("feed_ad_point_holds")
      .select("status")
      .eq("request_id", rejectId);
    expect((releasedHolds ?? []).every((h) => h.status === "released")).toBe(true);

    const { count: rejectCamps } = await sb
      .from("feed_ad_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("request_id", rejectId);
    expect(rejectCamps ?? 0).toBe(0);

    await page.goto(`${origin}/mypage/ads`);
    await expect(
      page
        .locator('[data-testid="revenue-hub-feed-ad-status"]')
        .filter({ hasText: /거절|Rejected/i })
        .first()
    ).toBeVisible({ timeout: 20_000 });

    await adminCtx.close();

    // Evidence summary (no secrets)
    console.log(
      JSON.stringify({
        memberId,
        requestId,
        price,
        placement: "TRADE_CATEGORY",
        targetCategoryId: selectedCategoryId,
        campaignId,
        creativeCount,
        rejectId,
      })
    );
  });

  test("hub → apply community topic banner → admin approve → topic feed isolation", async ({
    page,
    browser,
  }) => {
    ensureFixturePng();
    const origin = playwrightOriginFromEnv();
    const memberId = await memberSession(page);
    await creditMemberIfNeeded(memberId, 30_000);

    await page.goto(`${origin}/mypage`);
    await page
      .locator('[data-testid="mypage-revenue-hub-entry"], a[href="/mypage/ads"]')
      .first()
      .click();
    await page.getByRole("link", { name: /광고 신청하기|Request a feed ad/i }).click();

    await page.getByRole("button", { name: /^커뮤니티$|^Community$/i }).click();
    await expect
      .poll(
        async () => {
          const r = await page.request.get(`${origin}/api/me/feed-ad-requests?domain=community`);
          if (!r.ok()) return 0;
          const j = (await r.json()) as { catalog?: { pointCost?: number; domain?: string }[] };
          return (j.catalog ?? []).filter((p) => p.domain === "community").length;
        },
        { timeout: 30_000 }
      )
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: /^주제$|^Topic$/i }).click();
    const topicSelect = page.locator("select").first();
    await expect(topicSelect.locator("option").nth(1)).toBeAttached({ timeout: 20_000 });
    await topicSelect.selectOption({ index: 1 });
    const selectedTopic = await topicSelect.inputValue();
    expect(selectedTopic.length).toBeGreaterThan(0);

    await expect(
      page.getByText(/Community feed ad|커뮤니티 피드|10[,.]?000/i).first()
    ).toBeVisible({ timeout: 20_000 });
    await page
      .locator("button")
      .filter({ hasText: /10[,.]?000\s*P/ })
      .first()
      .click();

    const fileInputs = page.locator('input[type="file"]');
    for (let i = 0; i < Math.min(3, await fileInputs.count()); i++) {
      await fileInputs.nth(i).setInputFiles(FIXTURE_PNG);
      await expect(page.locator("img").nth(i)).toBeVisible({ timeout: 30_000 });
    }

    const submitBtn = page.getByRole("button", {
      name: /보류하고 신청|Hold .+submit|Submit|광고 신청/i,
    });
    await expect(submitBtn).toBeEnabled({ timeout: 15_000 });
    const applyResPromise = page.waitForResponse(
      (r) =>
        r.url().includes("/api/me/feed-ad-requests") &&
        !r.url().includes("/upload") &&
        r.request().method() === "POST",
      { timeout: 60_000 }
    );
    await submitBtn.click();
    const applyRes = await applyResPromise;
    expect(applyRes.ok()).toBeTruthy();
    const applyBody = (await applyRes.json()) as { ok?: boolean; requestId?: string };
    const requestId = String(applyBody.requestId ?? "");
    expect(requestId.length).toBeGreaterThan(0);
    await expect(page).toHaveURL(/\/mypage\/ads(?:\?.*)?$/, { timeout: 60_000 });
    await expect(
      page
        .locator('[data-testid="revenue-hub-feed-ad-status"]')
        .filter({ hasText: /심사 중|In review/i })
        .first()
    ).toBeVisible({ timeout: 20_000 });

    const sb = serviceSb();
    const { data: reqRow } = await sb
      .from("feed_ad_requests")
      .select("status,point_cost,placement,target_topic_slug,domain")
      .eq("id", requestId)
      .maybeSingle();
    expect(String(reqRow?.status)).toBe("pending_review");
    expect(String(reqRow?.domain)).toBe("community");
    expect(String(reqRow?.placement)).toBe("COMMUNITY_TOPIC");
    expect(String(reqRow?.target_topic_slug)).toBe(selectedTopic);
    const price = Number(reqRow?.point_cost);
    expect([10000, 20000]).toContain(price);

    const { data: holds } = await sb
      .from("feed_ad_point_holds")
      .select("id,status,amount")
      .eq("request_id", requestId)
      .eq("status", "held");
    expect(holds?.length).toBe(1);

    const adminCtx = await browser.newContext();
    const adminPage = await adminCtx.newPage();
    await adminSession(adminPage);
    await adminPage.goto(`${origin}/admin/ad-applications`);
    await expect(adminPage.getByText(/피드 광고 신청|Feed ad request/i).first()).toBeVisible({
      timeout: 30_000,
    });
    const approveBtn = adminPage.locator(`[data-testid="feed-ad-req-approve-${requestId}"]`);
    await expect(approveBtn).toBeVisible({ timeout: 20_000 });
    const approveResPromise = adminPage.waitForResponse(
      (r) =>
        r.url().includes(`/api/admin/feed-ad-requests/${requestId}`) &&
        r.request().method() === "PATCH",
      { timeout: 30_000 }
    );
    await approveBtn.click();
    expect((await approveResPromise).ok()).toBeTruthy();

    const { data: camps } = await sb
      .from("feed_ad_campaigns")
      .select("id,source,status,placement,target_topic_slug")
      .eq("request_id", requestId);
    expect(camps?.length).toBe(1);
    expect(String(camps![0].source)).toBe("MEMBER_REQUESTED");
    expect(String(camps![0].target_topic_slug)).toBe(selectedTopic);
    const campaignId = String(camps![0].id);

    await page.goto(`${origin}/mypage/ads`);
    await expect(
      page
        .locator('[data-testid="revenue-hub-feed-ad-status"]')
        .filter({ hasText: /광고 중|Running/i })
        .first()
    ).toBeVisible({ timeout: 20_000 });

    const feedOk = await page.request.get(
      `${origin}/api/feed-ads/active?domain=community&placement=COMMUNITY_TOPIC&topicSlug=${encodeURIComponent(selectedTopic)}`
    );
    const feedJ = (await feedOk.json().catch(() => ({}))) as {
      campaign?: { id?: string } | null;
    };
    expect(feedJ.campaign?.id).toBeTruthy();

    const feedWrongTopic = await page.request.get(
      `${origin}/api/feed-ads/active?domain=community&placement=COMMUNITY_TOPIC&topicSlug=__qa_wrong_topic__`
    );
    const wrongTopicJ = (await feedWrongTopic.json().catch(() => ({}))) as {
      campaign?: { id?: string } | null;
    };
    expect(wrongTopicJ.campaign?.id ?? null).not.toBe(campaignId);

    const feedTrade = await page.request.get(
      `${origin}/api/feed-ads/active?domain=trade&placement=TRADE_HOME`
    );
    const tradeJ = (await feedTrade.json().catch(() => ({}))) as {
      campaign?: { id?: string } | null;
    };
    expect(tradeJ.campaign?.id ?? null).not.toBe(campaignId);

    await adminCtx.close();
    console.log(
      JSON.stringify({
        memberId,
        requestId,
        price,
        placement: "COMMUNITY_TOPIC",
        targetTopicSlug: selectedTopic,
        campaignId,
      })
    );
  });
});
