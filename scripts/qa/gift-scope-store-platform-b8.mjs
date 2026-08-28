/**
 * B8 — STORE + PLATFORM Gift production scenarios S/P.
 * Requires: migration 20261128180000 applied, code deployed on PLAYWRIGHT_BASE_URL,
 * Admin auth env.
 *
 * Static gate: ADMIN_GIFT_SCOPE_B8_STATIC_ONLY=1
 * Live: PLAYWRIGHT_BASE_URL=https://samarket.vercel.app node --env-file=.env.local scripts/qa/gift-scope-store-platform-b8.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "").replace(/\/$/, "");
const OUT = resolve(process.cwd(), ".tmp-gift-scope-b8.json");
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const STORE_ID = process.env.GIFT_QA_STORE_ID || "19085860-52d2-4183-b033-e71fcb58bcec";
const OTHER_STORE_ID =
  process.env.GIFT_QA_OTHER_STORE_ID || "00000000-0000-4000-8000-000000000099";

const report = {
  cut: "B8",
  origin: ORIGIN || null,
  a8AuthCookieFix: "CODE_FIXED",
  productionDeploy: null,
  scenarioS: null,
  scenarioP: null,
  crud: null,
  checkoutAuthorityRpc: null,
  migrationPresent: null,
  domainContract: null,
  checkoutAuthority: null,
  adminCrud: null,
  verdict: "FAIL",
  error: null,
  note: null,
  artifacts: {},
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

function staticChecks() {
  const mig = readFileSync(
    resolve("supabase/migrations/20261128180000_gift_certificate_scope_platform.sql"),
    "utf8"
  );
  report.migrationPresent =
    mig.includes("gift_scope") &&
    mig.includes("ADMIN_DIRECT_PLATFORM") &&
    mig.includes("gift_certificate_instance_allows_checkout_store")
      ? "PASS"
      : "FAIL";

  const contract = readFileSync(
    resolve("lib/gift-certificate/gift-certificate-domain-contract.ts"),
    "utf8"
  );
  report.domainContract =
    contract.includes('GIFT_SCOPES = ["STORE", "PLATFORM"]') &&
    contract.includes("giftInstanceAllowsCheckoutStore")
      ? "PASS"
      : "FAIL";

  const eligible = readFileSync(
    resolve("lib/gift-certificate/checkout-eligible-gifts.ts"),
    "utf8"
  );
  report.checkoutAuthority = eligible.includes("giftInstanceAllowsCheckoutStore")
    ? "PASS"
    : "FAIL";

  const e2e = readFileSync(resolve("scripts/qa/admin-gift-ops-center-e2e.mjs"), "utf8");
  report.a8AuthCookieFix = e2e.includes("sb-${ref}-auth-token")
    ? "CODE_FIXED"
    : "MISSING";

  const products = readFileSync(
    resolve("app/api/admin/gift-certificates/products/route.ts"),
    "utf8"
  );
  const patch = readFileSync(
    resolve("app/api/admin/gift-certificates/products/[id]/route.ts"),
    "utf8"
  );
  report.adminCrud =
    products.includes("resolveGiftCreationSource") &&
    products.includes("gift_scope") &&
    products.includes("PLATFORM") &&
    patch.includes("delete_forbidden_has_instances")
      ? "PASS"
      : "FAIL";
}

async function loginSession() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password });
    if (!error && data.session) return data.session;
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: ADMIN_EMAIL,
  });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) throw new Error(`login_failed:${ADMIN_EMAIL}:${linkErr?.message || "no_token"}`);
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified.session) throw new Error(`otp_failed:${ADMIN_EMAIL}:${otpErr?.message}`);
  return verified.session;
}

function cookieHeader(session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const value = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  );
  return `sb-${ref}-auth-token=${value}`;
}

async function api(session, path, init = {}) {
  const res = await fetch(`${ORIGIN}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie: cookieHeader(session),
      authorization: `Bearer ${session.access_token}`,
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json };
}

async function runLive() {
  const session = await loginSession();
  const stamp = Date.now();

  // Scenario S — Admin direct STORE product
  const storeCreate = await api(session, "/api/admin/gift-certificates/products", {
    method: "POST",
    body: JSON.stringify({
      giftScope: "STORE",
      storeId: STORE_ID,
      title: `B8 STORE QA ${stamp}`,
      faceValue: 1000,
      purchasePrice: 1000,
      platformFeeRate: 0,
      active: true,
      maxIssuance: 1,
    }),
  });
  const storeProduct = storeCreate.json?.product;
  const sOk =
    storeCreate.status === 201 &&
    storeProduct?.gift_scope === "STORE" &&
    storeProduct?.store_id === STORE_ID &&
    String(storeProduct?.creation_source || "").includes("ADMIN_DIRECT");
  report.scenarioS = sOk
    ? {
        status: "PASS",
        productId: storeProduct.id,
        gift_scope: storeProduct.gift_scope,
        store_id: storeProduct.store_id,
        creation_source: storeProduct.creation_source,
      }
    : {
        status: "FAIL",
        http: storeCreate.status,
        error: storeCreate.json?.error || storeCreate.json,
      };
  report.artifacts.storeProductId = storeProduct?.id || null;

  // Scenario P — Admin direct PLATFORM product (no store_id)
  const platformCreate = await api(session, "/api/admin/gift-certificates/products", {
    method: "POST",
    body: JSON.stringify({
      giftScope: "PLATFORM",
      title: `B8 PLATFORM QA ${stamp}`,
      faceValue: 1000,
      purchasePrice: 1000,
      platformFeeRate: 10,
      active: true,
      maxIssuance: 1,
    }),
  });
  const platformProduct = platformCreate.json?.product;
  const pOk =
    platformCreate.status === 201 &&
    platformProduct?.gift_scope === "PLATFORM" &&
    (platformProduct?.store_id == null || platformProduct?.store_id === "") &&
    String(platformProduct?.creation_source || "").includes("ADMIN_DIRECT_PLATFORM");
  report.scenarioP = pOk
    ? {
        status: "PASS",
        productId: platformProduct.id,
        gift_scope: platformProduct.gift_scope,
        store_id: platformProduct.store_id,
        creation_source: platformProduct.creation_source,
        platform_fee_rate: platformProduct.platform_fee_rate,
      }
    : {
        status: "FAIL",
        http: platformCreate.status,
        error: platformCreate.json?.error || platformCreate.json,
      };
  report.artifacts.platformProductId = platformProduct?.id || null;

  // Filters + pause (CRUD lifecycle without hard delete)
  const listStore = await api(session, "/api/admin/gift-certificates/products?scope=STORE");
  const listPlatform = await api(session, "/api/admin/gift-certificates/products?scope=PLATFORM");
  const storeListed =
    Array.isArray(listStore.json?.products) &&
    listStore.json.products.some((p) => p.id === storeProduct?.id && p.gift_scope === "STORE");
  const platformListed =
    Array.isArray(listPlatform.json?.products) &&
    listPlatform.json.products.some((p) => p.id === platformProduct?.id && p.gift_scope === "PLATFORM");

  let pauseOk = false;
  let archiveOk = false;
  if (storeProduct?.id) {
    const pause = await api(session, `/api/admin/gift-certificates/products/${storeProduct.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    pauseOk = pause.status === 200 && pause.json?.product?.active === false;
  }
  if (platformProduct?.id) {
    const archive = await api(session, `/api/admin/gift-certificates/products/${platformProduct.id}`, {
      method: "PATCH",
      body: JSON.stringify({ archive: true, active: false }),
    });
    archiveOk =
      archive.status === 200 &&
      (archive.json?.product?.archived_at != null || archive.json?.ok === true);
  }

  report.crud = {
    status: storeListed && platformListed && pauseOk && archiveOk ? "PASS" : "FAIL",
    storeListed,
    platformListed,
    pauseOk,
    archiveOk,
  };

  // Checkout authority RPC: STORE only matching store; PLATFORM allows eligible store id
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data: allowSame, error: e1 } = await sb.rpc("gift_certificate_instance_allows_checkout_store", {
    p_gift_scope: "STORE",
    p_instance_store_id: STORE_ID,
    p_checkout_store_id: STORE_ID,
  });
  const { data: denyOther, error: e2 } = await sb.rpc("gift_certificate_instance_allows_checkout_store", {
    p_gift_scope: "STORE",
    p_instance_store_id: STORE_ID,
    p_checkout_store_id: OTHER_STORE_ID,
  });
  const { data: allowPlatform, error: e3 } = await sb.rpc(
    "gift_certificate_instance_allows_checkout_store",
    {
      p_gift_scope: "PLATFORM",
      p_instance_store_id: null,
      p_checkout_store_id: STORE_ID,
    }
  );
  const rpcOk =
    !e1 &&
    !e2 &&
    !e3 &&
    allowSame === true &&
    denyOther === false &&
    allowPlatform === true;
  report.checkoutAuthorityRpc = rpcOk
    ? {
        status: "PASS",
        storeSameStore: allowSame,
        storeOtherStore: denyOther,
        platformEligibleStore: allowPlatform,
      }
    : {
        status: "FAIL",
        errors: [e1?.message, e2?.message, e3?.message].filter(Boolean),
        allowSame,
        denyOther,
        allowPlatform,
      };

  report.productionDeploy = {
    origin: ORIGIN,
    note: "alias samarket.vercel.app Ready after push 2ff17265d; commit SHA confirm via Vercel dashboard if needed",
  };

  const allPass =
    report.scenarioS?.status === "PASS" &&
    report.scenarioP?.status === "PASS" &&
    report.crud?.status === "PASS" &&
    report.checkoutAuthorityRpc?.status === "PASS";
  report.verdict = allPass ? "B8_PRODUCTION_RUNTIME_PASS" : "FAIL";
  report.note = allPass
    ? "Issuance authority + filter/CRUD + checkout RPC proven on Production. Full buyer purchase→redeem money path not re-run in this harness."
    : "One or more Production scenario checks failed.";
}

async function main() {
  loadEnv();
  staticChecks();

  if (process.env.ADMIN_GIFT_SCOPE_B8_STATIC_ONLY === "1" || !ORIGIN) {
    const ok =
      report.migrationPresent === "PASS" &&
      report.domainContract === "PASS" &&
      report.checkoutAuthority === "PASS" &&
      report.adminCrud === "PASS" &&
      report.a8AuthCookieFix === "CODE_FIXED";
    report.verdict = ok ? "B8_STATIC_PASS_AWAITING_PRODUCTION_DEPLOY" : "FAIL";
    report.note =
      "Scenario S/P Production runtime requires git push + migration apply + READY commit. Not claimed PRODUCTION_PROVEN without live evidence.";
    report.scenarioS = "NOT_RUN";
    report.scenarioP = "NOT_RUN";
    writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(ok ? 0 : 1);
  }

  try {
    await runLive();
  } catch (e) {
    report.error = String(e?.message || e);
    report.verdict = "FAIL";
  }
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.verdict === "B8_PRODUCTION_RUNTIME_PASS" ? 0 : 1);
}

main();
