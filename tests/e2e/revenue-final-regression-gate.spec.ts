/**
 * Final regression gate — Trade/Community promotion contracts + Admin IA click path.
 * NO new product design. Browser where required; URL-only Admin PASS forbidden.
 *
 *   PLAYWRIGHT_NO_WEBSERVER=1 npx playwright test tests/e2e/revenue-final-regression-gate.spec.ts --reporter=line
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
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function adminSession(page: Page): Promise<void> {
  await page.context().clearCookies();
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const origin = playwrightOriginFromEnv();
  const originUrl = new URL(origin);
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({
    email: `${ADMIN_USER}@manual.local`,
    password: ADMIN_PASS,
  });
  expect(error).toBeFalsy();
  expect(data.session).toBeTruthy();
  const session = data.session!;
  const service = serviceSb();
  const { data: profile } = await service
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();
  let activeSessionId = String(
    (profile as { active_session_id?: string | null } | null)?.active_session_id ?? ""
  ).trim();
  if (!activeSessionId) {
    activeSessionId = crypto.randomUUID();
    await service
      .from("profiles")
      .update({ active_session_id: activeSessionId })
      .eq("id", session.user.id);
  }
  const expires = session.expires_at ?? Math.floor(Date.now() / 1000) + 3600;
  await page.context().addCookies([
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
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
  const probe = await page.request.get(`${origin}/api/admin/access-check`);
  expect(probe.ok()).toBeTruthy();
}

test.describe("Revenue final regression gate", () => {
  test.setTimeout(240_000);

  test("Admin IA: Dashboard → ads strip → queue / promoted / feed campaigns", async ({
    page,
  }) => {
    const origin = playwrightOriginFromEnv();
    await adminSession(page);

    await page.goto(`${origin}/admin`, { waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => (await page.request.get(`${origin}/api/admin/access-check`)).ok(), {
        timeout: 20_000,
      })
      .toBe(true);

    const revenue = page.locator("[data-admin-revenue-ops]");
    await expect(revenue).toBeVisible({ timeout: 45_000 });
    await expect(
      revenue.getByText(/광고\s*[·・]\s*유료노출|Ads\s*[·・]\s*paid exposure/i)
    ).toBeVisible();

    for (const name of [
      /광고 신청 관리|Ad request queue/i,
      /게시물 상위 노출|Post paid exposure/i,
      /피드 광고 캠페인|Feed ad campaigns/i,
    ]) {
      await expect(revenue.getByRole("link", { name })).toBeVisible();
    }

    // Click → ad-applications (semantic split)
    const queueLink = revenue
      .locator('a[href="/admin/ad-applications"]')
      .filter({ hasText: /광고 신청 관리|Ad request queue/i })
      .first();
    await queueLink.scrollIntoViewIfNeeded();
    await queueLink.click({ force: true });
    try {
      await page.waitForURL(/\/admin\/ad-applications/, { timeout: 12_000 });
    } catch {
      await queueLink.click({ force: true });
      await page.waitForURL(/\/admin\/ad-applications/, { timeout: 20_000 });
    }
    await expect(page.getByText(/피드 광고 신청|Feed ad request/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText(/게시물 홍보 신청|Post promotion/i).first()).toBeVisible();

    // Promoted-items via Dashboard strip (go back to dashboard first)
    await page.goto(`${origin}/admin`, { waitUntil: "domcontentloaded" });
    const promoted = page
      .locator("[data-admin-revenue-ops] a[href='/admin/promoted-items']")
      .first();
    await expect(promoted).toBeVisible({ timeout: 30_000 });
    await promoted.click({ force: true });
    await page.waitForURL(/\/admin\/promoted-items/, { timeout: 30_000 });
    await expect(page.locator("body")).toContainText(/Trade|Community|거래|커뮤니티|홍보|Promotion|Paid/i);

    // Feed campaigns + source labels
    await page.goto(`${origin}/admin`, { waitUntil: "domcontentloaded" });
    const feedAds = page.locator("[data-admin-revenue-ops] a[href='/admin/feed-ads']").first();
    await expect(feedAds).toBeVisible({ timeout: 30_000 });
    await feedAds.click({ force: true });
    await page.waitForURL(/\/admin\/feed-ads/, { timeout: 30_000 });
    await expect(page.locator("body")).toContainText(/회원 신청|Member|관리자 직접|Admin|캠페인|Campaign/i);

    // Growth sidebar group labels (open Growth if present)
    const growth = page.getByText(/^Growth$|^그로스$/i).first();
    if (await growth.isVisible().catch(() => false)) {
      await growth.click().catch(() => null);
    }
    await expect(page.getByText(/광고\s*[·・]\s*유료노출|Ads\s*[·・]\s*paid exposure/i).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("link", { name: /광고 신청 관리|Ad request queue/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /게시물 상위 노출|Post paid exposure/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /피드 광고 캠페인|Feed ad campaigns/i }).first()).toBeVisible();
    // Legacy grouped away from primary naming where present
    const legacy = page.getByText(/기타 광고 운영|Other ad ops|legacy/i).first();
    if (await legacy.count()) {
      await expect(legacy).toBeVisible();
    }
  });

  test("Member Hub + catalog prices + legacy apply 410", async ({ page }) => {
    const origin = playwrightOriginFromEnv();
    await ensureE2eUserSession(page, { username: MEMBER_USER, password: MEMBER_PASS });

    // Hub discoverability
    await page.goto(`${origin}/mypage`);
    await page
      .locator('[data-testid="mypage-revenue-hub-entry"], a[href="/mypage/ads"]')
      .first()
      .click();
    await expect(page).toHaveURL(/\/mypage\/ads/);
    await expect(page.getByText(/게시물 홍보|Promote a post/i).first()).toBeVisible();
    await expect(page.getByText(/피드 광고|Feed advertisement/i).first()).toBeVisible();
    await expect(
      page.getByRole("link", { name: /광고 신청하기|Request a feed ad/i })
    ).toBeVisible();
    // No legacy mid-insert / home beta confusion as primary banner CTA
    await expect(page.locator("body")).not.toContainText(/홈 노출 신청\(베타\)/);

    // Catalog API — Trade 500/900 · Community 10000/20000 · Banner products
    const promo = await page.request.get(`${origin}/api/me/points/promotion-orders`);
    expect(promo.ok()).toBeTruthy();
    const promoJ = (await promo.json()) as {
      products?: { id?: string; pointCost?: number; domain?: string }[];
      catalog?: { id?: string; pointCost?: number; domain?: string }[];
    };
    const products = promoJ.products ?? promoJ.catalog ?? [];
    const byId = Object.fromEntries(
      products.filter((p) => p.id).map((p) => [String(p.id), p])
    );
    // Soft: if catalog returns products in this shape
    if (byId.trade_promote_7) {
      expect(Number(byId.trade_promote_7.pointCost)).toBe(500);
    }
    if (byId.trade_promote_14) {
      expect(Number(byId.trade_promote_14.pointCost)).toBe(900);
    }
    if (byId.community_promote_3) {
      expect(Number(byId.community_promote_3.pointCost)).toBe(10000);
    }
    if (byId.community_promote_7) {
      expect(Number(byId.community_promote_7.pointCost)).toBe(20000);
    }

    // SSOT module prices via feed-request catalog
    const feedCat = await page.request.get(`${origin}/api/me/feed-ad-requests?domain=trade`);
    expect(feedCat.ok()).toBeTruthy();
    const feedJ = (await feedCat.json()) as {
      catalog?: { id: string; pointCost: number }[];
    };
    const c3 = (feedJ.catalog ?? []).find((p) => p.id === "feed_banner_trade_3");
    const c7 = (feedJ.catalog ?? []).find((p) => p.id === "feed_banner_trade_7");
    expect(c3?.pointCost).toBe(8000);
    expect(c7?.pointCost).toBe(15000);

    // Legacy top_fixed writer closed (410) — needs real adProductId of top_fixed type
    const sb = serviceSb();
    const { data: topFixed } = await sb
      .from("ad_products")
      .select("id")
      .eq("ad_type", "top_fixed")
      .limit(1)
      .maybeSingle();
    const topFixedId = String(topFixed?.id ?? "").trim();
    expect(topFixedId.length).toBeGreaterThan(0);
    const legacy = await page.request.post(`${origin}/api/ads/apply`, {
      data: {
        postId: "00000000-0000-0000-0000-000000000001",
        adProductId: topFixedId,
        paymentMethod: "points",
      },
    });
    expect(legacy.status()).toBe(410);

    // Geometry smoke — Trade category + Community home
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${origin}/market/trade`);
    await page.waitForTimeout(1500);
    for (let i = 0; i < 8 && (await page.locator("[data-feed-ad-slot]").count()) === 0; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(300);
    }
    if ((await page.locator("[data-feed-ad-slot]").count()) > 0) {
      const ad = page.locator("[data-feed-ad-slot]").first();
      const host = page.locator('li:has(a[href^="/post/"]):not([data-feed-ad-slot])').first();
      const adBox = await ad.boundingBox();
      const hostBox = await host.boundingBox();
      expect(adBox && hostBox).toBeTruthy();
      if (adBox && hostBox) {
        expect(Math.abs(adBox.width - hostBox.width)).toBeLessThan(2);
        expect(adBox.height / hostBox.height).toBeLessThan(1.35);
      }
      await expect(ad.getByText(/광고|Ad/i).first()).toBeVisible();
    }

    await page.goto(`${origin}/philife`);
    await page.waitForTimeout(1500);
    for (let i = 0; i < 8 && (await page.locator("[data-feed-ad-slot]").count()) === 0; i++) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(300);
    }
    if ((await page.locator("[data-feed-ad-slot]").count()) > 0) {
      const ad = page.locator("[data-feed-ad-slot]").first();
      const host = page.locator("ul li:not([data-feed-ad-slot])").first();
      const adBox = await ad.boundingBox();
      const hostBox = await host.boundingBox();
      expect(adBox && hostBox).toBeTruthy();
      if (adBox && hostBox) {
        expect(Math.abs(adBox.width - hostBox.width)).toBeLessThan(2);
        expect(adBox.height / hostBox.height).toBeLessThan(1.35);
      }
    }
  });
});
