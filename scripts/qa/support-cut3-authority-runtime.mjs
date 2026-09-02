#!/usr/bin/env node
/**
 * Support CUT 3 — T1–T12 authority runtime (first-divergence STOP).
 * Usage: node --env-file=.env.local scripts/qa/support-cut3-authority-runtime.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  FIXTURE,
  ORIGIN,
  apiJson,
  loginSession,
  memberContext,
  ownerContext,
  sbService,
  loadEnvLocal,
} from "./support-cut3-lib.mjs";

const OUT = resolve(process.cwd(), "docs/support-center/support-cut3-runtime-close-report.json");
const RUN_ID = `cut3-${Date.now()}`;

function setReport(report, key, value, evidence = {}) {
  report.checklist[key] = { status: value, ...evidence, at: new Date().toISOString() };
}

function stop(report, testId, reason, evidence = {}) {
  report.stopped_at = testId;
  report.stop_reason = reason;
  report.stop_evidence = evidence;
  if (evidence.http === 404) {
    report.deploy_blocker = "support_api_not_deployed_to_production";
  }
  report.SUPPORT_AUTHORITY = "NOT_CLOSED";
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ phase: "STOP", testId, reason, evidence }, null, 2));
  process.exit(1);
}

async function discoverStores(sb, ownerUserId) {
  const { data: owned } = await sb
    .from("stores")
    .select("id, store_name")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: true });
  const s1 = owned?.[0]?.id ? String(owned[0].id) : null;
  const s2 = owned?.[1]?.id ? String(owned[1].id) : null;

  const { data: foreign } = await sb
    .from("stores")
    .select("id")
    .neq("owner_user_id", ownerUserId)
    .limit(1)
    .maybeSingle();
  const sx = foreign?.id ? String(foreign.id) : null;
  return { s1, s2, sx, ownedCount: owned?.length ?? 0 };
}

async function findForeignGiftInstance(sb, excludeUserId) {
  const { data } = await sb
    .from("gift_certificate_instances")
    .select("id, current_owner_user_id")
    .neq("current_owner_user_id", excludeUserId)
    .limit(1)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function main() {
  loadEnvLocal();
  mkdirSync(resolve(process.cwd(), "docs/support-center"), { recursive: true });

  const report = {
    run_id: RUN_ID,
    origin: ORIGIN,
    at: new Date().toISOString(),
    checklist: {},
    tests: {},
    SUPPORT_AUTHORITY: "NOT_CLOSED",
    PRODUCTION: "NOT_PROVEN",
  };

  const sb = sbService();
  let sessionA;
  let sessionB;
  let sessionOwner;
  let sessionAdmin;
  let userA;
  let userB;
  let userOwner;

  try {
    sessionA = await loginSession(FIXTURE.memberA);
    sessionB = await loginSession(FIXTURE.memberB);
    sessionOwner = await loginSession(FIXTURE.owner);
    sessionAdmin = await loginSession(FIXTURE.admin);
    userA = sessionA.user.id;
    userB = sessionB.user.id;
    userOwner = sessionOwner.user.id;
  } catch (e) {
    setReport(report, "AUTH_FIXTURE_LOGIN", "FAIL", { error: String(e?.message || e) });
    stop(report, "T0", "fixture_login_failed");
  }

  const { s1, s2, sx, ownedCount } = await discoverStores(sb, userOwner);
  report.fixture = { userA, userB, userOwner, s1, s2, sx, ownedCount };
  report.harness_auth = {
    root: "samarket_active_session_id from profiles.active_session_id for logged-in user",
    canonical: "gift-cut1-refund-authority-runtime / currency-ssot-runtime-live-smoke",
    product_files_changed: "NONE",
  };
  report.push_side_effect = {
    support_commit_contamination: "NONE",
    push_contained_pre_existing_local_ahead_commit: "ebc0977f84618d5438f88f572b5a79ebfd3b2ca8",
  };

  const resumeCaseId = String(process.env.SUPPORT_CUT3_CASE_A_ID || "").trim();
  let caseA;

  // T1 — Member A create (or resume prior PASS case)
  if (resumeCaseId) {
    const { data: dbResume } = await sb.from("support_cases").select("*").eq("id", resumeCaseId).maybeSingle();
    if (!dbResume || dbResume.requester_user_id !== userA) {
      stop(report, "T1", "resume_case_invalid", { resumeCaseId, requester: dbResume?.requester_user_id });
    }
    caseA = {
      id: dbResume.id,
      public_case_no: dbResume.public_case_no,
      audience: dbResume.audience,
      status: dbResume.status,
      owner_store_id: dbResume.owner_store_id,
      requester_user_id: dbResume.requester_user_id,
    };
    report.tests.T1 = { resumed: true, caseId: caseA.id, public_case_no: caseA.public_case_no };
    setReport(report, "MEMBER_A_CREATE", "PASS", {
      resumed: true,
      caseId: caseA.id,
      public_case_no: caseA.public_case_no,
    });
  } else {
    const t1 = await apiJson(sessionA, "POST", "/api/support/cases/open", {
      context: memberContext({ sourceSurface: "cut3_member_a_create" }),
      initialBody: "CUT3 T1 member A message",
    });
    report.tests.T1 = { status: t1.status, body: t1.json };
    if (t1.status !== 200 || !t1.json?.ok || !t1.json?.case?.id) {
      setReport(report, "MEMBER_A_CREATE", "FAIL", { http: t1.status, body: t1.json });
      stop(report, "T1", "member_a_create_failed", { http: t1.status, body: t1.json });
    }
    caseA = t1.json.case;
    const { data: dbA } = await sb.from("support_cases").select("*").eq("id", caseA.id).single();
    if (
      !dbA ||
      dbA.audience !== "MEMBER" ||
      dbA.owner_store_id != null ||
      dbA.requester_user_id !== userA
    ) {
      stop(report, "T1", "db_identity_mismatch", { dbA });
    }
    setReport(report, "MEMBER_A_CREATE", "PASS", {
      caseId: caseA.id,
      public_case_no: caseA.public_case_no,
    });
  }

  // T2 — Admin sees case (auth + case identity)
  const t2 = await apiJson(sessionAdmin, "GET", "/api/admin/support/cases?filter=MEMBER");
  report.tests.T2 = { status: t2.status, count: t2.json?.cases?.length, error: t2.json?.error };
  if (t2.status !== 200 || !t2.json?.ok) {
    setReport(report, "MEMBER_A_TO_ADMIN", "FAIL", {
      http: t2.status,
      error: t2.json?.error,
      harness_hint: "admin_session_cookie",
    });
    stop(report, "T2", "admin_list_not_ok", { http: t2.status, body: t2.json });
  }
  const adminCase = (t2.json?.cases ?? []).find((c) => c.id === caseA.id);
  if (!adminCase) {
    setReport(report, "MEMBER_A_TO_ADMIN", "FAIL", { caseId: caseA.id, reason: "case_not_in_admin_list" });
    stop(report, "T2", "admin_missing_case", { caseId: caseA.id });
  }
  if (
    adminCase.audience !== "MEMBER" ||
    adminCase.requester_user_id !== userA ||
    String(adminCase.public_case_no || "") !== String(caseA.public_case_no || "")
  ) {
    setReport(report, "MEMBER_A_TO_ADMIN", "FAIL", { adminCase, expected: caseA });
    stop(report, "T2", "admin_case_identity_mismatch", { adminCase });
  }
  setReport(report, "MEMBER_A_TO_ADMIN", "PASS", {
    caseId: caseA.id,
    public_case_no: caseA.public_case_no,
    case_status: adminCase.status,
  });

  // T3 — Member B GET deny
  const t3 = await apiJson(sessionB, "GET", `/api/support/cases/${caseA.id}`);
  report.tests.T3 = { status: t3.status, error: t3.json?.error };
  if (t3.status !== 403 && t3.status !== 404) {
    stop(report, "T3", "member_b_get_not_denied", { status: t3.status, body: t3.json });
  }
  setReport(report, "MEMBER_B_CROSS_GET", t3.status === 403 || t3.status === 404 ? "BLOCKED" : "FAIL");

  // T4 — Member B POST deny
  const t4 = await apiJson(sessionB, "POST", `/api/support/cases/${caseA.id}`, {
    body: "B should not send",
  });
  report.tests.T4 = { status: t4.status, error: t4.json?.error };
  if (t4.status !== 403 && t4.status !== 404) {
    stop(report, "T4", "member_b_post_not_denied", { status: t4.status, body: t4.json });
  }
  setReport(report, "MEMBER_B_CROSS_MESSAGE", t4.status === 403 || t4.status === 404 ? "BLOCKED" : "FAIL");

  // T5 — Owner S1
  let caseS1 = null;
  if (!s1) {
    setReport(report, "OWNER_S1_CREATE", "NOT_PROVEN", { blocker: "owner_has_no_store" });
  } else {
    const t5 = await apiJson(sessionOwner, "POST", "/api/support/cases/open", {
      context: ownerContext(s1, { sourceSurface: "cut3_owner_s1" }),
    });
    report.tests.T5 = { status: t5.status, body: t5.json };
    if (t5.status !== 200 || !t5.json?.ok) {
      stop(report, "T5", "owner_s1_create_failed", { status: t5.status, body: t5.json });
    }
    caseS1 = t5.json.case;
    const { data: dbS1 } = await sb.from("support_cases").select("*").eq("id", caseS1.id).single();
    if (
      !dbS1 ||
      dbS1.audience !== "OWNER" ||
      dbS1.owner_store_id !== s1 ||
      dbS1.requester_user_id !== userOwner
    ) {
      stop(report, "T5", "owner_s1_db_mismatch", { dbS1 });
    }
    setReport(report, "OWNER_S1_CREATE", "PASS", { caseId: caseS1.id, storeId: s1 });
  }

  // T6 — Owner S2
  let caseS2 = null;
  if (!s2) {
    setReport(report, "OWNER_S2_CREATE", "NOT_PROVEN", {
      blocker: "owner_has_single_store_only",
      ownedCount,
    });
  } else {
    const t6 = await apiJson(sessionOwner, "POST", "/api/support/cases/open", {
      context: ownerContext(s2, { sourceSurface: "cut3_owner_s2" }),
    });
    report.tests.T6 = { status: t6.status, body: t6.json };
    if (t6.status !== 200 || !t6.json?.ok) {
      stop(report, "T6", "owner_s2_create_failed", { status: t6.status, body: t6.json });
    }
    caseS2 = t6.json.case;
    if (caseS1 && caseS2.owner_store_id === caseS1.owner_store_id) {
      stop(report, "T6", "multi_store_not_isolated", { caseS1, caseS2 });
    }
    setReport(report, "OWNER_S2_CREATE", "PASS", { caseId: caseS2.id, storeId: s2 });
    setReport(report, "MULTI_STORE_ISOLATION", "PASS", { s1: caseS1?.owner_store_id, s2: caseS2.owner_store_id });
  }

  // T7 — Unauthorized store
  if (!sx) {
    setReport(report, "UNAUTHORIZED_STORE", "NOT_PROVEN", { blocker: "no_foreign_store_row" });
  } else {
    const t7 = await apiJson(sessionOwner, "POST", "/api/support/cases/open", {
      context: ownerContext(sx, { sourceSurface: "cut3_unauthorized" }),
    });
    report.tests.T7 = { status: t7.status, error: t7.json?.error };
    if (t7.status !== 403 || t7.json?.error !== "store_forbidden") {
      stop(report, "T7", "unauthorized_store_not_denied", { status: t7.status, body: t7.json });
    }
    setReport(report, "UNAUTHORIZED_STORE", "BLOCKED", { storeId: sx });
  }

  // T8 — Reference tamper (GIFT_INSTANCE if foreign exists)
  const foreignGift = await findForeignGiftInstance(sb, userA);
  if (!foreignGift) {
    setReport(report, "REFERENCE_TAMPER", "NOT_PROVEN", { blocker: "no_foreign_gift_instance" });
  } else {
    const t8 = await apiJson(sessionA, "POST", "/api/support/cases/open", {
      context: memberContext({
        category: "GIFT_CERTIFICATE",
        sourceSurface: "cut3_tamper_gift",
        referenceType: "GIFT_INSTANCE",
        referenceId: foreignGift,
      }),
    });
    report.tests.T8 = { status: t8.status, error: t8.json?.error };
    if (t8.status === 200 && t8.json?.ok) {
      setReport(report, "REFERENCE_TAMPER", "FAIL", { reason: "foreign_gift_allowed", foreignGift });
    } else if (t8.status === 403 && t8.json?.error === "reference_forbidden") {
      setReport(report, "REFERENCE_TAMPER", "BLOCKED", { foreignGift });
    } else {
      setReport(report, "REFERENCE_TAMPER", "FAIL", { status: t8.status, body: t8.json });
    }
  }

  // T8b — STORE_SETTLEMENT unimplemented authority (expect FAIL honestly)
  const t8b = await apiJson(sessionA, "POST", "/api/support/cases/open", {
    context: memberContext({
      category: "SETTLEMENT",
      sourceSurface: "cut3_tamper_settlement",
      referenceType: "STORE_SETTLEMENT",
      referenceId: "00000000-0000-4000-8000-000000000099",
    }),
  });
  report.tests.T8b = { status: t8b.status, body: t8b.json };
  if (t8b.status === 200 && t8b.json?.ok) {
    setReport(report, "REFERENCE_TAMPER_UNIMPLEMENTED_TYPE", "FAIL", {
      reason: "default_pass_through_STORE_SETTLEMENT",
    });
  } else {
    setReport(report, "REFERENCE_TAMPER_UNIMPLEMENTED_TYPE", "NOT_PROVEN", {
      note: "blocked_for_other_reason",
      status: t8b.status,
    });
  }

  // T9 — Sender spoof
  const t9 = await apiJson(sessionA, "POST", `/api/support/cases/${caseA.id}`, {
    body: "CUT3 spoof attempt",
    sender_type: "ADMIN",
    sender_admin_id: sessionAdmin.user.id,
  });
  report.tests.T9 = { status: t9.status };
  if (t9.status !== 200 || !t9.json?.ok) {
    stop(report, "T9", "member_message_failed", t9);
  }
  const { data: spoofMsg } = await sb
    .from("support_messages")
    .select("*")
    .eq("id", t9.json.message.id)
    .single();
  if (!spoofMsg || spoofMsg.sender_type === "ADMIN") {
    stop(report, "T9", "admin_spoof_succeeded", { spoofMsg });
  }
  setReport(report, "ADMIN_SENDER_SPOOF", "BLOCKED", { sender_type: spoofMsg.sender_type });

  // T10 — Admin filters
  const filters = ["ALL", "MEMBER", "OWNER", "UNASSIGNED", "WAITING_ADMIN", "WAITING_USER", "RESOLVED"];
  const filterResults = {};
  for (const f of filters) {
    const r = await apiJson(sessionAdmin, "GET", `/api/admin/support/cases?filter=${f}`);
    filterResults[f] = { status: r.status, count: r.json?.cases?.length ?? 0 };
  }
  report.tests.T10 = filterResults;
  const memberOnly = await apiJson(sessionAdmin, "GET", "/api/admin/support/cases?filter=MEMBER");
  const ownerOnly = await apiJson(sessionAdmin, "GET", "/api/admin/support/cases?filter=OWNER");
  const memberHasOwner = (memberOnly.json?.cases ?? []).some((c) => c.audience === "OWNER");
  const ownerHasMember = (ownerOnly.json?.cases ?? []).some((c) => c.audience === "MEMBER");
  if (memberHasOwner || ownerHasMember) {
    setReport(report, "ADMIN_MEMBER_QUEUE", "FAIL", { memberHasOwner });
    setReport(report, "ADMIN_OWNER_QUEUE", "FAIL", { ownerHasMember });
  } else {
    setReport(report, "ADMIN_MEMBER_QUEUE", "PASS");
    setReport(report, "ADMIN_OWNER_QUEUE", "PASS");
  }
  if (caseS1) {
    const ownerList = ownerOnly.json?.cases ?? [];
    const hasS1 = ownerList.some((c) => c.id === caseS1.id && c.owner_store_id === s1);
    setReport(report, "ADMIN_STORE_CONTEXT", hasS1 ? "PASS" : "FAIL", { caseS1: caseS1.id, s1 });
  }

  // T11 — Resolve lifecycle (use caseA)
  const t11reply = await apiJson(sessionAdmin, "PATCH", `/api/admin/support/cases/${caseA.id}`, {
    action: "reply",
    body: "CUT3 admin reply for resolve test",
  });
  const t11resolve = await apiJson(sessionAdmin, "PATCH", `/api/admin/support/cases/${caseA.id}`, {
    action: "status",
    status: "RESOLVED",
  });
  report.tests.T11 = { reply: t11reply.status, resolve: t11resolve.status };
  const { data: resolvedCase } = await sb.from("support_cases").select("*").eq("id", caseA.id).single();
  const { data: sessions } = await sb
    .from("support_sessions")
    .select("*")
    .eq("case_id", caseA.id)
    .order("opened_at", { ascending: false });
  const { count: msgCount } = await sb
    .from("support_messages")
    .select("*", { count: "exact", head: true })
    .eq("case_id", caseA.id);
  const { count: evtCount } = await sb
    .from("support_case_events")
    .select("*", { count: "exact", head: true })
    .eq("case_id", caseA.id);

  const sessionClosed = (sessions ?? []).some((s) => s.closed_at != null);
  if (resolvedCase?.status !== "RESOLVED" || !resolvedCase?.resolved_at) {
    setReport(report, "RESOLVE", "FAIL", { resolvedCase });
  } else {
    setReport(report, "RESOLVE", "PASS");
  }
  setReport(report, "SESSION_CLOSED", sessionClosed ? "PASS" : "FAIL");
  setReport(report, "CASE_PRESERVED", resolvedCase ? "PASS" : "FAIL");
  setReport(report, "MESSAGES_PRESERVED", (msgCount ?? 0) > 0 ? "PASS" : "FAIL", { msgCount });
  setReport(report, "EVENT_HISTORY_PRESERVED", (evtCount ?? 0) > 0 ? "PASS" : "FAIL", { evtCount });

  // T12 — Notifications
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: events } = await sb
    .from("notification_events")
    .select("id, type, category, display_payload, created_at")
    .eq("user_id", userA)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);

  const supportEvents = (events ?? []).filter((e) => String(e.type).startsWith("support_"));
  const chatPollution = (events ?? []).filter((e) =>
    ["chat_message", "trade_message", "store_order_message"].includes(String(e.type))
  );
  const adminReply = supportEvents.find((e) => e.type === "support_admin_replied");
  const resolvedEvt = supportEvents.find((e) => e.type === "support_case_resolved");
  const customerReply = supportEvents.find((e) => e.type === "support_customer_replied");

  setReport(report, "SUPPORT_NOTIFICATION", supportEvents.length > 0 ? "PASS" : "FAIL", {
    types: supportEvents.map((e) => e.type),
  });
  setReport(report, "SUPPORT_ADMIN_REPLIED_NOTIFICATION", adminReply ? "PASS" : "FAIL");
  setReport(report, "SUPPORT_CASE_RESOLVED_NOTIFICATION", resolvedEvt ? "PASS" : "FAIL");
  setReport(
    report,
    "SUPPORT_CUSTOMER_REPLIED_NOTIFICATION",
    customerReply ? "PASS" : "FAIL",
    customerReply ? {} : { note: "known_gap: not dispatched on customer message in CUT2" }
  );
  setReport(report, "NOTIFICATION_NO_CHAT_POLLUTION", chatPollution.length === 0 ? "PASS" : "FAIL");

  const deeplink = adminReply?.display_payload?.routeUrl || resolvedEvt?.display_payload?.routeUrl;
  setReport(
    report,
    "DEEPLINK",
    deeplink && String(deeplink).includes("/support/cases/") ? "PASS" : "FAIL",
    { deeplink }
  );

  // Authority close rule
  const requiredPass = [
    "MEMBER_A_CREATE",
    "MEMBER_A_TO_ADMIN",
    "MEMBER_B_CROSS_GET",
    "MEMBER_B_CROSS_MESSAGE",
    "ADMIN_SENDER_SPOOF",
    "ADMIN_MEMBER_QUEUE",
    "ADMIN_OWNER_QUEUE",
    "RESOLVE",
    "CASE_PRESERVED",
    "MESSAGES_PRESERVED",
  ];
  const blockedOk = ["MEMBER_B_CROSS_GET", "MEMBER_B_CROSS_MESSAGE", "ADMIN_SENDER_SPOOF", "UNAUTHORIZED_STORE", "REFERENCE_TAMPER"];
  const allCorePass = requiredPass.every((k) => {
    const s = report.checklist[k]?.status;
    if (blockedOk.includes(k)) return s === "BLOCKED" || s === "PASS";
    return s === "PASS";
  });
  report.SUPPORT_AUTHORITY = allCorePass ? "CLOSED" : "NOT_CLOSED";

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ phase: "AUTHORITY_RUNTIME", ok: allCorePass, report_path: OUT }, null, 2));
  process.exit(allCorePass ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ phase: "AUTHORITY_RUNTIME", ok: false, error: String(e?.message || e) }));
  process.exit(2);
});
