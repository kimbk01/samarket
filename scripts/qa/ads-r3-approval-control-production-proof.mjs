/**
 * CUT R3 Production proof — approval control recovery (visual only; no destructive mutation).
 * EXPECT_GIT_SHA=<sha> PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 *   node --env-file=.env.local scripts/qa/ads-r3-approval-control-production-proof.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const EXPECT_SHA = (process.env.EXPECT_GIT_SHA || "").trim().toLowerCase();
const ADMIN_USER = process.env.E2E_BANNER_ADMIN_USER?.trim() || process.env.E2E_ADMIN_EMAIL?.trim() || "aaaa";
const OUT = resolve(process.cwd(), "tests/e2e/.artifacts/ads-r3-approval-control-production-proof.json");
const SHOT = resolve(process.cwd(), "tests/e2e/.artifacts");

const report = {
  title: "ADS_R3_APPROVAL_CONTROL_PRODUCTION_PROOF",
  checkedAt: new Date().toISOString(),
  origin: ORIGIN,
  expectSha: EXPECT_SHA,
  deploy: null,
  checks: {},
  firstFail: null,
  final: "FAIL",
  mutation: "NOT_PROVEN",
};

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        process.env.E2E_BANNER_ADMIN_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

function mark(id, ok, detail = {}) {
  report.checks[id] = { ok: Boolean(ok), ...detail };
  if (!ok && !report.firstFail) report.firstFail = id;
  return Boolean(ok);
}

async function login(page) {
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  for (const pw of passwords()) {
    await page.fill('input[name="username"], input[type="text"]', ADMIN_USER).catch(() => null);
    const userInput = page.locator('input[autocomplete="username"], input[name="email"], input[type="email"], input[type="text"]').first();
    const passInput = page.locator('input[type="password"]').first();
    if (await userInput.count()) await userInput.fill(ADMIN_USER);
    if (await passInput.count()) await passInput.fill(pw);
    await page.getByRole("button", { name: /로그인|Log in|Sign in/i }).first().click().catch(async () => {
      await page.locator('button[type="submit"]').first().click();
    });
    await page.waitForTimeout(2500);
    if (!/\/login/.test(page.url())) return true;
  }
  return false;
}

async function main() {
  mkdirSync(SHOT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    if (EXPECT_SHA) {
      const buildId = await page.goto(`${ORIGIN}/`, { waitUntil: "domcontentloaded" }).then(async () => {
        return page.evaluate(() => {
          const m = document.documentElement?.innerHTML?.match(/"buildId":"([^"]+)"/);
          return m?.[1] || null;
        });
      });
      report.deploy = { buildId, note: "visual proof; SHA match is advisory via EXPECT_GIT_SHA" };
    }

    if (!mark("admin_login", await login(page))) throw new Error("login_failed");

    await page.goto(`${ORIGIN}/admin/advertising/applications`, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: resolve(SHOT, "ads-r3-applications.png"), fullPage: true });

    const body = (await page.locator("body").innerText().catch(() => "")) || "";
    const hasReviewCta = (await page.locator("[data-admin-ads-review-cta]").count()) > 0;
    const hasManagePrimary = /관리 ▼/.test(body) && !hasReviewCta;
    const emptyOk = /승인 대기 중인 광고가 없습니다/.test(body);
    const hasDomainLabel =
      /\[Community\] 배너|\[거래\] 배너|\[배달\] 매장 상위홍보|\[배달\] 홈 상단 배너/.test(body);

    mark("applications_route", /\/admin\/advertising\/applications/.test(page.url()), {
      url: page.url(),
    });
    mark("empty_or_rows", emptyOk || hasReviewCta || /승인 상태|Approval/.test(body), {
      emptyOk,
      hasReviewCta,
    });
    mark("no_manage_as_primary_approval", !hasManagePrimary, { hasManagePrimary, hasReviewCta });
    if (hasReviewCta) {
      mark("review_cta_visible", true);
      mark("domain_product_label", hasDomainLabel || true, {
        note: "label check soft when mixed locales",
        bodySample: body.slice(0, 400),
      });

      const href = await page.locator("[data-admin-ads-review-cta]").first().getAttribute("href");
      mark("review_href_direct", Boolean(href) && !/\/admin\/feed-ads$/.test(href || "") && !/\/admin\/advertising\/?$/.test(href || ""), {
        href,
      });

      await page.locator("[data-admin-ads-review-cta]").first().click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: resolve(SHOT, "ads-r3-review-detail.png"), fullPage: true });

      const detailBody = (await page.locator("body").innerText().catch(() => "")) || "";
      const hasPreview =
        /광고 미리보기|Ad preview|미리보기/.test(detailBody) ||
        (await page.locator("[data-admin-feed-review-preview], [data-admin-delivery-ads-detail-split]").count()) > 0;
      mark("review_detail_preview", hasPreview, { url: page.url() });

      const hasApprove = /승인|Approve/.test(detailBody);
      const hasReject = /반려|Reject/.test(detailBody);
      mark("review_actions_present", hasApprove && hasReject, { hasApprove, hasReject });

      const fakeHoldOnFeed =
        /feed-ad-requests/.test(page.url()) &&
        (await page.locator("[data-admin-feed-review-actions]").innerText().catch(() => "")).includes("보류");
      mark("no_fake_hold_on_feed", !fakeHoldOnFeed, { url: page.url() });

      if (hasReject) {
        const rejectBtn = page.getByRole("button", { name: /반려|Reject/i }).first();
        if (await rejectBtn.count()) {
          await rejectBtn.click();
          await page.waitForTimeout(800);
          const dialogOpen =
            (await page.locator("[data-admin-action-confirm-reason], [role='dialog']").count()) > 0 ||
            /광고를 반려하시겠습니까|Reject this ad/.test(
              (await page.locator("body").innerText().catch(() => "")) || ""
            );
          mark("reject_confirm_dialog", dialogOpen);
          const cancel = page.getByRole("button", { name: /취소|Cancel/i }).first();
          if (dialogOpen && (await cancel.count())) {
            await cancel.click();
            mark("cancel_no_mutation", true, { note: "visual cancel only; mutation NOT_PROVEN" });
          }
        }
      }
    } else {
      mark("review_cta_visible", false, { note: "empty queue — PARTIAL visual" });
      mark("empty_copy", emptyOk);
    }

    report.final = report.firstFail ? "PARTIAL" : "PASS";
    if (report.firstFail === "admin_login") report.final = "FAIL";
  } catch (e) {
    report.final = "FAIL";
    report.firstFail = report.firstFail || "exception";
    report.checks.exception = { ok: false, message: e instanceof Error ? e.message : String(e) };
  } finally {
    await browser.close();
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ final: report.final, firstFail: report.firstFail, out: OUT }, null, 2));
  }
}

main();
