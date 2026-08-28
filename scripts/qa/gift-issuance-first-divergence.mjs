/**
 * Issuance first-divergence diagnostic — Production only.
 * Same Admin auth harness as admin-gift-ops-center-e2e.mjs.
 *
 * PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local scripts/qa/gift-issuance-first-divergence.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-issuance-first-divergence.json");

const report = {
  cut: "ISSUANCE_FIRST_DIVERGENCE",
  deployed: "4543192b5",
  origin: ORIGIN,
  auth: null,
  finalUrlDeepLink: null,
  opsShell: null,
  productTab: null,
  createQueryPreserved: null,
  choiceRenderCondition: "productsSubtab==='products' && create && !directScope (createType not STORE|PLATFORM)",
  choiceDomDeepLink: null,
  createCta: null,
  createCtaFinalUrl: null,
  choiceDomAfterCta: null,
  storeChoiceVisible: null,
  dibayChoiceVisible: null,
  canonicalAdminStoreCount: null,
  issuanceStoreCount: null,
  giftSettlementStoreCount: null,
  issuanceApiPurpose: null,
  issuanceApiOk: null,
  issuanceApiError: null,
  approvalStatusHistogram: null,
  storePicker: null,
  dibayNoStorePicker: null,
  storeCreateEntry: null,
  dibayCreateEntry: null,
  zeroGiftEligibleStore: null,
  choiceRootCause: null,
  storePickerRootCause: null,
  final: "BLOCKED",
  scenarioS: "NOT_RUN",
  scenarioP: "NOT_RUN",
  financialAuthority: "PRESERVED",
  cut1: "PRESERVED",
  cut2: "PRESERVED",
  verdict: "BLOCKED",
  error: null,
  evidence: {},
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

async function loginSession() {
  const email = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
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
  if (linkErr || !tokenHash) throw new Error(`login_failed:${linkErr?.message || "no_token"}`);
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified.session) throw new Error(`otp_failed:${otpErr?.message}`);
  return verified.session;
}

async function main() {
  loadEnv();
  if (!ORIGIN) {
    report.error = "PLAYWRIGHT_BASE_URL required";
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const session = await loginSession();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const originUrl = new URL(ORIGIN);
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
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
      domain: originUrl.hostname,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: originUrl.protocol === "https:",
      sameSite: "Lax",
    },
  ]);
  const page = await context.newPage();

  // Warm auth + shell like A8 before deep-link diagnosis
  await page.goto(`${ORIGIN}/admin/gift-certificates?tab=summary`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForTimeout(2500);
  const shellWarm = await page.locator('[data-admin-gift-ops-center="1"]').count();
  report.evidence.shellWarm = shellWarm;

  const deepLink =
    `${ORIGIN}/admin/gift-certificates?tab=products&products=products&create=1`;
  const resp = await page.goto(deepLink, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(
    () =>
      document.querySelector('[data-admin-gift-ops-center="1"]') ||
      document.querySelector('form[action*="login"]') ||
      document.body?.innerText?.includes("Loading gift operations"),
    { timeout: 45000 }
  ).catch(() => null);
  await page.waitForTimeout(3500);

  const finalUrl = page.url();
  report.finalUrlDeepLink = finalUrl;
  report.evidence.deepLinkStatus = resp?.status() ?? null;
  report.evidence.title = await page.title();

  const onLogin = finalUrl.includes("/login");
  const shell = await page.locator('[data-admin-gift-ops-center="1"]').count();
  const adminMarker =
    (await page.locator('[data-admin="1"], [data-admin-layout="1"], nav[aria-label*="Admin"]').count()) > 0;
  const productsTabActive = await page.locator('[data-admin-gift-ops-tab="products"][data-active="1"]').count();
  const sp = new URL(finalUrl).searchParams;
  report.createQueryPreserved = sp.get("create") === "1" ? "YES" : "NO";
  report.evidence.searchParams = Object.fromEntries(sp.entries());

  const sessionProven = !onLogin && (shellWarm > 0 || shell > 0 || adminMarker);
  report.auth = sessionProven ? "PASS" : "FAIL";
  report.opsShell = shell > 0 ? "PASS" : "FAIL";
  report.productTab = productsTabActive > 0 ? "PASS" : "FAIL";
  report.evidence.bodySnippet = (await page.locator("body").innerText().catch(() => "")).slice(0, 800);

  if (report.auth !== "PASS") {
    report.choiceRootCause = onLogin ? "unauthenticated_redirect_login" : "ops_shell_missing_no_session";
    report.error = report.choiceRootCause;
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    await browser.close();
    process.exit(1);
  }

  if (report.opsShell !== "PASS") {
    report.error = "ops_shell_missing_on_deep_link";
    // Continue — session proven; may still diagnose API + CTA from summary route
  }

  const choiceDeep = await page.locator('[data-admin-gift-create-choice="1"]').count();
  const issuancePanel = await page.locator('[data-admin-gift-issuance-panel="1"]').count();
  const productCreate = await page.locator('[data-admin-gift-product-create="1"]').count();
  report.choiceDomDeepLink = choiceDeep > 0 ? "PASS" : "FAIL";
  report.evidence.deepLinkDom = { choiceDeep, issuancePanel, productCreate };

  if (choiceDeep === 0) {
    if (sp.get("products") !== "products") {
      report.choiceRootCause = "A_query_products_subtab_lost_or_wrong";
    } else if (sp.get("create") !== "1") {
      report.choiceRootCause = "A_query_create_lost";
    } else if (sp.get("type")) {
      report.choiceRootCause = "D_type_query_set_skips_choice";
    } else if (issuancePanel > 0) {
      report.choiceRootCause = "F_chooseType_false_panel_list_instead";
    } else if (productCreate > 0) {
      report.choiceRootCause = "F_direct_create_without_choice";
    } else {
      report.choiceRootCause = "F_choice_ui_not_rendered";
    }
  }

  // API via browser credentials (same session as UI)
  const api = await page.evaluate(async () => {
    async function get(path) {
      const res = await fetch(path, { credentials: "include", cache: "no-store" });
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text.slice(0, 200) };
      }
      return { status: res.status, json };
    }
    const [adminStores, iss, settle, products] = await Promise.all([
      get("/api/admin/stores?status=approved"),
      get("/api/admin/gift-certificates/stores?purpose=issuance"),
      get("/api/admin/gift-certificates/stores"),
      get("/api/admin/gift-certificates/products?scope=STORE"),
    ]);
    return { adminStores, iss, settle, products };
  });

  const adminList = Array.isArray(api.adminStores.json?.stores)
    ? api.adminStores.json.stores
    : Array.isArray(api.adminStores.json?.data)
      ? api.adminStores.json.data
      : [];
  const adminCount = adminList.length;
  const issJson = api.iss.json ?? {};
  const issStores = Array.isArray(issJson.stores) ? issJson.stores : [];
  const settleStores = Array.isArray(api.settle.json?.stores) ? api.settle.json.stores : [];
  const giftProducts = Array.isArray(api.products.json?.products) ? api.products.json.products : [];

  report.canonicalAdminStoreCount = adminCount;
  report.issuanceStoreCount = issStores.length;
  report.giftSettlementStoreCount = settleStores.length;
  report.issuanceApiPurpose = issJson.purpose ?? null;
  report.issuanceApiOk = issJson.ok === true;
  report.issuanceApiError = issJson.error ?? null;
  report.evidence.apiStatus = {
    admin: api.adminStores.status,
    iss: api.iss.status,
    settle: api.settle.status,
  };

  // Histogram from issuance raw if we can get approval statuses
  const hist = {};
  for (const st of issStores) {
    const k = st.approvalStatus || "unknown";
    hist[k] = (hist[k] || 0) + 1;
  }
  report.approvalStatusHistogram = hist;

  if (adminCount > 0 && issStores.length === 0) {
    report.storePickerRootCause = issJson.ok === false
      ? `api_error:${issJson.error}`
      : "PRODUCT_BUG_issuance_filter_or_branch_empty_after_approved_stores_exist";
  } else if (issStores.length === 0 && adminCount === 0) {
    report.storePickerRootCause = "DATA_OR_ADMIN_STORES_API_EMPTY";
  } else if (issStores.length > 0) {
    report.storePickerRootCause = "NONE_ISSUANCE_RETURNS_STORES";
  }

  const giftStoreIds = new Set(
    giftProducts.map((p) => p.store_id).filter(Boolean)
  );
  const zeroGift = issStores.find((s) => s.storeId && !giftStoreIds.has(s.storeId));
  report.zeroGiftEligibleStore = zeroGift
    ? { status: "PASS", storeId: zeroGift.storeId, storeName: zeroGift.storeName }
    : issStores.length > 0
      ? { status: "DATA_LIMITED", note: "issuance stores exist but all have gift products or no zero-gift match in sample" }
      : { status: "FAIL", note: "no issuance stores to test" };

  // CTA flow from canonical products list
  await page.goto(`${ORIGIN}/admin/gift-certificates?tab=products&products=products`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector('[data-admin-gift-issuance-panel="1"]', { timeout: 45000 }).catch(() => null);
  await page.waitForTimeout(2000);
  const cta = page.locator('[data-admin-gift-issuance-panel="1"] button').filter({ hasText: /새 상품권|Create gift product/i });
  const ctaCount = await cta.count();
  report.createCta = ctaCount > 0 ? "PASS" : "FAIL";

  if (ctaCount > 0) {
    await cta.first().click();
    await page.waitForTimeout(2500);
    report.createCtaFinalUrl = page.url();
    const choiceAfter = await page.locator('[data-admin-gift-create-choice="1"]').count();
    report.choiceDomAfterCta = choiceAfter > 0 ? "PASS" : "FAIL";
    report.storeChoiceVisible = (await page.getByRole("button", { name: /매장 상품권 만들기|Create Store Gift/i }).count()) > 0 ? "PASS" : "FAIL";
    report.dibayChoiceVisible = (await page.getByRole("button", { name: /DIBAY 상품권 만들기|Create DIBAY Gift/i }).count()) > 0 ? "PASS" : "FAIL";

    if (choiceDeep === 0 && choiceAfter > 0) {
      report.choiceRootCause = "routing_state_cta_works_deep_link_fails_or_hydration_timing";
    }
    if (choiceDeep === 0 && choiceAfter === 0) {
      report.choiceRootCause = report.choiceRootCause || "F_choice_never_renders";
    }
  }

  // Section 9 — STORE picker + type switch + DIBAY no picker
  const zeroName = report.zeroGiftEligibleStore?.storeName || "CCM";
  if (report.choiceDomAfterCta === "PASS" || report.choiceDomDeepLink === "PASS") {
    const storeBtn = page.getByRole("button", { name: /매장 상품권 만들기|Create Store Gift/i });
    if ((await storeBtn.count()) > 0) {
      await storeBtn.first().click();
      await page.waitForTimeout(2000);
      report.storeCreateEntry =
        (await page.locator('[data-admin-gift-product-create="1"]').count()) > 0 ? "PASS" : "FAIL";
      report.evidence.storeCreateUrl = page.url();

      const search = page.getByPlaceholder(/매장명|Store name/i);
      if ((await search.count()) > 0) {
        await search.first().fill(zeroName.slice(0, 6));
        await page.waitForTimeout(800);
        const hit = page.locator("ul li button").filter({ hasText: new RegExp(zeroName.slice(0, 4), "i") });
        report.storePicker =
          (await hit.count()) > 0 ? "PASS" : "FAIL";
        if ((await hit.count()) > 0) await hit.first().click();
        await page.waitForTimeout(500);
      } else {
        report.storePicker = "FAIL";
        report.storePickerRootCause = report.storePickerRootCause || "store_search_input_missing";
      }

      const changeType = page
        .locator('[data-admin-gift-product-create="1"] button')
        .filter({ hasText: /종류 다시 선택|Change type|돌아가기|^Back$/i });
      await changeType.first().waitFor({ state: "visible", timeout: 10000 }).catch(() => null);
      if ((await changeType.count()) > 0) {
        await changeType.first().click();
        await page.waitForTimeout(2000);
        report.evidence.afterChangeTypeUrl = page.url();
        const dibayBtn = page.getByRole("button", { name: /DIBAY 상품권 만들기|Create DIBAY Gift/i });
        await dibayBtn.first().waitFor({ state: "visible", timeout: 10000 }).catch(() => null);
        if ((await dibayBtn.count()) > 0) {
          await dibayBtn.first().click();
          await page.waitForTimeout(2500);
          report.dibayCreateEntry =
            (await page.locator('[data-admin-gift-product-create="1"]').count()) > 0 ? "PASS" : "FAIL";
          report.evidence.dibayCreateUrl = page.url();
          const storeSearchAfter = await page.getByPlaceholder(/매장명|Store name/i).count();
          const redeemStoreSection = await page.locator("h3").filter({ hasText: /사용 매장|Redeem store/i }).count();
          report.dibayNoStorePicker =
            storeSearchAfter === 0 && redeemStoreSection === 0 ? "PASS" : "FAIL";
          if (report.dibayNoStorePicker === "FAIL") {
            report.storePickerRootCause =
              report.storePickerRootCause || "dibay_form_still_shows_store_picker";
          }
        } else {
          report.dibayCreateEntry = "FAIL";
          report.choiceRootCause = report.choiceRootCause || "type_switch_did_not_return_to_choice";
        }
      } else {
        report.dibayCreateEntry = "FAIL";
        report.storePickerRootCause = report.storePickerRootCause || "change_type_button_missing";
      }
    }
  }

  report.final =
    report.auth === "PASS" &&
    report.opsShell === "PASS" &&
    (report.choiceDomDeepLink === "PASS" || report.choiceDomAfterCta === "PASS") &&
    report.issuanceStoreCount > 0 &&
    report.storeCreateEntry === "PASS" &&
    report.dibayCreateEntry === "PASS" &&
    report.storePicker === "PASS" &&
    report.dibayNoStorePicker === "PASS" &&
    report.zeroGiftEligibleStore?.status === "PASS"
      ? "ISSUANCE_ENTRY_CLOSED"
      : "BLOCKED";

  await browser.close();

  report.verdict =
    report.final === "ISSUANCE_ENTRY_CLOSED"
      ? "ISSUANCE_ENTRY_CLOSED"
      : report.auth === "PASS" &&
          (report.choiceDomDeepLink === "PASS" || report.choiceDomAfterCta === "PASS") &&
          report.issuanceStoreCount > 0 &&
          report.storeChoiceVisible === "PASS" &&
          report.dibayChoiceVisible === "PASS"
        ? "ISSUANCE_ENTRY_DIAGNOSTIC_PASS"
        : "BLOCKED";

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.final === "ISSUANCE_ENTRY_CLOSED" ? 0 : 1);
}

main().catch((e) => {
  report.error = String(e?.message || e);
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.error(e);
  process.exit(1);
});
