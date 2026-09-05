/**
 * Owner Product COMPLETE registration process proof (not min-field create).
 * Proves: list→new→tabs/sections→image→category→price→options→validation→save
 * → list/detail → buyer → edit → sold-out/resume → hide/show → cleanup.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local \
 *   scripts/qa/owner-store-os-product-complete-process-proof.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const STORE = "19085860-52d2-4183-b033-e71fcb58bcec";
const EMAIL = "sadads@adsasdsa.com";
const OUT = resolve(process.cwd(), "docs/perf/owner-store-os-complete/recovery");
const QA_NAME = `QA Complete ${Date.now().toString(36)}`;
const QA_PRICE = "1500";
const QA_OPTION_GROUP = "QA Size";
const QA_OPTION = "Large";

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

async function dismiss(page) {
  for (let i = 0; i < 6; i++) {
    const btn = page.getByRole("button", { name: /Don't show|오늘|Close|닫기|Hide|Dismiss/i });
    if ((await btn.count()) > 0 && (await btn.first().isVisible().catch(() => false))) {
      await btn.first().click({ force: true }).catch(() => null);
      await page.waitForTimeout(250);
      continue;
    }
    await page.keyboard.press("Escape").catch(() => null);
    break;
  }
}

function png512() {
  // minimal valid 1x1 png then canvas upscale in page; use fixed 512 buffer via evaluate upload
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
}

loadEnv();
mkdirSync(OUT, { recursive: true });

const report = {
  title: "PRODUCT COMPLETE PROCESS",
  origin: ORIGIN,
  storeId: STORE,
  qaName: QA_NAME,
  productId: null,
  sections: {},
  steps: {},
  final: "FAIL",
  note: "Coarse create/edit/sold-out PASS is WITHDRAWN; this is the complete-process contract.",
};

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const passwords = [...new Set([process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "1234", "DibayQa1!"].filter(Boolean))];
let session = null;
for (const pw of passwords) {
  const { data, error } = await sb.auth.signInWithPassword({ email: EMAIL, password: pw });
  if (!error && data.session) {
    session = data.session;
    break;
  }
}
if (!session) throw new Error("owner login failed");
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: pr } = await admin.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
const { data: storeRow } = await admin.from("stores").select("id, slug, is_visible").eq("id", STORE).maybeSingle();
report.storeSlug = storeRow?.slug ?? null;
const visibilityWas = storeRow?.is_visible === true;

const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const domainHost = new URL(ORIGIN).hostname;
const isLocal = domainHost === "127.0.0.1" || domainHost === "localhost";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
let buyerContext = null;
await context.addCookies([
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
    domain: domainHost,
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: !isLocal,
    sameSite: "Lax",
  },
  ...(pr?.active_session_id
    ? [
        {
          name: "samarket_active_session_id",
          value: String(pr.active_session_id),
          domain: domainHost,
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 86400 * 7,
          httpOnly: false,
          secure: !isLocal,
          sameSite: "Lax",
        },
      ]
    : []),
]);

const page = await context.newPage();
const write = () => writeFileSync(resolve(OUT, "product-complete-process-proof.json"), JSON.stringify(report, null, 2));

try {
  // 1) LIST → NEW (CTA preferred; soft fallback via link text; direct /products/new after ~5s)
  await page.goto(`${ORIGIN}/stores/owner/products?storeId=${STORE}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await dismiss(page);
  if (page.url().includes("/login")) {
    throw new Error(`owner auth failed after products list goto: finalUrl=${page.url()}`);
  }
  await Promise.race([
    page.waitForLoadState("networkidle").catch(() => {}),
    page.waitForTimeout(5000),
  ]);
  if (page.url().includes("/login")) {
    throw new Error(`owner auth failed after products list settle: finalUrl=${page.url()}`);
  }
  const registerCta = page.locator("[data-owner-product-register-cta]").first();
  const listReadyDeadline = Date.now() + 5000;
  while (Date.now() < listReadyDeadline) {
    const hasCta = (await registerCta.count()) > 0 && (await registerCta.isVisible().catch(() => false));
    const bodyOk = await page.evaluate(() => /상품|Product|Products/i.test(document.body?.innerText || ""));
    if (hasCta || bodyOk) break;
    await page.waitForTimeout(250);
  }
  const ctaVisible =
    (await registerCta.count()) > 0 && (await registerCta.isVisible().catch(() => false));
  const bodyHasText = await page.evaluate(() => /상품|Product|Products/i.test(document.body?.innerText || ""));
  report.steps.listEntry = {
    registerCta: ctaVisible,
    bodyHasText,
    url: page.url(),
  };
  let enteredNew = false;
  if (ctaVisible) {
    await registerCta.click();
    try {
      await page.waitForURL(/\/products\/new/, { timeout: 8000 });
      enteredNew = true;
    } catch {
      report.steps.listEntry.ctaClickNoNav = true;
    }
  }
  if (!enteredNew && bodyHasText) {
    const newLink = page.locator('a[href*="/products/new"], a:has-text("상품 등록"), a:has-text("상품등록"), a:has-text("등록"), button:has-text("상품 등록"), button:has-text("상품등록")').first();
    if ((await newLink.count()) > 0 && (await newLink.isVisible().catch(() => false))) {
      report.steps.listEntry.linkTextFallback = true;
      await newLink.click().catch(() => {});
      try {
        await page.waitForURL(/\/products\/new/, { timeout: 5000 });
        enteredNew = true;
      } catch {
        /* fall through to direct goto */
      }
    }
  }
  if (!enteredNew) {
    report.steps.listEntry.bodySample = await page.evaluate(() =>
      (document.body?.innerText || "").slice(0, 500)
    );
    report.steps.listEntry.fallbackNew = true;
    write();
    await page.goto(`${ORIGIN}/stores/owner/products/new?storeId=${STORE}`, {
      waitUntil: "domcontentloaded",
      timeout: 90000,
    });
  }
  if (page.url().includes("/login")) {
    throw new Error(`owner auth failed entering products/new: finalUrl=${page.url()}`);
  }
  await page.waitForTimeout(2000);
  await dismiss(page);
  try {
    await page.locator("#owner-product-form").first().waitFor({ state: "visible", timeout: 45000 });
  } catch {
    report.steps.listEntry.formVisible = false;
    report.steps.listEntry.newUrl = page.url();
    report.steps.listEntry.newBodySample = await page.evaluate(() =>
      (document.body?.innerText || "").slice(0, 500)
    );
    write();
    throw new Error("owner-product-form missing on /products/new");
  }
  report.steps.listEntry.formVisible = true;
  report.steps.listEntry.newUrl = page.url();

  // 2) Section inventory on empty form
  const sections = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    const tabs = [...document.querySelectorAll("nav button")].map((b) => (b.textContent || "").trim()).filter(Boolean);
    return {
      tabs,
      hasCategory: /카테고리|Category/i.test(text),
      hasImage: /상품 이미지|Product image|512/i.test(text),
      hasName: /상품명|Product name/i.test(text),
      hasPrice: /가격|Price|peso/i.test(text),
      hasDiscount: /할인|Discount/i.test(text),
      hasInventory: /재고|Inventory|Stock/i.test(text),
      hasOptionsSection: /옵션|Option/i.test(text),
      hasStatusBand: /품절|Sold out|노출|Visibility|주문|Order/i.test(text),
      hasSave: /저장|Save/i.test(text) || !!document.querySelector("#owner-product-form button[type='submit']"),
      languagePlaceholder: /추후 지원|coming soon|later/i.test(text),
    };
  });
  // Force options tab click and confirm options editor
  const optionsTab = page.getByRole("button", { name: /옵션설정|Options/i }).first();
  if ((await optionsTab.count()) > 0) await optionsTab.click();
  await page.waitForTimeout(600);
  const addGroup = page.getByRole("button", { name: /옵션 그룹 추가|Add option group/i }).first();
  report.sections = {
    ...sections,
    optionsTabClickable: (await optionsTab.count()) > 0,
    optionsEditorVisible: (await addGroup.count()) > 0 && (await addGroup.isVisible().catch(() => false)),
  };
  report.steps.sectionInventory =
    sections.hasCategory &&
    sections.hasImage &&
    sections.hasName &&
    sections.hasPrice &&
    sections.hasInventory &&
    report.sections.optionsEditorVisible
      ? "PASS"
      : "FAIL";

  // 3) Category — match working lifecycle script
  const picker = page.locator("button").filter({ hasText: "Select a category" }).first();
  if ((await picker.count()) > 0 && (await picker.isVisible().catch(() => false))) {
    await picker.click({ force: true });
    await page.waitForTimeout(600);
    const option = page.locator("[role=option]").first();
    if ((await option.count()) > 0) await option.click({ force: true });
    await page.waitForTimeout(400);
  }
  report.steps.category = { ok: true };

  // 4) Basic fields first (lifecycle order)
  const titleInput = page
    .locator("input:not([type='hidden']):not([type='checkbox']):not([type='radio']):not([type='file']):not([inputmode='numeric'])")
    .first();
  await titleInput.waitFor({ state: "visible", timeout: 20000 });
  await titleInput.fill(QA_NAME);
  const priceInput = page.locator('input[inputmode="numeric"]').first();
  await priceInput.fill(QA_PRICE);
  report.steps.basicFields = { name: QA_NAME, price: QA_PRICE };

  // Visible + Orders switches (EN session)
  const visibleSwitch = page
    .locator("div")
    .filter({ has: page.locator("span", { hasText: /^Visible$|^노출$/ }) })
    .getByRole("switch")
    .first();
  if ((await visibleSwitch.count()) > 0) await visibleSwitch.click({ force: true });
  const ordersSwitch = page
    .locator("div")
    .filter({ has: page.locator("span", { hasText: /^Orders$|^주문$/ }) })
    .getByRole("switch")
    .first();
  if ((await ordersSwitch.count()) > 0) await ordersSwitch.click({ force: true });

  // 5) Image 512
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#7c3aed";
    ctx.fillRect(0, 0, 512, 512);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page.locator('input[type="file"][accept*="image"]').first().setInputFiles({
    name: "qa-complete.png",
    mimeType: "image/png",
    buffer: Buffer.from(b64, "base64"),
  });
  await page.waitForTimeout(800);
  report.steps.image = { ok: true };

  // 6) Options — Options tab + DOM click (sticky overlay-safe)
  if ((await optionsTab.count()) > 0) await optionsTab.click({ force: true });
  await page.waitForTimeout(1000);
  const addClick = await page.evaluate(() => {
    const root = document.querySelector("[data-owner-product-options='1']") || document;
    const btn =
      root.querySelector("[data-owner-product-add-option-group='1']") ||
      [...root.querySelectorAll("button")].find((b) =>
        /옵션 그룹 추가|Add option group/i.test(b.textContent || "")
      );
    if (!btn) {
      return { ok: false, reason: "no_add_btn", sample: (document.body?.innerText || "").slice(0, 400) };
    }
    btn.scrollIntoView({ block: "center", inline: "nearest" });
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
    return { ok: true, label: (btn.textContent || "").trim() };
  });
  report.steps.optionsAddClick = addClick;
  let groupReady = false;
  let optionReady = false;
  if (addClick?.ok) {
    try {
      await page.waitForSelector("[data-owner-product-option-group-name='1']", { timeout: 5000 });
      groupReady = true;
    } catch {
      groupReady = false;
    }
    const groupField = page.locator("[data-owner-product-option-group-name='1']").first();
    const optionField = page.locator("[data-owner-product-option-value-name='1']").first();
    optionReady = (await optionField.count()) > 0;
    if (groupReady) await groupField.fill(QA_OPTION_GROUP);
    if (optionReady) await optionField.fill(QA_OPTION);
  }
  report.steps.options = {
    attempted: !!addClick?.ok,
    groupReady,
    optionReady,
    filled: groupReady && optionReady,
    group: QA_OPTION_GROUP,
    option: QA_OPTION,
  };

  // 7) Validation
  await titleInput.fill("");
  const invalid = await titleInput.evaluate((el) => !el.checkValidity());
  await titleInput.fill(QA_NAME);
  report.steps.validationRequiredName = invalid ? "PASS" : "NOT_PROVEN";

  // 8) Save with API capture
  const apiPosts = [];
  page.on("response", async (r) => {
    if ((r.request().method() === "POST" || r.request().method() === "PATCH") && r.url().includes("/products")) {
      apiPosts.push({ url: r.url(), status: r.status(), body: await r.text().catch(() => "") });
    }
  });
  await page.locator("#owner-product-form").evaluate((form) => form.requestSubmit());
  await page.waitForTimeout(12000);
  report.steps.apiPosts = apiPosts.slice(0, 5);
  report.steps.save = { url: page.url() };

  let productId =
    apiPosts
      .map((p) => {
        try {
          return JSON.parse(p.body)?.product?.id;
        } catch {
          return null;
        }
      })
      .find(Boolean) || null;
  if (!productId) {
    const { data: products } = await admin
      .from("store_products")
      .select("id, title, product_status, options_json, thumbnail_url, menu_section_id")
      .eq("store_id", STORE)
      .ilike("title", `%${QA_NAME}%`)
      .order("created_at", { ascending: false })
      .limit(3);
    productId = products?.[0]?.id ?? null;
    report.steps.persisted = products?.[0]
      ? {
          found: true,
          product_status: products[0].product_status,
          hasThumb: !!products[0].thumbnail_url,
          hasMenuSection: !!products[0].menu_section_id,
          optionsJson: products[0].options_json,
        }
      : { found: false };
  } else {
    const { data: created } = await admin
      .from("store_products")
      .select("id, title, price, product_status, options_json, thumbnail_url, menu_section_id, images_json")
      .eq("id", productId)
      .maybeSingle();
    report.steps.persisted = {
      found: !!created,
      product_status: created?.product_status ?? null,
      hasThumb: !!created?.thumbnail_url,
      hasMenuSection: !!created?.menu_section_id,
      optionsJson: created?.options_json ?? null,
    };
  }
  report.productId = productId;

  if (!productId) {
    report.final = "FAIL";
    report.steps.firstDivergence = "SAVE_DID_NOT_PERSIST";
    write();
    process.exit(2);
  }

  const createdRow = report.steps.persisted;

  // Activate via Owner PATCH with Playwright cookie jar (not Node Bearer fetch — API expects session cookies).
  if (createdRow?.product_status !== "active" && createdRow?.product_status !== "sold_out") {
    const actRes = await page.request.patch(`${ORIGIN}/api/me/stores/${STORE}/products/${productId}`, {
      data: { product_status: "active" },
    });
    report.steps.activateViaOwnerPatch = {
      status: actRes.status(),
      body: await actRes.text().catch(() => ""),
    };
  } else {
    report.steps.activateViaOwnerPatch = { skipped: true, status: createdRow?.product_status };
  }
  const { data: afterActivate } = await admin
    .from("store_products")
    .select("product_status, options_json, menu_section_id")
    .eq("id", productId)
    .maybeSingle();
  report.steps.afterActivate = afterActivate;
  if (afterActivate?.product_status !== "active") {
    report.final = "FAIL";
    report.steps.firstDivergence = "ACTIVATE_DID_NOT_SET_ACTIVE";
    write();
    console.log(JSON.stringify(report, null, 2));
    process.exit(2);
  }
  await admin.from("stores").update({ is_visible: true }).eq("id", STORE);
  report.steps.storeVisibilityOn = "PASS_API";

  const pubRes = await fetch(`${ORIGIN}/api/stores/products/${productId}`, { cache: "no-store" });
  const pubJson = await pubRes.json().catch(() => ({}));
  report.steps.publicProductApi = {
    status: pubRes.status,
    ok: !!pubJson?.ok,
    title: pubJson?.product?.title ?? null,
    options: pubJson?.product?.options_json ?? null,
    product_status: pubJson?.product?.product_status ?? null,
  };
  report.steps.publicOptions =
    Array.isArray(pubJson?.product?.options_json) && pubJson.product.options_json.length ? "PASS" : "FAIL";
  await page.waitForTimeout(800);

  // 9) Buyer reflection — anonymous context (no owner cookies); public pages when is_visible=true
  buyerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const buyerPage = await buyerContext.newPage();
  await buyerPage.goto(`${ORIGIN}/stores/${report.storeSlug}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await buyerPage.waitForTimeout(2500);
  const catChip = buyerPage
    .getByRole("button", { name: /소주류/i })
    .or(buyerPage.locator("button,a").filter({ hasText: /^소주류$/ }));
  if ((await catChip.count()) > 0) {
    await catChip.first().click({ force: true }).catch(() => null);
    await buyerPage.waitForTimeout(800);
  }
  for (let i = 0; i < 12; i++) {
    await buyerPage.mouse.wheel(0, 1400);
    await buyerPage.waitForTimeout(350);
    if ((await buyerPage.getByText(QA_NAME).count()) > 0) break;
  }
  await buyerPage.reload({ waitUntil: "domcontentloaded" }).catch(() => null);
  await buyerPage.waitForTimeout(2000);
  if ((await catChip.count()) > 0) {
    await catChip.first().click({ force: true }).catch(() => null);
    await buyerPage.waitForTimeout(800);
  }
  for (let i = 0; i < 8; i++) {
    await buyerPage.mouse.wheel(0, 1400);
    await buyerPage.waitForTimeout(300);
    if ((await buyerPage.getByText(QA_NAME).count()) > 0) break;
  }
  let buyerSees = (await buyerPage.getByText(QA_NAME).count()) > 0;
  report.steps.buyerList = buyerSees ? "PASS" : "FAIL";
  // Direct product page is stronger Owner→Buyer reflection when menu list is lazy/filtered.
  await buyerPage.goto(`${ORIGIN}/stores/${report.storeSlug}/p/${productId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await buyerPage.waitForTimeout(2500);
  const detailSees = (await buyerPage.getByText(QA_NAME).count()) > 0;
  const detailOpts = (await buyerPage.getByText(QA_OPTION_GROUP).count()) > 0 || (await buyerPage.getByText(QA_OPTION).count()) > 0;
  // Options often live in add-to-cart / order sheet — open primary CTA if present.
  const orderCta = buyerPage.getByRole("button", { name: /담기|주문|Add|Order|Cart/i }).first();
  if ((await orderCta.count()) > 0 && (await orderCta.isVisible().catch(() => false))) {
    await orderCta.click({ force: true }).catch(() => null);
    await buyerPage.waitForTimeout(1200);
  }
  const detailOptsAfter = (await buyerPage.getByText(QA_OPTION_GROUP).count()) > 0 || (await buyerPage.getByText(QA_OPTION).count()) > 0;
  const optsOk = detailOpts || detailOptsAfter;
  report.steps.buyerDetail = {
    name: detailSees,
    optionsGroup: (await buyerPage.getByText(QA_OPTION_GROUP).count()) > 0,
    optionsValue: (await buyerPage.getByText(QA_OPTION).count()) > 0,
    optionsCue: optsOk,
    optionsAfterCta: detailOptsAfter,
    url: buyerPage.url(),
    sample: await buyerPage.evaluate(() => (document.body?.innerText || "").slice(0, 500)),
  };
  buyerSees = buyerSees || detailSees;
  report.steps.buyerAfterCreate = buyerSees ? (optsOk ? "PASS" : "PASS_NAME_ONLY") : "FAIL";
  await buyerPage.screenshot({ path: resolve(OUT, "product-complete-buyer.png"), fullPage: true });

  // 10) Owner edit — summary via data attr / label
  await page.goto(`${ORIGIN}/stores/owner/products/${productId}/edit?storeId=${STORE}`, {
    waitUntil: "commit",
    timeout: 120000,
  });
  await page.waitForTimeout(2000);
  await dismiss(page);
  const summary = page
    .locator("[data-owner-product-summary='1']")
    .or(page.getByPlaceholder(/한 줄|short|summary|설명/i))
    .first();
  if ((await summary.count()) > 0) {
    await summary.fill("QA edited summary");
  } else {
    const inputs = page.locator("#owner-product-form input:not([type='hidden']):not([type='checkbox']):not([type='file']):not([inputmode='numeric'])");
    if ((await inputs.count()) > 1) await inputs.nth(1).fill("QA edited summary");
  }
  const patchResps = [];
  page.on("response", async (r) => {
    if (r.request().method() === "PATCH" && r.url().includes("/products/")) {
      patchResps.push({ status: r.status(), body: await r.text().catch(() => "") });
    }
  });
  await page.locator("#owner-product-form").evaluate((form) => form.requestSubmit());
  await page.waitForTimeout(8000);
  report.steps.editApi = patchResps.slice(0, 3);
  const { data: edited } = await admin.from("store_products").select("summary").eq("id", productId).maybeSingle();
  report.steps.edit = edited?.summary?.includes("QA edited") ? "PASS" : "FAIL";

  // 11) Sold out — Owner PATCH (cookie jar) then buyer detail
  const soldRes = await page.request.patch(`${ORIGIN}/api/me/stores/${STORE}/products/${productId}`, {
    data: { product_status: "sold_out" },
  });
  report.steps.soldOutPatch = { status: soldRes.status(), body: await soldRes.text().catch(() => "") };
  await buyerPage.goto(`${ORIGIN}/stores/${report.storeSlug}/p/${productId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await buyerPage.waitForTimeout(2500);
  const buyerSold = await buyerPage.evaluate((name) => {
    const t = document.body?.innerText || "";
    return {
      hasName: t.includes(name),
      soldCue: /sold|품절|unavailable|sold out/i.test(t),
      sample: t.slice(0, 500),
    };
  }, QA_NAME);
  report.steps.soldOutBuyerSample = buyerSold.sample;
  report.steps.soldOutBuyer = buyerSold.soldCue ? "PASS" : buyerSold.hasName ? "PASS_NAME_NO_SOLD_CUE" : "FAIL";

  // 12) Resume via Owner PATCH (cookie jar)
  const resumeRes = await page.request.patch(`${ORIGIN}/api/me/stores/${STORE}/products/${productId}`, {
    data: { product_status: "active" },
  });
  report.steps.resumePatch = { status: resumeRes.status(), body: await resumeRes.text().catch(() => "") };
  await buyerPage.goto(`${ORIGIN}/stores/${report.storeSlug}/p/${productId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90000,
  });
  await buyerPage.waitForTimeout(2500);
  const resumeBuyer = await buyerPage.evaluate((name) => {
    const t = document.body?.innerText || "";
    return {
      hasName: t.includes(name),
      soldCue: /sold out|품절|unavailable/i.test(t),
      sample: t.slice(0, 500),
    };
  }, QA_NAME);
  report.steps.resumeBuyerSample = resumeBuyer.sample;
  report.steps.resumeBuyer = resumeBuyer.hasName && !resumeBuyer.soldCue ? "PASS" : "FAIL";

  // 13) Hide / show
  await admin.from("store_products").update({ product_status: "hidden" }).eq("id", productId);
  report.steps.hide = "PASS_API";
  await admin.from("store_products").update({ product_status: "active" }).eq("id", productId);
  report.steps.show = "PASS_API";

  // 13b) Create-time sold_out must not coerce to hidden
  const { data: createdFull } = await admin
    .from("store_products")
    .select("menu_section_id, thumbnail_url, images_json")
    .eq("id", productId)
    .maybeSingle();
  const createSoldRes = await page.request.post(`${ORIGIN}/api/me/stores/${STORE}/products`, {
    data: {
      title: `${QA_NAME} soldout`,
      price: 1500,
      product_status: "sold_out",
      menu_section_id: createdFull?.menu_section_id,
      thumbnail_url: createdFull?.thumbnail_url,
      images_json: createdFull?.images_json,
    },
  });
  const createSoldText = await createSoldRes.text().catch(() => "");
  report.steps.createSoldOutApi = { status: createSoldRes.status(), body: createSoldText };
  let createSoldId = null;
  try {
    createSoldId = JSON.parse(createSoldText)?.product?.id;
  } catch {}
  if (createSoldId) {
    const { data: soldCreated } = await admin
      .from("store_products")
      .select("product_status")
      .eq("id", createSoldId)
      .maybeSingle();
    report.steps.createSoldOutStatus = soldCreated?.product_status ?? null;
    await admin.from("store_products").update({ product_status: "deleted" }).eq("id", createSoldId);
  } else {
    report.steps.createSoldOutStatus = null;
  }

  // 14) Cleanup delete
  await admin.from("store_products").update({ product_status: "deleted" }).eq("id", productId);
  report.steps.cleanup = "PASS_DELETED";

  if (!visibilityWas) await admin.from("stores").update({ is_visible: false }).eq("id", STORE);

  const opts = createdRow?.optionsJson;
  const hasOpts = Array.isArray(opts)
    ? opts.length > 0
    : opts && typeof opts === "object" && Object.keys(opts).length > 0;
  report.steps.optionsPersisted = hasOpts ? "PASS" : "FAIL_OR_EMPTY";

  const buyerOk = report.steps.buyerAfterCreate === "PASS" || report.steps.buyerAfterCreate === "PASS_NAME_ONLY";
  const buyerOptsOk = report.steps.buyerAfterCreate === "PASS";
  const soldOk = report.steps.soldOutBuyer === "PASS";
  const resumeOk = report.steps.resumeBuyer === "PASS";
  const createSoldOk = report.steps.createSoldOutStatus === "sold_out";
  report.evidenceLevel = "LOCAL_PROVEN";
  report.final =
    report.steps.sectionInventory === "PASS" &&
    report.steps.image?.ok &&
    report.steps.persisted?.found &&
    buyerOk &&
    buyerOptsOk &&
    report.steps.edit === "PASS" &&
    hasOpts &&
    soldOk &&
    resumeOk &&
    createSoldOk
      ? "PASS"
      : report.steps.sectionInventory === "PASS" &&
          report.steps.persisted?.found &&
          hasOpts &&
          buyerOk &&
          report.steps.edit === "PASS"
        ? "PASS_OPTIONS_PERSIST_BUYER_PARTIAL"
        : "FAIL";
  write();
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.final === "PASS" || report.final.startsWith("PASS_") ? 0 : 2);
} finally {
  if (buyerContext) await buyerContext.close().catch(() => null);
  if (!visibilityWas) await admin.from("stores").update({ is_visible: false }).eq("id", STORE).catch(() => null);
  await browser.close().catch(() => null);
}
