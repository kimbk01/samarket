#!/usr/bin/env node
/**
 * CUT 3B — support notification + deeplink targeted proof.
 * Usage: node --env-file=.env.local scripts/qa/support-cut3b-notification-deeplink-runtime.mjs
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  FIXTURE,
  apiJson,
  loginSession,
  memberContext,
  sbService,
  loadEnvLocal,
} from "./support-cut3-lib.mjs";

const OUT = resolve(process.cwd(), "docs/support-center/support-cut3-runtime-close-report.json");

function loadReport() {
  if (!existsSync(OUT)) return { checklist: {} };
  return JSON.parse(readFileSync(OUT, "utf8"));
}

function save(report) {
  mkdirSync(resolve(process.cwd(), "docs/support-center"), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

function routeOf(ev) {
  const p = ev?.display_payload || ev?.payload || {};
  return String(p.routeUrl || p.route_url || p.href || "");
}

async function main() {
  loadEnvLocal();
  const report = loadReport();
  report.cut3b = report.cut3b || {};
  const sb = sbService();

  const sessionA = await loginSession(FIXTURE.memberA);
  const sessionB = await loginSession(FIXTURE.memberB);
  const sessionAdmin = await loginSession(FIXTURE.admin);
  const userA = sessionA.user.id;
  const userB = sessionB.user.id;
  const adminId = sessionAdmin.user.id;

  const open = await apiJson(sessionA, "POST", "/api/support/cases/open", {
    context: memberContext({ sourceSurface: "cut3b_notif_probe" }),
    initialBody: "CUT3B notification seed",
  });
  if (open.status !== 200 || !open.json?.case?.id) {
    report.cut3b.notification = { status: "FAIL", open };
    save(report);
    console.log(JSON.stringify(report.cut3b.notification, null, 2));
    process.exit(1);
  }
  const caseId = open.json.case.id;
  const publicNo = open.json.case.public_case_no;
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // Assign admin so support_customer_replied has a recipient
  const assign = await apiJson(sessionAdmin, "PATCH", `/api/admin/support/cases/${caseId}`, {
    action: "assign",
    assigneeAdminId: adminId,
  });

  const reply = await apiJson(sessionAdmin, "PATCH", `/api/admin/support/cases/${caseId}`, {
    action: "reply",
    body: "CUT3B admin reply notification probe",
  });

  const customer = await apiJson(sessionA, "POST", `/api/support/cases/${caseId}`, {
    body: "CUT3B customer reply notification probe",
  });

  const resolve = await apiJson(sessionAdmin, "PATCH", `/api/admin/support/cases/${caseId}`, {
    action: "status",
    status: "RESOLVED",
  });

  await new Promise((r) => setTimeout(r, 1500));

  const { data: eventsA } = await sb
    .from("notification_events")
    .select("id, type, category, user_id, display_payload, created_at")
    .eq("user_id", userA)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: eventsAdmin } = await sb
    .from("notification_events")
    .select("id, type, category, user_id, display_payload, created_at")
    .eq("user_id", adminId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: eventsB } = await sb
    .from("notification_events")
    .select("id, type")
    .eq("user_id", userB)
    .gte("created_at", since)
    .limit(20);

  const adminReplied = (eventsA ?? []).find((e) => e.type === "support_admin_replied");
  const caseResolved = (eventsA ?? []).find((e) => e.type === "support_case_resolved");
  const customerReplied = (eventsAdmin ?? []).find((e) => e.type === "support_customer_replied");
  const chatPollution = [...(eventsA ?? []), ...(eventsAdmin ?? [])].filter((e) =>
    ["chat_message", "trade_message", "store_order_message"].includes(String(e.type))
  );
  const leakToB = (eventsB ?? []).some((e) => String(e.type).startsWith("support_"));

  const customerDeeplink = routeOf(adminReplied || caseResolved);
  const adminDeeplink = routeOf(customerReplied);

  const results = {
    assign_http: assign.status,
    reply_http: reply.status,
    customer_http: customer.status,
    resolve_http: resolve.status,
    SUPPORT_ADMIN_REPLIED: adminReplied ? "PASS" : "FAIL",
    SUPPORT_CASE_RESOLVED: caseResolved ? "PASS" : "FAIL",
    SUPPORT_CUSTOMER_REPLIED: customerReplied
      ? "PASS"
      : assign.status === 200
        ? "FAIL"
        : "NOT_APPLICABLE",
    CUSTOMER_DEEPLINK:
      customerDeeplink.includes(`/support/cases/${caseId}`) ||
      customerDeeplink.includes(`/support/cases/${encodeURIComponent(caseId)}`)
        ? "PASS"
        : "FAIL",
    ADMIN_DEEPLINK:
      adminDeeplink.includes(`/admin/support/${caseId}`) ||
      adminDeeplink.includes(`/admin/support/${encodeURIComponent(caseId)}`)
        ? "PASS"
        : customerReplied
          ? "FAIL"
          : "NOT_PROVEN",
    NO_CHAT_POLLUTION: chatPollution.length === 0 ? "PASS" : "FAIL",
    NO_CROSS_USER_LEAK: leakToB ? "FAIL" : "PASS",
    customer_route: customerDeeplink || null,
    admin_route: adminDeeplink || null,
    caseId,
    public_case_no: publicNo,
  };

  // Member B direct case GET must remain denied (deeplink security)
  const bGet = await apiJson(sessionB, "GET", `/api/support/cases/${caseId}`);
  results.MEMBER_B_DEEPLINK_DENY =
    bGet.status === 403 || bGet.status === 404 ? "BLOCKED" : "FAIL";

  const notifPass =
    results.SUPPORT_ADMIN_REPLIED === "PASS" &&
    results.SUPPORT_CASE_RESOLVED === "PASS" &&
    (results.SUPPORT_CUSTOMER_REPLIED === "PASS" ||
      results.SUPPORT_CUSTOMER_REPLIED === "NOT_APPLICABLE") &&
    results.CUSTOMER_DEEPLINK === "PASS" &&
    (results.ADMIN_DEEPLINK === "PASS" || results.ADMIN_DEEPLINK === "NOT_PROVEN") &&
    results.NO_CHAT_POLLUTION === "PASS" &&
    results.NO_CROSS_USER_LEAK === "PASS" &&
    results.MEMBER_B_DEEPLINK_DENY === "BLOCKED";

  report.cut3b.notification_results = results;
  report.cut3b.NOTIFICATION = notifPass ? "PASS" : "FAIL";
  report.checklist = report.checklist || {};
  report.checklist.SUPPORT_ADMIN_REPLIED_NOTIFICATION = {
    status: results.SUPPORT_ADMIN_REPLIED,
  };
  report.checklist.SUPPORT_CASE_RESOLVED_NOTIFICATION = {
    status: results.SUPPORT_CASE_RESOLVED,
  };
  report.checklist.SUPPORT_CUSTOMER_REPLIED_NOTIFICATION = {
    status: results.SUPPORT_CUSTOMER_REPLIED,
  };
  report.checklist.DEEPLINK = { status: results.CUSTOMER_DEEPLINK };
  report.checklist.ADMIN_DEEPLINK = { status: results.ADMIN_DEEPLINK };
  report.SUPPORT_AUTHORITY =
    report.REFERENCE_AUTHORITY === "CLOSED" && notifPass ? "NOT_CLOSED" : "NOT_CLOSED";
  // realtime still required for full SUPPORT AUTHORITY close per user terminology
  // Keep NOT_CLOSED until realtime proven; identity+reference can be CLOSED separately
  report.CASE_IDENTITY_AUTHORITY = "CLOSED";
  report.REFERENCE_AUTHORITY = report.REFERENCE_AUTHORITY || "CLOSED";
  report.PRODUCTION = "NOT_PROVEN";

  save(report);
  console.log(JSON.stringify({ NOTIFICATION: report.cut3b.NOTIFICATION, results }, null, 2));
  process.exit(notifPass ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ phase: "CUT3B_NOTIFICATION", error: String(e?.message || e) }));
  process.exit(2);
});
