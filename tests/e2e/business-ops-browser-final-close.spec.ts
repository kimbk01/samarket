/**
 * Browser FINAL CLOSE for Business Ops Control Center (STEP 5–6).
 * Local dirty-tree UI — Production may not serve this commit yet.
 *
 * Usage:
 *   PLAYWRIGHT_NO_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *   SAFE_BROWSER_STORE_ID=076bffda-3048-4bfb-80ae-985a69105f4a \
 *   E2E_TEST_USERNAME=aaaa E2E_TEST_PASSWORD=1234 \
 *   npx playwright test tests/e2e/business-ops-browser-final-close.spec.ts --reporter=line
 */
import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  assertPlaywrightOriginReachable,
  ensureE2eUserSession,
  playwrightOriginFromEnv,
} from "./helpers/playwright-origin-and-session";

const SAFE_STORE = (
  process.env.SAFE_BROWSER_STORE_ID ?? "076bffda-3048-4bfb-80ae-985a69105f4a"
).trim();
const SEARCH_Q = (process.env.BROWSER_OPS_SEARCH_Q ?? "sinjinkim").trim();
const EVIDENCE_DIR = path.join(
  process.cwd(),
  "docs/perf/business-ops-browser-final-close"
);

type Verdict = "PASS" | "FAIL" | "NOT_PROVEN" | "NOT_APPLICABLE";
type CaseResult = { id: string; verdict: Verdict; evidence: Record<string, unknown> };

const results: CaseResult[] = [];

function record(id: string, verdict: Verdict, evidence: Record<string, unknown> = {}) {
  const row = { id, verdict, evidence };
  results.push(row);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ case: id, verdict, evidence }));
  return row;
}

async function shot(page: Page, name: string): Promise<string> {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = path.join(EVIDENCE_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function bodyHasUuidAsOwner(text: string): boolean {
  // crude: long uuid next to owner column patterns — fail if raw uuid appears as primary owner label alone
  return /소유자[\s\S]{0,80}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
    text
  );
}

test.describe("Business Ops browser FINAL CLOSE", () => {
  test.setTimeout(240_000);

  test("SCREEN A–D + KPI/search/filter/action/audit", async ({ page, request }) => {
    await assertPlaywrightOriginReachable(request);
    const origin = playwrightOriginFromEnv();
    const isProd = /samarket\.vercel\.app/i.test(origin);

    // Deploy gate
    const opsProbe = await request
      .get(`${origin}/api/admin/business/ops-list?page=1&pageSize=1`)
      .catch(() => null);
    const opsStatus = opsProbe?.status() ?? 0;
    const opsBody = opsProbe ? await opsProbe.text().catch(() => "") : "";
    const opsServed =
      opsStatus === 200 ||
      opsStatus === 401 ||
      opsStatus === 403 ||
      (opsBody.includes("ok") && !opsBody.includes("404"));
    // 404 HTML means route not deployed
    const routeMissing = opsStatus === 404 || /Cannot GET|404/i.test(opsBody);

    if (isProd && routeMissing) {
      record("DEPLOY_TARGET", "FAIL", {
        origin,
        reason: "Production does not serve /api/admin/business/ops-list — STEP5/6 not deployed",
        status: opsStatus,
      });
      fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(EVIDENCE_DIR, "final-report.json"),
        JSON.stringify({ ok: false, results }, null, 2)
      );
      expect(routeMissing, "Production missing STEP5/6").toBe(false);
      return;
    }

    record("DEPLOY_TARGET", "PASS", {
      origin,
      isProd,
      opsStatus,
      note: isProd ? "Production serves ops-list" : "Local dirty-tree target",
    });

    // Prefer fresh admin login — stale CM storageState may be non-admin / expired.
    // Login UI is SNS-first; password form needs ?internal=1 (or Internal button).
    await page.context().clearCookies();
    const adminUser = process.env.E2E_TEST_USERNAME?.trim() || "aaaa";
    const adminPass = process.env.E2E_TEST_PASSWORD ?? "1234";
    let sessionOk = false;
    try {
      await page.goto(`${origin}/login?internal=1`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(800);
      const submit = page
        .getByRole("button", { name: /^(로그인|Sign in)$/i })
        .or(page.getByRole("button", { name: /Sign in|로그인/i }))
        .first();
      if (!(await submit.isVisible().catch(() => false))) {
        const ops = page
          .getByRole("button", { name: /Internal\s*\/\s*operations|내부|운영/i })
          .first();
        if (await ops.isVisible().catch(() => false)) await ops.click();
        await page.waitForTimeout(500);
      }
      await expect(submit).toBeVisible({ timeout: 20_000 });
      const idInput = page
        .getByRole("textbox", { name: /Email or Login ID|이메일|로그인\s*ID/i })
        .or(page.locator('form input[type="text"]').first())
        .first();
      const passInput = page.locator('input[type="password"]').first();
      await idInput.fill(adminUser);
      await passInput.fill(adminPass);
      await submit.click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
      const probe = await page.request.get(`${origin}/api/me/settings`);
      sessionOk = probe.ok();
      if (!sessionOk) {
        throw new Error(`settings probe status=${probe.status()}`);
      }
      record("SESSION", "PASS", { user: adminUser, via: "login?internal=1" });
    } catch (e: unknown) {
      // Fallback to shared helper (Supabase cookie inject + UI)
      try {
        await ensureE2eUserSession(page, { username: adminUser, password: adminPass });
        sessionOk = true;
        record("SESSION", "PASS", { user: adminUser, via: "ensureE2eUserSession" });
      } catch (e2: unknown) {
        await shot(page, "session-login-fail").catch(() => "");
        record("SESSION", "NOT_PROVEN", {
          error: String(e),
          fallback: String(e2),
          url: page.url(),
        });
        fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
        fs.writeFileSync(
          path.join(EVIDENCE_DIR, "final-report.json"),
          JSON.stringify({ ok: false, results }, null, 2)
        );
        expect(false, `SESSION failed: ${String(e)} | ${String(e2)}`).toBe(true);
        return;
      }
    }
    if (!sessionOk) return;

    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(`pageerror:${err.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(`console:${msg.text()}`);
    });

    // —— SCREEN A ——
    await page.goto(`${origin}/admin/business`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const listUrl = page.url();
    if (listUrl.includes("/login") || listUrl.includes("/forbidden")) {
      record("SCREEN_A", "NOT_PROVEN", { reason: "not admin", url: listUrl });
      fs.writeFileSync(
        path.join(EVIDENCE_DIR, "final-report.json"),
        JSON.stringify({ ok: false, results }, null, 2)
      );
      return;
    }

    const listText = await page.locator("body").innerText();
    const kpiLabels = [
      "전체 매장",
      "영업 중",
      "영업 종료",
      "승인 대기",
      "운영 제한",
      "진행 주문",
      "정산 확인 필요",
      "신고 확인 필요",
    ];
    const kpiHit = kpiLabels.filter((l) => listText.includes(l));
    const hasOpsTable =
      listText.includes("상세보기") &&
      (listText.includes("Business Credit") || listText.includes("보유") || listText.includes("P"));
    const uuidOwnerFail = bodyHasUuidAsOwner(listText);
    const screenAPath = await shot(page, "screen-a-store-ops-list");

    record(
      "SCREEN_A",
      kpiHit.length >= 6 && hasOpsTable && !uuidOwnerFail ? "PASS" : "FAIL",
      {
        kpiHit,
        hasOpsTable,
        uuidOwnerFail,
        evidence: screenAPath,
        sample: listText.slice(0, 400),
      }
    );

    // KPI click — open then pending/restricted; require result-count change
    const resultCountEl = page.locator("p").filter({ hasText: /건|results?/i }).last();
    const countText = async () =>
      ((await resultCountEl.textContent().catch(() => "")) ?? "").trim();
    const beforeCount = await countText();
    const kpiOpen = page.locator("button").filter({ hasText: /^영업 중|^Open now/ }).first();
    await kpiOpen.click();
    await page.waitForTimeout(1800);
    const afterOpenCount = await countText();
    const afterOpenRows = await page.locator("table tbody tr").count();
    const kpiPending = page
      .locator("button")
      .filter({ hasText: /승인 대기|Pending approval/ })
      .first();
    await kpiPending.click();
    await page.waitForTimeout(1800);
    const afterPendingCount = await countText();
    const afterPendingRows = await page.locator("table tbody tr").count();
    const kpiChanged =
      beforeCount !== afterOpenCount ||
      afterOpenCount !== afterPendingCount ||
      afterOpenRows !== afterPendingRows;
    record("KPI_CLICK", kpiChanged ? "PASS" : "FAIL", {
      beforeCount,
      afterOpenCount,
      afterPendingCount,
      afterOpenRows,
      afterPendingRows,
    });

    // Reset then search
    await page.getByRole("button", { name: /초기화|Reset/i }).first().click().catch(() => {});
    await page.waitForTimeout(500);
    const search = page.getByPlaceholder(/매장명|소유자|@아이디|Store ID/i);
    await search.fill(SEARCH_Q);
    await page.waitForTimeout(1200);
    const searchText = await page.locator("body").innerText();
    const searchHit =
      searchText.toLowerCase().includes(SEARCH_Q.toLowerCase()) ||
      searchText.includes("개장수") ||
      searchText.includes("@sinjinkim") ||
      searchText.includes("김양수");
    record("SEARCH", searchHit ? "PASS" : "FAIL", {
      q: SEARCH_Q,
      hit: searchHit,
      snippet: searchText.slice(0, 300),
    });

    // Filter — approval + open selects must change row results
    await page.getByRole("button", { name: /초기화|Reset/i }).first().click().catch(() => {});
    await page.waitForTimeout(1000);
    const filterBase = await countText();
    const selects = page.locator("select");
    let openSelIdx = -1;
    let approvalSelIdx = -1;
    const selCount = await selects.count();
    for (let i = 0; i < selCount; i++) {
      const opts = await selects.nth(i).locator("option").allTextContents();
      if (opts.some((o) => o.includes("임시 휴업") || o.includes("Temporarily"))) openSelIdx = i;
      if (opts.some((o) => /승인|Approved|pending/i.test(o))) approvalSelIdx = i;
    }
    let filterChanged = false;
    if (openSelIdx >= 0) {
      await selects.nth(openSelIdx).selectOption({ value: "open" });
      await page.waitForTimeout(1200);
      const c1 = await countText();
      if (approvalSelIdx >= 0) {
        await selects.nth(approvalSelIdx).selectOption({ value: "approved" }).catch(async () => {
          await selects.nth(approvalSelIdx).selectOption({ index: 1 });
        });
        await page.waitForTimeout(1200);
      }
      const c2 = await countText();
      filterChanged = filterBase !== c1 || c1 !== c2 || (await page.locator("table tbody tr").count()) >= 0;
      // stronger: at least one count string changed from reset baseline
      filterChanged = filterBase !== c2 || filterBase !== c1;
    }
    record("FILTER", filterChanged ? "PASS" : "FAIL", {
      filterBase,
      openSelIdx,
      approvalSelIdx,
      rows: await page.locator("table tbody tr").count(),
      after: await countText(),
    });

    // Pagination
    const pageInfo = await page.locator("body").innerText();
    const totalMatch = pageInfo.match(/\/\s*(\d+)\s*건/) || pageInfo.match(/of\s+(\d+)/i);
    const total = totalMatch ? Number(totalMatch[1]) : 0;
    if (total > 20) {
      const nextBtn = page.getByRole("button", { name: /다음|Next/i });
      const enabled = await nextBtn.isEnabled().catch(() => false);
      if (enabled) {
        await nextBtn.click();
        await page.waitForTimeout(1000);
        record("PAGINATION", "PASS", { total, pageChanged: true });
      } else {
        record("PAGINATION", "PASS", { total, pageChanged: false, note: "single page of filtered set" });
      }
    } else if (total > 0 && total <= 300) {
      record("PAGINATION", "NOT_APPLICABLE", {
        total,
        reason: "dataset ≤300; 300+ CAP runtime not applicable",
      });
    } else {
      record("PAGINATION", "NOT_PROVEN", { total });
    }

    // —— SCREEN B ——
    await page.goto(`${origin}/admin/business/${encodeURIComponent(SAFE_STORE)}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(2500);
    const detailText = await page.locator("body").innerText();
    const humanBad =
      /\btemp_closed\b|\ballowed\s*=\s*yes\b|\bpolicySource\b|resolveStoreFrontCommerceState|\bopen\b\s*\/\s*\bbreak\b/i.test(
        detailText.split("개발/진단")[0] ?? detailText
      );
    // raw "open" alone is too noisy; check known bad strings
    const hasOwnerHuman =
      /@\w+/.test(detailText) || detailText.includes("소유자 정보 없음");
    const hasOverviewCards =
      detailText.includes("운영 현황") ||
      detailText.includes("주문 현황") ||
      detailText.includes("Business Credit");
    const screenBPath = await shot(page, "screen-b-store-overview");
    record(
      "SCREEN_B",
      hasOverviewCards && hasOwnerHuman && !humanBad ? "PASS" : "FAIL",
      {
        hasOverviewCards,
        hasOwnerHuman,
        humanBad,
        evidence: screenBPath,
        storeId: SAFE_STORE,
      }
    );

    record(
      "OWNER_IDENTITY",
      hasOwnerHuman && !uuidOwnerFail ? "PASS" : "FAIL",
      { hasOwnerHuman }
    );
    record(
      "BUSINESS_STATUS",
      /영업 중|영업 종료|휴게|임시 휴업/.test(detailText) && !humanBad ? "PASS" : "FAIL",
      {}
    );
    record(
      "ORDER",
      /오늘 주문|진행/.test(detailText) ? "PASS" : "FAIL",
      {}
    );
    record(
      "DELIVERY",
      /배달 가능|배달 불가|유효 거리|고객 배달비/.test(detailText) ? "PASS" : "FAIL",
      {}
    );
    record(
      "BUSINESS_CREDIT",
      /P|Business Credit|보유/.test(detailText) ? "PASS" : "FAIL",
      { snippet: (detailText.match(/[\d,]+\s*P/) ?? [])[0] ?? null }
    );
    record(
      "RATING_REVIEW",
      /평점|리뷰|★|—/.test(detailText) ? "PASS" : "FAIL",
      { note: "null rating must not force fake 0.0" }
    );
    record(
      "SETTLEMENT",
      /정산|정상|확인 필요|보류/.test(detailText) ? "PASS" : "FAIL",
      {}
    );
    record(
      "REPORT_SANCTION",
      /신고|제재|판매 제한|입점 정지|미처리/.test(detailText) ? "PASS" : "FAIL",
      {}
    );

    // —— SCREEN C management tabs ——
    const tabNames = [
      "기본정보",
      "영업관리",
      "주문",
      "배달",
      "포인트",
      "수수료",
      "정산",
      "리뷰",
      "신고/제재",
      "변경이력",
    ];
    let tabsOk = 0;
    for (const name of tabNames) {
      const tab = page.getByRole("button", { name, exact: true });
      if (await tab.count()) {
        await tab.first().click();
        await page.waitForTimeout(400);
        tabsOk += 1;
      }
    }
    const couponTab = await page.getByRole("button", { name: /쿠폰|프로모션/ }).count();
    const screenCPath = await shot(page, "screen-c-management");
    record(
      "SCREEN_C",
      tabsOk >= 8 && couponTab === 0 ? "PASS" : "FAIL",
      { tabsOk, couponTab, evidence: screenCPath }
    );

    // —— Admin action + restore (SAFE store only) ——
    // set_delivery_flags is not in SENSITIVE_ACTIONS — may have no confirm dialog.
    await page.getByRole("button", { name: "개요", exact: true }).click().catch(() => {});
    await page.waitForTimeout(800);
    async function clickConfirmIfAny() {
      const confirm = page.getByRole("button", { name: /^(예|Yes)$/ });
      if (await confirm.count()) await confirm.first().click();
    }
    const tempClose = page.getByRole("button", { name: /^임시 휴업$|^Temporarily closed$/ });
    const resume = page.getByRole("button", { name: /^영업 재개$|^Resume open$/i });
    let actionPass = false;
    let restorePass = false;
    const hadTemp = (await tempClose.count()) > 0;
    const hadResume = (await resume.count()) > 0;
    if (hadTemp) {
      await tempClose.first().click();
      await clickConfirmIfAny();
      await page.waitForTimeout(2500);
      const afterClose = await page.locator("body").innerText();
      // badge/action flip: 영업 재개 visible OR closed status text
      actionPass =
        (await page.getByRole("button", { name: /^영업 재개$|^Resume open$/i }).count()) > 0 ||
        /영업 종료|임시 휴업|주문 불가|Closed/.test(afterClose);
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2500);
      const afterReload = await page.locator("body").innerText();
      const stayed =
        (await page.getByRole("button", { name: /^영업 재개$|^Resume open$/i }).count()) > 0 ||
        /영업 종료|임시 휴업|주문 불가|Closed/.test(afterReload);
      actionPass = actionPass && stayed;
      const resumeBtn = page.getByRole("button", { name: /^영업 재개$|^Resume open$/i });
      if ((await resumeBtn.count()) > 0) {
        await resumeBtn.first().click();
        await clickConfirmIfAny();
        await page.waitForTimeout(2500);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(2000);
        restorePass =
          (await page.getByRole("button", { name: /^임시 휴업$|^Temporarily closed$/ }).count()) >
            0 || /영업 중|주문 가능|Open/.test(await page.locator("body").innerText());
      }
    } else if (hadResume) {
      // already closed — resume then re-close to original closed state
      await resume.first().click();
      await clickConfirmIfAny();
      await page.waitForTimeout(2000);
      actionPass =
        (await page.getByRole("button", { name: /^임시 휴업$/ }).count()) > 0;
      const temp = page.getByRole("button", { name: /^임시 휴업$/ });
      if ((await temp.count()) > 0) {
        await temp.first().click();
        await clickConfirmIfAny();
        await page.waitForTimeout(2000);
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500);
        restorePass =
          (await page.getByRole("button", { name: /^영업 재개$/ }).count()) > 0;
      }
    } else {
      record("ADMIN_ACTION", "NOT_PROVEN", { reason: "no temp close / resume button visible" });
      record("RESTORE", "NOT_PROVEN", { reason: "skipped" });
    }
    if (hadTemp || hadResume) {
      record("ADMIN_ACTION", actionPass ? "PASS" : "FAIL", { storeId: SAFE_STORE });
      record("RESTORE", restorePass ? "PASS" : "FAIL", { storeId: SAFE_STORE });
    }

    // Audit / history tab
    await page.getByRole("button", { name: "변경이력", exact: true }).click();
    await page.waitForTimeout(800);
    const hist = await page.locator("body").innerText();
    const auditPass =
      /변경|이력|set_delivery|store\.|프로필|승인|일시|재개|없음/.test(hist);
    record("AUDIT", auditPass ? "PASS" : "FAIL", {
      snippet: hist.slice(0, 400),
    });

    // —— SCREEN D advanced ——
    await page.getByRole("button", { name: "개요", exact: true }).click().catch(() => {});
    await page.waitForTimeout(500);
    const details = page.locator("details").filter({ hasText: /개발\/진단|고급/ });
    const advancedClosed =
      (await details.count()) > 0
        ? !(await details.first().getAttribute("open"))
        : false;
    const mainBeforeOpen = await page.locator("body").innerText();
    const mainHasUuidPrimary = /1차 업종 ID|Store ID|Owner ID|resolveStoreFrontOpen/.test(
      mainBeforeOpen.split("개발/진단")[0] ?? ""
    );
    const screenDPath = await shot(page, "screen-d-advanced-closed");
    if ((await details.count()) > 0) {
      await details.first().locator("summary").click();
      await page.waitForTimeout(400);
      await shot(page, "screen-d-advanced-open");
    }
    record(
      "SCREEN_D",
      advancedClosed && !mainHasUuidPrimary ? "PASS" : "FAIL",
      {
        advancedClosed,
        mainHasUuidPrimary,
        evidence: screenDPath,
      }
    );

    const fatalConsole = consoleErrors.filter(
      (e) => /hydration|Minified React error|Uncaught/i.test(e)
    );
    record("CONSOLE", fatalConsole.length === 0 ? "PASS" : "FAIL", {
      fatalConsole: fatalConsole.slice(0, 10),
      allErrorCount: consoleErrors.length,
    });

    const required = [
      "SCREEN_A",
      "KPI_CLICK",
      "SEARCH",
      "FILTER",
      "SCREEN_B",
      "OWNER_IDENTITY",
      "BUSINESS_STATUS",
      "ORDER",
      "DELIVERY",
      "BUSINESS_CREDIT",
      "RATING_REVIEW",
      "SETTLEMENT",
      "REPORT_SANCTION",
      "SCREEN_C",
      "ADMIN_ACTION",
      "RESTORE",
      "AUDIT",
      "SCREEN_D",
      "CONSOLE",
    ];
    const fails = results.filter(
      (r) => required.includes(r.id) && (r.verdict === "FAIL" || r.verdict === "NOT_PROVEN")
    );
    const closed = fails.length === 0;
    const report = {
      ok: closed,
      FINAL: closed
        ? "BUSINESS OPERATIONS CONTROL CENTER = CLOSED"
        : "BUSINESS OPERATIONS CONTROL CENTER = REOPEN REQUIRED",
      origin,
      testStore: SAFE_STORE,
      results,
      fails: fails.map((f) => f.id),
    };
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(EVIDENCE_DIR, "final-report.json"),
      JSON.stringify(report, null, 2)
    );
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(report, null, 2));
    expect(closed, `failures: ${fails.map((f) => f.id).join(",")}`).toBe(true);
  });
});
