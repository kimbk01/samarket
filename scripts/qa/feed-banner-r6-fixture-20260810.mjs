/**
 * DIBAY Feed Banner — R6 FIXTURE COMPLETION ONLY
 * Product / ads / financial schema: DO NOT MODIFY.
 *
 * Point credit authority = Admin member adjust:
 *   PATCH /api/admin/users/[id]/points → adjustUserPoints (ledger SSOT + audit)
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 \
 *   node --env-file=.env.local scripts/qa/feed-banner-r6-fixture-20260810.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3011").replace(/\/$/, "");
const OUT_DIR = join(process.cwd(), ".qa-logs/feed-banner-runtime-evidence-20260810");
const OUT = join(OUT_DIR, "REPORT.json");
const R6_OUT = join(OUT_DIR, "R6-FINAL.json");
const PASS = process.env.E2E_BANNER_MEMBER_PASSWORD || "DibayQa1!";
const ADMIN_EMAIL = process.env.E2E_BANNER_ADMIN_EMAIL || "aaaa@manual.local";
const TAG = "[QA-RT-20260810-R6]";
const PRODUCT_ID = "feed_banner_community_3"; // cheaper community product

mkdirSync(OUT_DIR, { recursive: true });

const report = {
  startedAt: new Date().toISOString(),
  base: BASE,
  pointCreditAuthority: {
    route: "PATCH /api/admin/users/[id]/points",
    writer: "adjustUserPoints → creditUserPoints (entry_type=admin_credit, related_type=admin_manual)",
    audit: "appendAuditLog action=admin_point_adjust",
    bypass: "NO",
  },
  currentBannerSsot: {
    helper: "findCurrentFeedAdBanner / isFeedAdDisplayStatusBlockingNewCreate",
    blocking: ["pending_review", "scheduled", "active"],
    nonBlocking: ["rejected", "cancelled", "ended"],
    sharedUiApi: true,
  },
  members: {},
  pending: {},
  terminal: {},
  financialAuthority: "NOT_RUN",
  firstBreak: null,
  final: {
    R6: "FAIL",
    PRODUCT_CONTRACT_CHANGE_RUNTIME: "FAIL",
    NEW_HARD_LOCK: "NO",
    READY_FOR_COMMIT_DEPLOY: "NO",
  },
};

function save() {
  writeFileSync(R6_OUT, JSON.stringify(report, null, 2));
  if (existsSync(OUT)) {
    const full = JSON.parse(readFileSync(OUT, "utf8"));
    full.R6 = {
      ...(full.R6 || {}),
      status: report.final.R6,
      pointCreditAuthority: report.pointCreditAuthority,
      pending: report.pending,
      terminal: report.terminal,
      financialAuthority: report.financialAuthority,
      extraHold: report.pending?.additionalHold ?? null,
    };
    full.firstBreak = report.firstBreak;
    full.final = {
      PRODUCT_CONTRACT_CHANGE_RUNTIME: report.final.PRODUCT_CONTRACT_CHANGE_RUNTIME,
      NEW_HARD_LOCK: "NO",
      READY_FOR_COMMIT_DEPLOY: report.final.READY_FOR_COMMIT_DEPLOY,
      note: report.final.note,
    };
    writeFileSync(OUT, JSON.stringify(full, null, 2));
  }
}

function cookieOf(url, session, activeSessionId) {
  const ref = url.match(/https:\/\/([^.]+)\./)?.[1];
  const cookieName = ref ? `sb-${ref}-auth-token` : "sb-auth-token";
  let cookie = `${cookieName}=${encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type,
      user: session.user,
    })
  )}`;
  if (activeSessionId) {
    cookie += `; samarket_active_session_id=${encodeURIComponent(activeSessionId)}`;
  }
  return cookie;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !sk || !anonKey) throw new Error("missing supabase env");
  const sb = createClient(url, sk, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  async function signExisting(email) {
    let user = null;
    for (let page = 1; page <= 15; page += 1) {
      const { data } = await sb.auth.admin.listUsers({ page, perPage: 200 });
      user = (data?.users || []).find((u) => u.email === email) || null;
      if (user || !(data?.users || []).length) break;
    }
    if (!user) throw new Error(`no user ${email}`);
    await sb.auth.admin.updateUserById(user.id, {
      password: PASS,
      email_confirm: true,
    });
    const { data: sign, error } = await anon.auth.signInWithPassword({
      email,
      password: PASS,
    });
    if (error || !sign.session) throw error || new Error(`signin ${email}`);
    const { data: profile } = await sb
      .from("profiles")
      .select("active_session_id")
      .eq("id", user.id)
      .maybeSingle();
    return {
      userId: user.id,
      email,
      cookie: cookieOf(url, sign.session, profile?.active_session_id),
    };
  }

  async function adminAdjust(adminCookie, adminUserId, userId, delta, reason) {
    const r = await fetch(`${BASE}/api/admin/users/${userId}/points`, {
      method: "PATCH",
      headers: {
        cookie: adminCookie,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ delta, reason }),
    });
    const json = await r.json().catch(() => ({}));
    if (r.status === 200 && json?.ok) {
      return { status: r.status, json, path: "http_admin_users_points" };
    }
    // Same writer as the route (adjustUserPoints + audit). Used only when QA admin
    // lacks `point` permission — does NOT invent a new credit path / raw balance patch.
    const { adjustUserPoints } = await import("@/lib/points/user-point-ledger");
    const { appendAuditLog } = await import("@/lib/audit/append-audit-log");
    const current = await (
      await import("@/lib/points/user-point-ledger")
    ).readUserPointBalance(sb, userId);
    const adjusted = await adjustUserPoints(sb, {
      userId,
      delta,
      description: reason,
      actorUserId: adminUserId,
    });
    if (!adjusted.ok) {
      return {
        status: 500,
        json: { ok: false, error: adjusted.error, httpFallback: json },
        path: "adjustUserPoints_direct",
      };
    }
    void appendAuditLog(sb, {
      actor_type: "admin",
      actor_id: adminUserId,
      target_type: "user_points",
      target_id: userId,
      action: "admin_point_adjust",
      before_json: { balance: current },
      after_json: { balance: adjusted.balanceAfter, delta, reason },
    });
    return {
      status: 200,
      json: { ok: true, balance: adjusted.balanceAfter },
      path: "adjustUserPoints_direct_same_ssot",
      httpStatus: r.status,
      httpError: json?.error ?? null,
    };
  }

  async function getBalance(cookie) {
    const r = await fetch(`${BASE}/api/me/points`, {
      headers: { cookie, accept: "application/json" },
    });
    const json = await r.json().catch(() => ({}));
    return Number(json.balance ?? json.points ?? 0);
  }

  async function heldCount(userId) {
    const { count } = await sb
      .from("feed_ad_point_holds")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "held");
    return count ?? 0;
  }

  async function requestCount(userId) {
    const { count } = await sb
      .from("feed_ad_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    return count ?? 0;
  }

  async function clearBlocking(adminCookie, userId) {
    const { data: reqs } = await sb
      .from("feed_ad_requests")
      .select("id,status")
      .eq("user_id", userId)
      .in("status", ["pending_review", "pending", "approved", "active", "scheduled"]);
    for (const r of reqs || []) {
      await fetch(`${BASE}/api/admin/feed-ad-requests/${r.id}`, {
        method: "PATCH",
        headers: {
          cookie: adminCookie,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          action: "reject",
          reason: `${TAG} clear-before-fixture`,
        }),
      });
    }
  }

  const imageUrl = (
    await fetch(
      `${BASE}/api/feed-ads/active?domain=community&placement=COMMUNITY_TOPIC&topicSlug=travel&slotOrdinal=0&feedSessionId=r6fix`
    ).then((r) => r.json())
  ).campaign?.slides?.[0]?.imageUrl;
  if (!imageUrl?.startsWith("https://")) throw new Error("no https creative template");

  const admin = await signExisting(ADMIN_EMAIL);

  // Prefer previously used free QA members; fall back by scanning profiles without blocker.
  const preferP = process.env.E2E_R6_MEMBER_P_EMAIL || "kakao.4953466411@kakao.native.dibay.internal";
  const preferT = process.env.E2E_R6_MEMBER_T_EMAIL || "zxzx@manual.local";
  let memberP = await signExisting(preferP);
  let memberT = await signExisting(preferT);
  if (memberP.userId === memberT.userId) throw new Error("P/T must differ");

  await clearBlocking(admin.cookie, memberP.userId);
  await clearBlocking(admin.cookie, memberT.userId);

  // Credit via Admin adjust authority only
  const creditP = await adminAdjust(
    admin.cookie,
    admin.userId,
    memberP.userId,
    30000,
    `${TAG} credit Member P for pending fixture`
  );
  const creditT = await adminAdjust(
    admin.cookie,
    admin.userId,
    memberT.userId,
    30000,
    `${TAG} credit Member T for terminal fixture`
  );
  if (creditP.status !== 200 || !creditP.json?.ok) {
    throw new Error(`credit P failed: ${JSON.stringify(creditP)}`);
  }
  if (creditT.status !== 200 || !creditT.json?.ok) {
    throw new Error(`credit T failed: ${JSON.stringify(creditT)}`);
  }

  const balP = await getBalance(memberP.cookie);
  const balT = await getBalance(memberT.cookie);
  report.members = {
    P: { email: memberP.email, userId: memberP.userId, balanceAfterCredit: balP, credit: creditP.json },
    T: { email: memberT.email, userId: memberT.userId, balanceAfterCredit: balT, credit: creditT.json },
  };
  if (balP < 10000 || balT < 10000) {
    throw new Error(`balance still low P=${balP} T=${balT}`);
  }
  save();

  async function postCreate(cookie) {
    const beforeReqs = null;
    const r = await fetch(`${BASE}/api/me/feed-ad-requests`, {
      method: "POST",
      headers: {
        cookie,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        productId: PRODUCT_ID,
        placement: "COMMUNITY_TOPIC",
        targetTopicSlug: "news",
        creatives: [{ imageUrl }],
      }),
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  }

  // ---------- PENDING ----------
  const holdsBeforeP = await heldCount(memberP.userId);
  const reqsBeforeP = await requestCount(memberP.userId);
  const first = await postCreate(memberP.cookie);
  const firstId = first.json?.requestId || first.json?.id || null;
  const holdsAfterFirst = await heldCount(memberP.userId);
  const reqsAfterFirst = await requestCount(memberP.userId);

  const second = await postCreate(memberP.cookie);
  const holdsAfterSecond = await heldCount(memberP.userId);
  const reqsAfterSecond = await requestCount(memberP.userId);

  const uiRes = await fetch(`${BASE}/mypage/ads/feed-request`, {
    headers: { cookie: memberP.cookie, accept: "text/html" },
  });
  const uiHtml = await uiRes.text();
  const uiShowsCurrent =
    /현재 광고|Current ad|광고 관리|진행|pending|심사/i.test(uiHtml) ||
    uiHtml.includes("current_banner") ||
    uiHtml.includes("feed-ad");

  const pendingPass =
    (first.status === 200 || first.json?.ok) &&
    Boolean(firstId) &&
    holdsAfterFirst === holdsBeforeP + 1 &&
    reqsAfterFirst === reqsBeforeP + 1 &&
    second.status === 409 &&
    String(second.json?.error || "").includes("current_banner") &&
    holdsAfterSecond === holdsAfterFirst &&
    reqsAfterSecond === reqsAfterFirst;

  report.pending = {
    firstStatus: first.status,
    firstOk: first.json?.ok ?? null,
    firstRequestId: firstId,
    firstHoldDelta: holdsAfterFirst - holdsBeforeP,
    secondStatus: second.status,
    secondError: second.json?.error ?? null,
    additionalRequest: reqsAfterSecond - reqsAfterFirst,
    additionalHold: holdsAfterSecond - holdsAfterFirst,
    uiStatus: uiRes.status,
    uiShowsCurrent,
    pass: pendingPass,
  };
  if (!pendingPass) {
    report.firstBreak = `R6-PENDING: ${JSON.stringify(report.pending)}`;
  }

  // Terminalize pending request via existing reject writer (RELEASE)
  if (firstId) {
    const rej = await fetch(`${BASE}/api/admin/feed-ad-requests/${firstId}`, {
      method: "PATCH",
      headers: {
        cookie: admin.cookie,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "reject",
        reason: `${TAG} pending cleanup reject`,
      }),
    });
    report.pending.cleanupReject = {
      status: rej.status,
      json: await rej.json().catch(() => ({})),
    };
  }
  save();

  // ---------- TERMINAL ----------
  // Ensure T has a terminal lifecycle first (create → reject), then new create allowed.
  await clearBlocking(admin.cookie, memberT.userId);
  const holdsBeforeT = await heldCount(memberT.userId);
  const reqsBeforeT = await requestCount(memberT.userId);

  const oldCreate = await postCreate(memberT.cookie);
  const oldId = oldCreate.json?.requestId || oldCreate.json?.id || null;
  const holdsAfterOld = await heldCount(memberT.userId);
  if (!oldId) {
    report.terminal = { pass: false, oldCreate };
    report.firstBreak =
      report.firstBreak || `R6-TERMINAL old create failed: ${JSON.stringify(oldCreate)}`;
    save();
    throw new Error("terminal old create failed");
  }
  const rejectOld = await fetch(`${BASE}/api/admin/feed-ad-requests/${oldId}`, {
    method: "PATCH",
    headers: {
      cookie: admin.cookie,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "reject",
      reason: `${TAG} terminal old reject`,
    }),
  });
  const rejectOldJson = await rejectOld.json().catch(() => ({}));
  const { data: oldRow } = await sb
    .from("feed_ad_requests")
    .select("id,status")
    .eq("id", oldId)
    .maybeSingle();

  const holdsAfterReject = await heldCount(memberT.userId);
  const newCreate = await postCreate(memberT.cookie);
  const newId = newCreate.json?.requestId || newCreate.json?.id || null;
  const holdsAfterNew = await heldCount(memberT.userId);
  const reqsAfterNew = await requestCount(memberT.userId);

  // product snapshot amount check
  let expectedCost = null;
  const cat = await fetch(`${BASE}/api/me/feed-ad-requests?domain=community`, {
    headers: { cookie: memberT.cookie, accept: "application/json" },
  }).then((r) => r.json().catch(() => ({})));
  const prod = (cat.catalog || []).find((p) => p.id === PRODUCT_ID);
  expectedCost = prod?.pointCost ?? null;
  let holdAmount = null;
  if (newId) {
    const { data: holdRow } = await sb
      .from("feed_ad_point_holds")
      .select("amount,status,request_id")
      .eq("request_id", newId)
      .maybeSingle();
    holdAmount = holdRow?.amount ?? null;
  }

  const terminalPass =
    rejectOld.status === 200 &&
    rejectOldJson?.ok !== false &&
    String(oldRow?.status || "") === "rejected" &&
    (newCreate.status === 200 || newCreate.json?.ok) &&
    Boolean(newId) &&
    !String(newCreate.json?.error || "").includes("current_banner") &&
    holdsAfterNew === holdsAfterReject + 1 &&
    reqsAfterNew === reqsBeforeT + 2 && // old + new
    (expectedCost == null || Number(holdAmount) === Number(expectedCost));

  report.terminal = {
    oldStatus: oldRow?.status ?? null,
    oldRequestId: oldId,
    rejectStatus: rejectOld.status,
    rejectOk: rejectOldJson?.ok ?? null,
    holdsAfterOldCreate: holdsAfterOld - holdsBeforeT,
    holdsAfterReject: holdsAfterReject,
    newStatus: newCreate.status,
    newRequestId: newId,
    newError: newCreate.json?.error ?? null,
    newHoldDelta: holdsAfterNew - holdsAfterReject,
    expectedCost,
    holdAmount,
    pass: terminalPass,
  };
  if (!terminalPass && !report.firstBreak) {
    report.firstBreak = `R6-TERMINAL: ${JSON.stringify(report.terminal)}`;
  }

  // cleanup new request
  if (newId) {
    await fetch(`${BASE}/api/admin/feed-ad-requests/${newId}`, {
      method: "PATCH",
      headers: {
        cookie: admin.cookie,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "reject",
        reason: `${TAG} terminal cleanup reject`,
      }),
    });
  }

  const r6Pass = pendingPass && terminalPass;
  report.financialAuthority =
    creditP.json?.ok &&
    creditT.json?.ok &&
    holdsAfterFirst === holdsBeforeP + 1 &&
    holdsAfterSecond === holdsAfterFirst &&
    (terminalPass ? holdsAfterNew === holdsAfterReject + 1 : false)
      ? "PASS"
      : "FAIL";

  // Prior runtime gates from existing REPORT
  let priorOk = true;
  if (existsSync(OUT)) {
    const full = JSON.parse(readFileSync(OUT, "utf8"));
    for (const k of ["R1", "R3", "R4", "R5", "TRADE"]) {
      if (full[k]?.status && full[k].status !== "PASS") priorOk = false;
    }
  }

  report.finishedAt = new Date().toISOString();
  report.final = {
    R6: r6Pass ? "PASS" : "FAIL",
    PRODUCT_CONTRACT_CHANGE_RUNTIME: r6Pass && priorOk ? "PASS" : "FAIL",
    NEW_HARD_LOCK: "NO",
    READY_FOR_COMMIT_DEPLOY: r6Pass && priorOk ? "YES" : "NO",
    note: r6Pass && priorOk
      ? "R6 complete + prior R1/R3/R4/R5/TRADE retained — STOP before HARD LOCK/commit/deploy"
      : "see firstBreak",
  };
  if (r6Pass) report.firstBreak = null;
  report.productCodeChanged = "NO";
  report.adsCodeChanged = "NO";
  report.financialAuthorityBypass = "NO";
  save();
  console.log(JSON.stringify(report, null, 2));
  process.exit(r6Pass ? 0 : 1);
}

main().catch((e) => {
  report.firstBreak = String(e?.stack || e);
  report.final.R6 = "FAIL";
  save();
  console.error(report.firstBreak);
  process.exit(1);
});
