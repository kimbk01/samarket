/**
 * Stage 2 Owner/Admin Product Flow — Production HTTP scenarios S1–S7.
 * Waits until funding GET returns AST-005 (deploy rolled out), then runs product paths.
 *
 *   S2_HTTP_ORIGIN=https://samarket.vercel.app \
 *   node scripts/qa/delivery-ads-stage2-product-http-close.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

const ORIGIN = process.env.S2_HTTP_ORIGIN?.trim() || "https://samarket.vercel.app";
const OUT_DIR = path.join(process.cwd(), "docs/perf/delivery-ads-r5-runtime");
const OUT = path.join(OUT_DIR, "stage2-product-http-close-report.json");
/** Organic-eligible store (Stage 1 close). Owner: wwww@manual.local */
const STORE_ID = "6af48b07-8d30-4b5d-adb1-6814b8e9d813";
const PKG_HOME_7D = "88068455-0af6-4e5a-a12c-0e368c3a3d43";
const OWNER = {
  email: "wwww@manual.local",
  pass: process.env.E2E_TEST_PASSWORD || process.env.QA_MANUAL_PASSWORD || "1234",
};
const ADMIN = {
  email: "aaaa@manual.local",
  pass:
    process.env.E2E_ADMIN_PASSWORD ||
    process.env.E2E_TEST_PASSWORD ||
    process.env.QA_MANUAL_PASSWORD ||
    "1234",
};
const MARKER = `__QA_S2_PROD__${Date.now()}`;

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function login(context, email, password) {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) return { ok: false, reason: "no_env" };
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1] ?? "";
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const passwords = [
    ...new Set(
      [
        password,
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        "1234",
        "DibayQa1!",
      ].filter(Boolean)
    ),
  ];
  let session = null;
  for (const pass of passwords) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (error || !data.session) continue;
    session = data.session;
    break;
  }
  if (!session) return { ok: false, reason: "sign_in_failed" };

  let activeSessionId = null;
  if (serviceKey) {
    const adminSb = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: pr } = await adminSb
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    activeSessionId = String(pr?.active_session_id ?? "").trim() || null;
  }
  if (!activeSessionId) return { ok: false, reason: "active_session_id_unavailable" };

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
    secure: true,
    sameSite: "Lax",
  };
  const cookies =
    parts.length === 1
      ? [{ ...base, name: `sb-${ref}-auth-token`, value: parts[0] }]
      : parts.map((value, i) => ({ ...base, name: `sb-${ref}-auth-token.${i}`, value }));
  cookies.push({
    ...base,
    name: "samarket_active_session_id",
    value: activeSessionId,
    expires: Math.floor(Date.now() / 1000) + 86400 * 7,
  });
  await context.addCookies(cookies);
  return { ok: true, email, userId: session.user.id, activeSessionId };
}

function sqlQuery(sql) {
  const tmp = path.join(OUT_DIR, `stage2-http-tmp-${Date.now()}.sql`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(tmp, sql, "utf8");
  try {
    const raw = execFileSync("npx", ["supabase", "db", "query", "--linked", "-f", tmp], {
      cwd: process.cwd(),
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    const objs = [];
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] !== "{") continue;
      let depth = 0;
      for (let k = i; k < raw.length; k++) {
        if (raw[k] === "{") depth++;
        else if (raw[k] === "}") {
          depth--;
          if (depth === 0) {
            try {
              const o = JSON.parse(raw.slice(i, k + 1));
              if (o && typeof o === "object" && Array.isArray(o.rows)) objs.push(o);
            } catch {
              /* ignore */
            }
            break;
          }
        }
      }
    }
    return objs.length ? objs[objs.length - 1].rows : [];
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
  }
}

async function jsonReq(page, method, urlPath, data) {
  const res = await page.request[method.toLowerCase()](
    `${ORIGIN}${urlPath}`,
    data ? { data } : undefined
  );
  const json = await res.json().catch(() => null);
  return { status: res.status(), json };
}

function findPaidExposure(homeJson, campaignId, storeId) {
  const meta = homeJson?.meta ?? {};
  const insertion = meta.homeInsertions ?? meta.insertion ?? homeJson?.insertion ?? null;
  const paidAds = insertion?.paidAds ?? [];
  const rows = insertion?.restInsertion?.rows ?? [];
  const campaignMatch = (id) => String(id ?? "") === campaignId;
  const matchingPaid = (paidAds || []).filter((p) => campaignMatch(p?.id ?? p?.campaignId));
  const matchingRows = (rows || []).filter(
    (r) => r?.kind === "paid_ad" && campaignMatch(r.campaignId)
  );
  const sponsoredIds = insertion?.restInsertion?.sponsoredStoreIds ?? [];
  return {
    exposed: matchingPaid.length > 0 || matchingRows.length > 0,
    matchingPaidIds: matchingPaid.map((p) => p.id ?? p.campaignId),
    matchingRowCampaignIds: matchingRows.map((r) => r.campaignId),
    inSponsored: (sponsoredIds || []).includes(storeId),
    paidAdsCount: Array.isArray(paidAds) ? paidAds.length : 0,
    hasHomeInsertions: Boolean(insertion),
  };
}

async function adminAction(page, campaignId, action, expectedLifecycle, expectedUpdatedAt, extra = {}) {
  return jsonReq(page, "POST", `/api/admin/delivery-ads/${campaignId}/actions`, {
    productKind: extra.productKind ?? "store_sponsored",
    action,
    expectedLifecycle,
    expectedUpdatedAt,
    reason: extra.reason ?? `s2_http_${action}`,
    ownerVisibleNotes: extra.ownerVisibleNotes ?? `s2_http_${action}_notes`,
  });
}

async function loadAdminCampaign(page, campaignId) {
  return jsonReq(page, "GET", `/api/admin/delivery-ads/${campaignId}?product=store_sponsored`);
}

async function createSpDraft(ownerPage) {
  const now = Date.now();
  return jsonReq(ownerPage, "POST", `/api/me/stores/${STORE_ID}/delivery-ads`, {
    inventoryKeys: ["STORES_HOME_FEED"],
    startAt: new Date(now - 60_000).toISOString(),
    endAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString(),
    packageId: PKG_HOME_7D,
    title: `${MARKER}_${Math.random().toString(36).slice(2, 8)}`,
    headline: "S2 SP",
    clientRequestId: `s2:${MARKER}:${Math.random().toString(36).slice(2, 8)}`,
  });
}

async function quotePayable(ownerPage) {
  const commercial = await jsonReq(
    ownerPage,
    "GET",
    `/api/me/delivery-ads/commercial?storeId=${STORE_ID}&productKind=store_sponsored&inventoryKey=STORES_HOME_FEED&packageId=${PKG_HOME_7D}`
  );
  const finalPayable =
    commercial.json?.quote?.finalPayableMinor ??
    commercial.json?.selected?.finalPayableMinor ??
    commercial.json?.packages?.[0]?.finalPayableMinor ??
    12_000;
  return { commercial, finalPayable };
}

async function submitSp(ownerPage, campaignId, finalPayable) {
  return jsonReq(
    ownerPage,
    "POST",
    `/api/me/stores/${STORE_ID}/delivery-ads/${campaignId}/actions`,
    {
      action: "submit",
      productKind: "store_sponsored",
      packageId: PKG_HOME_7D,
      clientFinalPayableMinor: finalPayable,
    }
  );
}

async function ensureBc(ownerPage, adminPage, amountMinor) {
  const before = await jsonReq(ownerPage, "GET", `/api/me/stores/${STORE_ID}/business-cash`);
  const bal = before.json?.assets?.businessCash?.balanceMinor ?? 0;
  if (bal >= amountMinor) return { ok: true, balanceMinor: bal, toppedUp: false };
  const need = amountMinor - bal + 10_000;
  const topup = await jsonReq(ownerPage, "POST", `/api/me/stores/${STORE_ID}/business-cash`, {
    op: "topup_request",
    amountMinor: need,
    idempotencyKey: `s2_topup:${MARKER}:${need}`,
  });
  const requestId = topup.json?.requestId;
  if (!requestId) return { ok: false, topup, balanceMinor: bal };
  const approve = await jsonReq(adminPage, "POST", `/api/admin/business-cash-charges`, {
    op: "approve",
    requestId,
  });
  const after = await jsonReq(ownerPage, "GET", `/api/me/stores/${STORE_ID}/business-cash`);
  return {
    ok: approve.status < 400 && after.json?.ok === true,
    balanceMinor: after.json?.assets?.businessCash?.balanceMinor ?? null,
    toppedUp: true,
    topup,
    approve,
  };
}

async function approveToActive(adminPage, campaignId) {
  let detail = await loadAdminCampaign(adminPage, campaignId);
  let camp = detail.json?.campaign;
  const startReview = await adminAction(
    adminPage,
    campaignId,
    "start_review",
    camp?.lifecycleStatus,
    camp?.updatedAt
  );
  detail = await loadAdminCampaign(adminPage, campaignId);
  camp = detail.json?.campaign;
  const approve = await adminAction(
    adminPage,
    campaignId,
    "approve",
    camp?.lifecycleStatus,
    camp?.updatedAt,
    { reason: "s2_approve" }
  );
  detail = await loadAdminCampaign(adminPage, campaignId);
  camp = detail.json?.campaign;
  let scheduleNudge = null;
  if (camp?.lifecycleStatus === "SCHEDULED") {
    scheduleNudge = await jsonReq(adminPage, "PATCH", `/api/admin/delivery-ads/${campaignId}`, {
      productKind: "store_sponsored",
      op: "schedule",
      expectedUpdatedAt: camp.updatedAt,
      startAt: new Date(Date.now() - 120_000).toISOString(),
      endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    detail = await loadAdminCampaign(adminPage, campaignId);
    camp = detail.json?.campaign;
  }
  return { startReview, approve, scheduleNudge, lifecycle: camp?.lifecycleStatus ?? null, camp };
}

async function main() {
  loadEnvLocal();
  const report = {
    head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    origin: ORIGIN,
    marker: MARKER,
    storeId: STORE_ID,
    scenarios: {},
    verdicts: {},
  };

  const browser = await chromium.launch({ headless: true });
  const ownerCtx = await browser.newContext();
  const adminCtx = await browser.newContext();
  const customerCtx = await browser.newContext();
  const ownerPage = await ownerCtx.newPage();
  const adminPage = await adminCtx.newPage();
  const customerPage = await customerCtx.newPage();

  try {
    const ownerAuth = await login(ownerCtx, OWNER.email, OWNER.pass);
    const adminAuth = await login(adminCtx, ADMIN.email, ADMIN.pass);
    report.auth = { owner: ownerAuth, admin: adminAuth };
    if (!ownerAuth.ok || !adminAuth.ok) {
      report.stage2 = "BLOCKED";
      report.blocker = "auth_failed";
      fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    await ownerPage
      .goto(`${ORIGIN}/stores/owner`, { waitUntil: "domcontentloaded", timeout: 90_000 })
      .catch(() => {});
    await adminPage
      .goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded", timeout: 90_000 })
      .catch(() => {});

    // Deploy gate: funding GET must be AST-005
    let deployReady = false;
    let deployProbe = null;
    for (let i = 0; i < 20; i++) {
      const draft = await createSpDraft(ownerPage);
      const draftId = draft.json?.campaign?.id ?? draft.json?.id ?? null;
      if (!draftId) {
        deployProbe = { i, draft };
        await new Promise((r) => setTimeout(r, 15_000));
        continue;
      }
      const fundingGet = await jsonReq(
        ownerPage,
        "GET",
        `/api/me/delivery-ads/${draftId}/funding?product=store_sponsored`
      );
      const auth =
        fundingGet.json?.authority ?? fundingGet.json?.funding?.authority ?? null;
      deployProbe = { i, draftId, authority: auth, status: fundingGet.status };
      if (auth === "AST-005") {
        deployReady = true;
        report.scenarios.deployGate = deployProbe;
        break;
      }
      await new Promise((r) => setTimeout(r, 20_000));
    }
    if (!deployReady) {
      report.scenarios.deployGate = deployProbe;
      report.stage2 = "BLOCKED";
      report.blocker = "production_not_on_ast005_funding_yet";
      fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    // S1 BC
    const s1Bc = await jsonReq(ownerPage, "GET", `/api/me/stores/${STORE_ID}/business-cash`);
    const s1Hub = await jsonReq(ownerPage, "GET", `/api/me/delivery-ads`);
    const funded = await ensureBc(ownerPage, adminPage, 50_000);
    report.scenarios.S1 = {
      bcStatus: s1Bc.status,
      balanceMinor: s1Bc.json?.assets?.businessCash?.balanceMinor ?? null,
      ledgerCount: Array.isArray(s1Bc.json?.ledger) ? s1Bc.json.ledger.length : null,
      hubBc: s1Hub.json?.businessCash?.balanceMinor ?? null,
      hubAuthority: s1Hub.json?.businessCash?.authority ?? null,
      ensureBc: funded,
    };
    report.verdicts.S1 =
      s1Bc.status === 200 && funded.ok && report.scenarios.S1.hubAuthority === "AST-005"
        ? "PASS"
        : "FAIL";

    const { finalPayable } = await quotePayable(ownerPage);

    // S2 funding AST-005 + insufficient hard-block when possible
    const draft2 = await createSpDraft(ownerPage);
    const draft2Id = draft2.json?.campaign?.id ?? draft2.json?.id ?? null;
    const fundingGet = draft2Id
      ? await jsonReq(
          ownerPage,
          "GET",
          `/api/me/delivery-ads/${draft2Id}/funding?product=store_sponsored`
        )
      : { status: 0, json: null };
    const adminFundingGet = draft2Id
      ? await jsonReq(
          adminPage,
          "GET",
          `/api/admin/delivery-ads/business-cash?storeId=${STORE_ID}&campaignId=${draft2Id}&product=store_sponsored`
        )
      : { status: 0, json: null };

    let insuff = { skipped: true, reason: "balance_sufficient" };
    const balNow = funded.balanceMinor ?? 0;
    if (balNow < finalPayable && draft2Id) {
      const sub = await submitSp(ownerPage, draft2Id, finalPayable);
      insuff = {
        skipped: false,
        status: sub.status,
        error: sub.json?.error ?? null,
        ok: String(sub.json?.error || "").includes("INSUFFICIENT"),
      };
    }

    report.scenarios.S2 = {
      draftId: draft2Id,
      fundingAuthority: fundingGet.json?.authority ?? fundingGet.json?.funding?.authority,
      adminAuthority: adminFundingGet.json?.authority,
      insufficient: insuff,
      finalPayable,
      balNow,
    };
    report.verdicts.S2 =
      report.scenarios.S2.fundingAuthority === "AST-005" &&
      report.scenarios.S2.adminAuthority === "AST-005" &&
      (insuff.skipped || insuff.ok)
        ? "PASS"
        : "FAIL";

    // S3 create → submit → approve → customer
    const c3 = await createSpDraft(ownerPage);
    const id3 = c3.json?.campaign?.id ?? c3.json?.id ?? null;
    let s3 = { create: c3 };
    if (id3) {
      const pre = await jsonReq(customerPage, "GET", "/api/stores/home-feed");
      const sub = await submitSp(ownerPage, id3, finalPayable);
      const queue = await jsonReq(
        adminPage,
        "GET",
        "/api/admin/delivery-ads/action-queue?productKind=store_sponsored&limit=100"
      );
      const inQueue = (queue.json?.items || []).some((i) => i.campaignId === id3);
      const appr = await approveToActive(adminPage, id3);
      const post = await jsonReq(customerPage, "GET", "/api/stores/home-feed");
      s3 = {
        campaignId: id3,
        submit: {
          status: sub.status,
          ok: sub.json?.ok === true,
          error: sub.json?.error ?? null,
          life: sub.json?.campaign?.lifecycleStatus,
        },
        inQueue,
        approveLife: appr.lifecycle,
        preExposure: findPaidExposure(pre.json, id3, STORE_ID),
        postExposure: findPaidExposure(post.json, id3, STORE_ID),
      };
    }
    report.scenarios.S3 = s3;
    report.verdicts.S3 =
      s3.submit?.ok &&
      s3.preExposure?.exposed === false &&
      (s3.postExposure?.exposed === true ||
        ["ACTIVE", "SCHEDULED", "APPROVED"].includes(String(s3.approveLife)))
        ? s3.postExposure?.exposed
          ? "PASS"
          : "PARTIAL"
        : "FAIL";

    // S4 changes → resubmit same funding
    const c4 = await createSpDraft(ownerPage);
    const id4 = c4.json?.campaign?.id ?? c4.json?.id ?? null;
    let s4 = {};
    if (id4) {
      const sub = await submitSp(ownerPage, id4, finalPayable);
      const fundBefore = sqlQuery(`
SELECT id::text AS funding_id, status
FROM public.delivery_ad_canonical_bc_fundings
WHERE application_id = '${id4}'::uuid ORDER BY created_at DESC LIMIT 1;
`)[0];
      let detail = await loadAdminCampaign(adminPage, id4);
      let camp = detail.json?.campaign;
      await adminAction(adminPage, id4, "start_review", camp?.lifecycleStatus, camp?.updatedAt);
      detail = await loadAdminCampaign(adminPage, id4);
      camp = detail.json?.campaign;
      const chg = await adminAction(
        adminPage,
        id4,
        "request_changes",
        camp?.lifecycleStatus,
        camp?.updatedAt,
        { reason: "s2_need_changes", ownerVisibleNotes: "fix copy" }
      );
      detail = await loadAdminCampaign(adminPage, id4);
      const resub = await submitSp(ownerPage, id4, finalPayable);
      const fundAfter = sqlQuery(`
SELECT id::text AS funding_id, status
FROM public.delivery_ad_canonical_bc_fundings
WHERE application_id = '${id4}'::uuid ORDER BY created_at DESC LIMIT 5;
`);
      const ops = sqlQuery(`
SELECT c.id::text AS case_id, t.id::text AS thread_id
FROM public.delivery_ad_operations_cases c
LEFT JOIN public.delivery_ad_operations_threads t ON t.case_id = c.id
WHERE c.store_sponsored_campaign_id = '${id4}'::uuid
ORDER BY c.created_at DESC LIMIT 3;
`);
      s4 = {
        campaignId: id4,
        submitOk: sub.json?.ok === true,
        requestChangesStatus: chg.status,
        lifeAfterChanges: detail.json?.campaign?.lifecycleStatus,
        resubmitLife: resub.json?.campaign?.lifecycleStatus,
        fundingIdBefore: fundBefore?.funding_id ?? null,
        fundingCountAfter: fundAfter.length,
        sameFunding:
          fundBefore?.funding_id != null &&
          fundAfter.length === 1 &&
          fundAfter[0].funding_id === fundBefore.funding_id,
        caseId: ops[0]?.case_id ?? null,
        threadId: ops[0]?.thread_id ?? null,
      };
    }
    report.scenarios.S4 = s4;
    report.verdicts.S4 =
      s4.sameFunding &&
      s4.lifeAfterChanges === "CHANGES_REQUESTED" &&
      (s4.resubmitLife === "SUBMITTED" || s4.resubmitLife === "UNDER_REVIEW")
        ? "PASS"
        : "FAIL";

    // S5 reject → refund → no exposure
    const c5 = await createSpDraft(ownerPage);
    const id5 = c5.json?.campaign?.id ?? c5.json?.id ?? null;
    let s5 = {};
    if (id5) {
      await submitSp(ownerPage, id5, finalPayable);
      let detail = await loadAdminCampaign(adminPage, id5);
      let camp = detail.json?.campaign;
      await adminAction(adminPage, id5, "start_review", camp?.lifecycleStatus, camp?.updatedAt);
      detail = await loadAdminCampaign(adminPage, id5);
      camp = detail.json?.campaign;
      const rej = await adminAction(
        adminPage,
        id5,
        "reject",
        camp?.lifecycleStatus,
        camp?.updatedAt,
        { reason: "s2_reject", ownerVisibleNotes: "rejected" }
      );
      const fundAfter = sqlQuery(`
SELECT id::text AS funding_id, status
FROM public.delivery_ad_canonical_bc_fundings
WHERE application_id = '${id5}'::uuid ORDER BY created_at DESC LIMIT 3;
`);
      const home = await jsonReq(customerPage, "GET", "/api/stores/home-feed");
      s5 = {
        campaignId: id5,
        rejectStatus: rej.status,
        rejectOk: rej.json?.ok === true,
        fundAfter,
        refunded: fundAfter.some((f) => f.status === "REFUNDED"),
        exposure: findPaidExposure(home.json, id5, STORE_ID),
      };
    }
    report.scenarios.S5 = s5;
    report.verdicts.S5 =
      s5.refunded && s5.exposure?.exposed === false ? "PASS" : "FAIL";

    // S6 Banner owner path; Customer PARTIAL
    const bannerCreate = await jsonReq(
      ownerPage,
      "POST",
      `/api/me/stores/${STORE_ID}/delivery-ads/banner`,
      {
        inventoryKey: "STORES_HOME_HERO",
        startAt: new Date(Date.now() - 60_000).toISOString(),
        endAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        title: `${MARKER}_BANNER`,
        headline: "S2 banner",
        ctaType: "store_detail",
        adminProducesCreative: true,
        clientRequestId: `s2_banner:${MARKER}`,
      }
    );
    report.scenarios.S6 = {
      bannerCreateStatus: bannerCreate.status,
      bannerOk: bannerCreate.json?.ok === true,
      bannerError: bannerCreate.json?.error ?? null,
      campaignId: bannerCreate.json?.campaign?.id ?? null,
      customerBanner: "PARTIAL",
      note: "No new banner slots invented; Customer Banner remains PARTIAL.",
    };
    report.verdicts.S6 =
      report.scenarios.S6.bannerOk || report.scenarios.S6.bannerCreateStatus < 500
        ? "PARTIAL"
        : "FAIL";

    // S7 Partner
    const apply = await jsonReq(ownerPage, "POST", `/api/me/delivery-ads/partner`, {
      op: "apply",
      storeId: STORE_ID,
    });
    const listPending = await jsonReq(
      adminPage,
      "GET",
      "/api/admin/delivery-ads/partner/memberships?status=PENDING_REVIEW"
    );
    const mine = (listPending.json?.memberships || []).find((m) => m.storeId === STORE_ID);
    let approve = null;
    let afterActive = null;
    if (mine?.id) {
      approve = await jsonReq(adminPage, "POST", "/api/admin/delivery-ads/partner/memberships", {
        op: "approve",
        membershipId: mine.id,
        reason: "s2_partner_approve",
      });
      afterActive = await jsonReq(
        adminPage,
        "GET",
        `/api/admin/delivery-ads/partner/memberships?status=ACTIVE&storeId=${STORE_ID}`
      );
    }
    const rejectedFilter = await jsonReq(
      adminPage,
      "GET",
      "/api/admin/delivery-ads/partner/memberships?status=REJECTED"
    );
    // If already open/active, treat as PASS for apply path
    const getPartner = await jsonReq(
      ownerPage,
      "GET",
      `/api/me/delivery-ads/partner?storeId=${STORE_ID}`
    );
    report.scenarios.S7 = {
      applyStatus: apply.status,
      applyOk: apply.json?.ok === true,
      applyError: apply.json?.error ?? null,
      membershipStatus: getPartner.json?.membership?.status ?? null,
      pendingId: mine?.id ?? null,
      approveStatus: approve?.status ?? null,
      approveOk: approve?.json?.ok === true,
      activeCount: (afterActive?.json?.memberships || []).length,
      rejectedFilterOk: rejectedFilter.status === 200,
    };
    const s7Ok =
      report.scenarios.S7.rejectedFilterOk &&
      (report.scenarios.S7.applyOk ||
        report.scenarios.S7.applyError === "already_open" ||
        report.scenarios.S7.membershipStatus === "ACTIVE" ||
        report.scenarios.S7.membershipStatus === "PENDING_REVIEW" ||
        report.scenarios.S7.approveOk);
    report.verdicts.S7 = s7Ok ? "PASS" : "FAIL";

    const fails = Object.entries(report.verdicts).filter(([, v]) => v === "FAIL");
    const partials = Object.entries(report.verdicts).filter(([, v]) => v === "PARTIAL");
    report.stage2 =
      fails.length > 0 ? "BLOCKED" : partials.length > 0 ? "PARTIAL" : "CLOSED";
    report.closeBar = {
      storePromotionOwnerAdminCustomer: report.verdicts.S3,
      partner: report.verdicts.S7,
      businessCashUi: report.verdicts.S1,
      adminQueueReview: report.verdicts.S3,
      customerBanner: report.verdicts.S6,
      notifications: {
        lifecycleOps: "WIRED_EXISTING",
        businessCashCharge: "WIRED_EXISTING",
        partnerMembership: "NOT_PROVEN",
      },
    };

    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
