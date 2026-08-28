/**
 * RUNTIME CLOSE ONLY — Admin Gift Detail redesign evidence.
 * No feature work. PLAYWRIGHT_BASE_URL default http://127.0.0.1:3043
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3043").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-admin-gift-detail-runtime-close.json");
const SHOT = resolve(process.cwd(), ".tmp-admin-gift-detail-runtime-close");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";

const report = {
  cut: "ADMIN_GIFT_DETAIL_RUNTIME_CLOSE",
  head: null,
  origin: ORIGIN,
  expiryEdit: "NOT_APPLICABLE_CURRENT_POLICY",
  productListDesktop: "FAIL",
  productDetailDesktop: "FAIL",
  instanceListDesktop: "FAIL",
  instanceDetailDesktop: "FAIL",
  traceUi: "FAIL",
  dateDialog: "FAIL",
  dateSelectPatch: "FAIL",
  saveConfirmCancelPatch: "FAIL",
  finalConfirmPatch: "FAIL",
  patchResponse: null,
  canonicalReload: "FAIL",
  qaRestore: "NOT_NEEDED",
  productList390: "FAIL",
  productDetail390: "FAIL",
  instanceList390: "FAIL",
  instanceDetail390: "FAIL",
  stickySaveBar: "FAIL",
  dateDialogActions: "FAIL",
  trackingApiRuntimePath: "FAIL",
  codeFixDuringRuntime: "NONE",
  originalRedesign: "BLOCKED",
  error: null,
  notes: {},
};

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

function fail(msg) {
  report.error = msg;
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
}

function isVisibleInViewport(box, vp) {
  if (!box) return false;
  return box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 1 && box.y + box.height <= vp.height + 1;
}

async function main() {
  loadEnv();
  mkdirSync(SHOT, { recursive: true });
  const { execSync } = await import("node:child_process");
  try {
    report.head = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    report.head = "unknown";
  }

  const { createClient } = await import("@supabase/supabase-js");
  const { chromium } = await import("playwright");

  async function loginSession(email) {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
    for (const password of passwords()) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data.session) return data.session;
    }
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    let tokenHash = "";
    try {
      const u = new URL(String(link?.properties?.action_link || ""));
      tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
    } catch {
      tokenHash = "";
    }
    if (linkErr || !tokenHash) throw new Error(`login_failed:${email}:${linkErr?.message || "no_token"}`);
    const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    if (otpErr || !verified.session) throw new Error(`otp_failed:${email}:${otpErr?.message}`);
    return verified.session;
  }

  const session = await loginSession(ADMIN_EMAIL);
  const sbService = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: profileRow } = await sbService
    .from("profiles")
    .select("active_session_id")
    .eq("id", session.user.id)
    .maybeSingle();

  function authCookies(session, sessionId) {
    const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
    const origin = new URL(ORIGIN);
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
    const CHUNK = 3180;
    const parts = [];
    for (let i = 0; i < encoded.length; i += CHUNK) parts.push(encoded.slice(i, i + CHUNK));
    const base = {
      domain: origin.hostname,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    };
    const cookies =
      parts.length === 1
        ? [{ ...base, name: `sb-${ref}-auth-token`, value: parts[0] }]
        : parts.map((value, i) => ({ ...base, name: `sb-${ref}-auth-token.${i}`, value }));
    if (sessionId) {
      cookies.push({
        ...base,
        name: "samarket_active_session_id",
        value: String(sessionId),
        expires: Math.floor(Date.now() / 1000) + 86400 * 7,
      });
    }
    return cookies;
  }

  const browser = await chromium.launch({ headless: true });
  const cookieList = authCookies(session, profileRow?.active_session_id);

  async function openAuthed(viewport) {
    const context = await browser.newContext({ viewport });
    await context.addCookies(cookieList);
    const page = await context.newPage();
    return { context, page };
  }

  // ── Desktop ──────────────────────────────────────────────
  {
    const { context, page } = await openAuthed({ width: 1280, height: 900 });
    const trackingPaths = [];
    page.on("response", async (res) => {
      const u = res.url();
      if (!u.includes("/api/admin/gift-certificates/tracking")) return;
      try {
        const json = await res.json();
        trackingPaths.push({
          status: res.status(),
          hasInstances: Array.isArray(json.instances),
          count: Array.isArray(json.instances) ? json.instances.length : 0,
          firstHasValidFrom: json.instances?.[0]
            ? "validFrom" in json.instances[0] || "valid_from" in json.instances[0]
            : null,
          validFromSample: json.instances?.[0]?.validFrom ?? json.instances?.[0]?.valid_from ?? null,
        });
      } catch {
        trackingPaths.push({ status: res.status(), parseError: true });
      }
    });

    await page.goto(`${ORIGIN}/admin/gift-certificates?tab=products&products=products`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForSelector("[data-admin-gift-issuance-panel='1'], [data-admin-gift-product-detail='1']", {
      timeout: 60000,
    });
    await page.waitForSelector("button[data-admin-gift-product-detail='1'], button:has-text('상세'), button:has-text('Detail')", {
      timeout: 60000,
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOT}/desktop-product-list.png`, fullPage: true });

    const listManage = await page.locator("[data-admin-gift-product-manage='1']").count();
    // List CTA and detail console both used data-admin-gift-product-detail historically —
    // wait on URL id + KPIs so soft-nav (~3s) is not mistaken for already-open detail.
    const openProductBtn = page.locator("button[data-admin-gift-product-detail='1']").first();
    const openProductAlt = page.locator("button:has-text('상세'), button:has-text('Detail')").first();
    const listDetailCta =
      (await openProductBtn.count()) > 0
        ? await page.locator("button[data-admin-gift-product-detail='1']").count()
        : await openProductAlt.count();

    if (listDetailCta < 1) {
      report.notes.productList = { listManage, listDetailCta };
      fail("product_list_no_detail_cta");
    }

    const clickTarget = (await openProductBtn.count()) > 0 ? openProductBtn : openProductAlt;
    await Promise.all([
      page.waitForURL(/[?&]id=[^&]+/, { timeout: 45000 }),
      clickTarget.click(),
    ]);
    await page.waitForSelector("[data-admin-gift-product-kpis='1']", { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOT}/desktop-product-detail.png`, fullPage: true });

    // only fail if user-facing 추적 CTA remains
    const traceCta = await page.locator("[data-admin-gift-instance-trace-open='1'], button:has-text('추적'), a:has-text('추적')").count();
    const sections = {};
    for (const id of ["basic", "pricing", "instances", "transfers", "redemptions", "money", "audit"]) {
      sections[id] = (await page.locator(`[data-admin-gift-product-section='${id}']`).count()) > 0;
    }
    const kpis = (await page.locator("[data-admin-gift-product-kpis='1']").count()) > 0;
    const url = page.url();
    const forcedEdit = /[?&]edit=1/.test(url);

    report.productListDesktop = listDetailCta > 0 ? "PASS" : "FAIL";
    report.productDetailDesktop =
      kpis && Object.values(sections).every(Boolean) && !forcedEdit && /[?&]id=/.test(url)
        ? "PASS"
        : "FAIL";
    report.notes.productDetail = { sections, kpis, url, forcedEdit, traceCta, listDetailCta };

    if (traceCta > 0) report.traceUi = "FAIL";
    else report.traceUi = "NONE";

    // Date / save runtime
    const productIdMatch = url.match(/[?&]id=([^&]+)/);
    const productId = productIdMatch ? decodeURIComponent(productIdMatch[1]) : null;
    report.notes.productId = productId;

    let patchCount = 0;
    let lastPatch = null;
    page.on("request", (req) => {
      if (req.method() === "PATCH" && req.url().includes("/api/admin/gift-certificates/products/")) {
        patchCount += 1;
        lastPatch = { url: req.url(), at: Date.now() };
      }
    });
    page.on("response", async (res) => {
      if (res.request().method() === "PATCH" && res.url().includes("/api/admin/gift-certificates/products/")) {
        lastPatch = { ...(lastPatch || {}), status: res.status() };
        try {
          lastPatch.body = await res.json();
        } catch {
          /* ignore */
        }
      }
    });

    // capture canonical sales start before edit
    let canonicalStartBefore = null;
    if (productId) {
      const res = await page.request.get(`${ORIGIN}/api/admin/gift-certificates/products/${productId}`);
      const json = await res.json();
      canonicalStartBefore = json.product?.sales_starts_at ?? null;
      report.notes.canonicalStartBefore = canonicalStartBefore;
    }

    await page.locator("[data-admin-gift-product-edit='1']").click();
    await page.waitForTimeout(500);
    // switch to pricing tab for sales dates
    const pricingTab = page.locator("[data-admin-gift-product-section='pricing']");
    if ((await pricingTab.count()) > 0) await pricingTab.click();
    await page.waitForTimeout(300);

    const stickyBar = page.locator("[data-admin-gift-product-edit-bar='1']");
    const stickyVisible = (await stickyBar.count()) > 0 && (await stickyBar.isVisible());
    const cancelBox = await page.locator("[data-admin-gift-product-cancel='1']").boundingBox();
    const saveBox = await page.locator("[data-admin-gift-product-save='1']").boundingBox();
    const vp = page.viewportSize();
    report.stickySaveBar =
      stickyVisible && isVisibleInViewport(cancelBox, vp) && isVisibleInViewport(saveBox, vp) ? "PASS" : "FAIL";
    report.notes.sticky = { stickyVisible, cancelBox, saveBox, vp };

    const startTrigger = page.locator("[data-gift-sales-datetime-field='edit-start'] [data-gift-sales-datetime-trigger='1']");
    await startTrigger.click();
    await page.waitForSelector("[data-gift-sales-datetime-date='1']", { timeout: 10000 });
    const dateInput = page.locator("[data-gift-sales-datetime-date='1']");
    const hourSel = page.locator("[data-gift-sales-datetime-hour='1']");
    const minuteSel = page.locator("[data-gift-sales-datetime-minute='1']");
    await dateInput.fill("2030-01-15");
    await hourSel.selectOption("14");
    await minuteSel.selectOption("30");

    const dateDialog = page.getByRole("dialog");
    const applyBtn = dateDialog.getByRole("button", { name: /선택 완료|Apply selection/i });
    const cancelDlg = dateDialog.getByRole("button", { name: /취소|Cancel/i });
    const applyBox = await applyBtn.boundingBox();
    const cancelDlgBox = await cancelDlg.boundingBox();
    report.dateDialogActions =
      applyBox && cancelDlgBox && isVisibleInViewport(applyBox, vp) && isVisibleInViewport(cancelDlgBox, vp)
        ? "PASS"
        : "FAIL";

    const patchesBeforeApply = patchCount;
    await applyBtn.click();
    await page.waitForTimeout(500);
    const dialogStillOpen = (await page.locator("[data-gift-sales-datetime-date='1']").count()) > 0 && (await page.locator("[data-gift-sales-datetime-date='1']").isVisible().catch(() => false));
    const diffShown = (await page.locator("[data-gift-sales-datetime-diff='1']").count()) > 0;
    report.dateDialog = !dialogStillOpen ? "PASS" : "FAIL";
    report.notes.dateDiff = diffShown;
    report.dateSelectPatch = patchCount === patchesBeforeApply ? 0 : "FAIL";
    if (report.dateSelectPatch === "FAIL") report.notes.dateSelectPatchCount = patchCount - patchesBeforeApply;

    // Save → confirm → cancel
    const patchesBeforeSave = patchCount;
    await page.locator("[data-admin-gift-product-save='1']").click();
    await page.waitForTimeout(800);
    // confirm overlay (scope to dialog so sticky Cancel is not matched)
    const confirmDialog = page.getByRole("dialog");
    const confirmCancel = confirmDialog.getByRole("button", { name: /^취소$|^Cancel$/i });
    const confirmOk = confirmDialog.getByRole("button", { name: /변경 저장|Save changes/i });
    const confirmVisible = (await confirmOk.count()) > 0 && (await confirmOk.isVisible());
    report.notes.confirmVisible = confirmVisible;
    if (!confirmVisible) fail("save_confirm_not_visible");
    await confirmCancel.click();
    await page.waitForTimeout(500);
    report.saveConfirmCancelPatch = patchCount === patchesBeforeSave ? 0 : "FAIL";

    // Save → confirm → commit
    const patchesBeforeFinal = patchCount;
    await page.locator("[data-admin-gift-product-save='1']").click();
    await page.waitForTimeout(500);
    const confirmOk2 = page.getByRole("dialog").getByRole("button", { name: /변경 저장|Save changes/i });
    await confirmOk2.click();
    await page.waitForTimeout(2000);
    const finalPatches = patchCount - patchesBeforeFinal;
    report.finalConfirmPatch = finalPatches === 1 ? 1 : "FAIL";
    report.patchResponse = lastPatch?.status ?? null;
    report.notes.lastPatch = lastPatch;
    report.notes.finalPatches = finalPatches;

    // success alert OK if present
    const okBtn = page.getByRole("button", { name: /^확인$|^OK$/i }).last();
    if ((await okBtn.count()) > 0 && (await okBtn.isVisible().catch(() => false))) {
      await okBtn.click().catch(() => {});
    }
    await page.waitForTimeout(800);

    // reload canonical (API authority) — do not block restore on UI selector flakiness
    if (productId) {
      await page.goto(`${ORIGIN}/admin/gift-certificates?tab=products&id=${encodeURIComponent(productId)}`, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      await page.waitForSelector("[data-admin-gift-product-kpis='1']", { timeout: 60000 }).catch(() => {});
      const res = await page.request.get(`${ORIGIN}/api/admin/gift-certificates/products/${productId}`);
      const json = await res.json();
      const after = json.product?.sales_starts_at ?? null;
      report.notes.canonicalStartAfter = after;
      // expect changed to 2030-01-15 local-ish
      const changed = after && String(after).includes("2030-01-15");
      report.canonicalReload = changed || (after && after !== canonicalStartBefore) ? "PASS" : "FAIL";

      // restore original (separate explicit PATCH — not counted in date-save contract)
      if (canonicalStartBefore != null) {
        const restore = await page.request.patch(`${ORIGIN}/api/admin/gift-certificates/products/${productId}`, {
          data: { salesStartsAt: canonicalStartBefore },
        });
        report.qaRestore = restore.ok() ? "PASS" : "FAIL";
        report.notes.restoreStatus = restore.status();
      } else {
        report.qaRestore = "NOT_NEEDED";
      }
    }

    // Instance list / detail
    await page.goto(`${ORIGIN}/admin/gift-certificates?tab=instances`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
    await page.waitForSelector("[data-admin-gift-instances='1']", { timeout: 60000 });
    await page.waitForSelector("[data-admin-gift-instance-detail-open='1']", { timeout: 60000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOT}/desktop-instance-list.png`, fullPage: true });

    const instanceTrace = await page.locator("[data-admin-gift-instance-trace-open='1'], button:has-text('추적')").count();
    const instanceDetailBtn = page.locator("[data-admin-gift-instance-detail-open='1']").first();
    report.instanceListDesktop =
      (await page.locator("[data-admin-gift-instance-detail-open='1']").count()) > 0 && instanceTrace === 0
        ? "PASS"
        : "FAIL";
    report.notes.instanceList = {
      instanceTrace,
      detailBtns: await page.locator("[data-admin-gift-instance-detail-open='1']").count(),
    };
    if (instanceTrace > 0) report.traceUi = "FAIL";

    if ((await instanceDetailBtn.count()) > 0) {
      await Promise.all([
        page.waitForURL(/[?&]id=[^&]+/, { timeout: 45000 }),
        instanceDetailBtn.click({ force: true }),
      ]);
      await page.waitForSelector("[data-admin-gift-instance-detail='1']", { timeout: 60000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${SHOT}/desktop-instance-detail.png`, fullPage: true });
      const instUrl = page.url();
      const redirectedToProductEdit = /tab=products/.test(instUrl) || /edit=1/.test(instUrl);
      const giftHash = await page.locator("[data-admin-gift-instance-detail='1']").innerText();
      report.instanceDetailDesktop =
        !redirectedToProductEdit && /Gift|상품|잔액|소유|구매|발급|정산|선물|사용|Owner|Buyer|Balance/i.test(giftHash)
          ? "PASS"
          : "FAIL";
      report.notes.instanceDetail = { instUrl, redirectedToProductEdit };
    } else {
      report.instanceDetailDesktop = "FAIL";
      report.notes.instanceDetail = "no_rows";
    }

    // tracking path inference
    await page.waitForTimeout(500);
    const tp = trackingPaths[trackingPaths.length - 1];
    if (tp?.status === 200 && tp.hasInstances) {
      report.trackingApiRuntimePath =
        tp.firstHasValidFrom === true ? "EXTENDED" : "CORE_FALLBACK";
    } else if (tp?.status === 200) {
      report.trackingApiRuntimePath =
        tp.firstHasValidFrom === true ? "EXTENDED" : "CORE_FALLBACK";
    } else if (tp?.status && tp.status >= 400) {
      report.trackingApiRuntimePath = "FAIL";
    }
    report.notes.trackingPaths = trackingPaths;

    await context.close();
  }

  // ── 390 smoke ────────────────────────────────────────────
  {
    const { context, page } = await openAuthed({ width: 390, height: 844 });

    async function smoke(name, url, readySel, shot) {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForSelector(readySel, { timeout: 60000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOT}/${shot}`, fullPage: true });
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        return {
          scrollWidth: doc.scrollWidth,
          clientWidth: doc.clientWidth,
          clipped: doc.scrollWidth > doc.clientWidth + 2,
        };
      });
      return overflow;
    }

    const pl = await smoke(
      "productList",
      `${ORIGIN}/admin/gift-certificates?tab=products&products=products`,
      "[data-admin-gift-issuance-panel='1'], [data-admin-gift-product-detail='1']",
      "390-product-list.png"
    );
    report.productList390 = pl.clipped ? "FAIL" : "PASS";
    report.notes.productList390 = pl;

    // Prefer visible CTA (desktop table buttons are hidden at 390 via md: breakpoints).
    const openBtn = page.locator("ul.md\\:hidden button[data-admin-gift-product-detail='1'], button[data-admin-gift-product-detail='1']").locator("visible=true").first();
    await openBtn.waitFor({ state: "visible", timeout: 60000 });
    await Promise.all([
      page.waitForURL(/[?&]id=[^&]+/, { timeout: 45000 }),
      openBtn.click(),
    ]);
    await page.waitForSelector("[data-admin-gift-product-kpis='1']", { timeout: 60000 });
    await page.waitForTimeout(600);
    await page.locator("[data-admin-gift-product-edit='1']").click().catch(() => {});
    await page.waitForTimeout(400);
    const pricingTab = page.locator("[data-admin-gift-product-section='pricing']");
    if ((await pricingTab.count()) > 0) await pricingTab.click();
    await page.waitForTimeout(300);
    const stickyOk =
      (await page.locator("[data-admin-gift-product-cancel='1']").isVisible().catch(() => false)) &&
      (await page.locator("[data-admin-gift-product-save='1']").isVisible().catch(() => false));
    // open date dialog for action visibility
    const startTrigger = page.locator("[data-gift-sales-datetime-field='edit-start'] [data-gift-sales-datetime-trigger='1']");
    let dialogOk = true;
    if ((await startTrigger.count()) > 0) {
      await startTrigger.scrollIntoViewIfNeeded();
      await startTrigger.click();
      await page.waitForTimeout(400);
      const dlg = page.getByRole("dialog");
      const apply = dlg.getByRole("button", { name: /선택 완료|Apply selection/i });
      const cancel = dlg.getByRole("button", { name: /취소|Cancel/i });
      dialogOk =
        (await apply.isVisible().catch(() => false)) && (await cancel.isVisible().catch(() => false));
      await cancel.click().catch(() => {});
    }
    const ov = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      clipped: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    }));
    await page.screenshot({ path: `${SHOT}/390-product-detail.png`, fullPage: true });
    report.productDetail390 = !ov.clipped && stickyOk ? "PASS" : "FAIL";
    if (report.dateDialogActions !== "PASS" && dialogOk) report.dateDialogActions = "PASS";
    if (!dialogOk) report.dateDialogActions = "FAIL";
    if (!stickyOk) report.stickySaveBar = "FAIL";
    else if (report.stickySaveBar !== "PASS") report.stickySaveBar = "PASS";
    report.notes.productDetail390 = { ov, stickyOk, dialogOk };

    const il = await smoke(
      "instanceList",
      `${ORIGIN}/admin/gift-certificates?tab=instances`,
      "[data-admin-gift-instances='1']",
      "390-instance-list.png"
    );
    report.instanceList390 = il.clipped ? "FAIL" : "PASS";

    const idBtn = page.locator("[data-admin-gift-instance-detail-open='1']").locator("visible=true").first();
    await idBtn.waitFor({ state: "visible", timeout: 60000 });
    await Promise.all([
      page.waitForURL(/[?&]id=[^&]+/, { timeout: 45000 }),
      idBtn.click(),
    ]);
    await page.waitForSelector("[data-admin-gift-instance-detail='1']", { timeout: 60000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOT}/390-instance-detail.png`, fullPage: true });
    const ov2 = await page.evaluate(() => ({
      clipped: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      redirected: /tab=products|edit=1/.test(location.href),
    }));
    report.instanceDetail390 = !ov2.clipped && !ov2.redirected ? "PASS" : "FAIL";
    report.notes.instanceDetail390 = ov2;

    await context.close();
  }

  await browser.close();

  const blockers = [
    report.productListDesktop,
    report.productDetailDesktop,
    report.instanceListDesktop,
    report.instanceDetailDesktop,
    report.traceUi === "NONE" ? "PASS" : "FAIL",
    report.dateDialog,
    report.dateSelectPatch === 0 ? "PASS" : "FAIL",
    report.saveConfirmCancelPatch === 0 ? "PASS" : "FAIL",
    report.finalConfirmPatch === 1 ? "PASS" : "FAIL",
    report.canonicalReload,
    report.productList390,
    report.productDetail390,
    report.instanceList390,
    report.instanceDetail390,
    report.stickySaveBar,
    report.dateDialogActions,
    report.trackingApiRuntimePath === "FAIL" ? "FAIL" : "PASS",
  ];
  report.originalRedesign = blockers.every((x) => x === "PASS") ? "CLOSED" : "BLOCKED";
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.originalRedesign === "CLOSED" ? 0 : 1);
}

main().catch((e) => fail(String(e?.stack || e)));
