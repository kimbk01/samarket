#!/usr/bin/env node
/**
 * Merge CUT 3 phase results into final close report with per-item PASS/FAIL/NOT_PROVEN.
 * Usage: node scripts/qa/support-cut3-final-report.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPORT_PATH = resolve(process.cwd(), "docs/support-center/support-cut3-runtime-close-report.json");

const REQUIRED_KEYS = [
  "MIGRATION",
  "DB_TABLES",
  "RLS",
  "REALTIME_PUBLICATION",
  "MEMBER_A_CREATE",
  "MEMBER_A_TO_ADMIN",
  "MEMBER_B_CROSS_GET",
  "MEMBER_B_CROSS_MESSAGE",
  "OWNER_S1_CREATE",
  "OWNER_S2_CREATE",
  "UNAUTHORIZED_STORE",
  "MULTI_STORE_ISOLATION",
  "REFERENCE_TAMPER",
  "ADMIN_SENDER_SPOOF",
  "ADMIN_MEMBER_QUEUE",
  "ADMIN_OWNER_QUEUE",
  "ADMIN_STORE_CONTEXT",
  "CUSTOMER_TO_ADMIN_REALTIME",
  "ADMIN_TO_CUSTOMER_REALTIME",
  "RESOLVE",
  "SESSION_CLOSED",
  "CASE_PRESERVED",
  "MESSAGES_PRESERVED",
  "EVENT_HISTORY_PRESERVED",
  "SUPPORT_NOTIFICATION",
  "DEEPLINK",
  "FAB_ALLOWED_SURFACE",
  "FAB_FORBIDDEN_SURFACE",
  "CONTEXT_DELIVERY",
  "IOS",
  "ANDROID_GESTURE",
  "ANDROID_3_BUTTON",
  "MOBILE_WEB",
  "ADMIN_DESKTOP",
  "PRODUCTION",
];

function statusOf(report, key) {
  const c = report.checklist?.[key];
  if (c == null) return "NOT_PROVEN";
  if (typeof c === "string") return c;
  if (typeof c === "object" && c.status) return c.status;
  return "NOT_PROVEN";
}

function main() {
  if (!existsSync(REPORT_PATH)) {
    console.error("missing report — run authority/runtime scripts first");
    process.exit(2);
  }
  const report = JSON.parse(readFileSync(REPORT_PATH, "utf8"));
  const final = { at: new Date().toISOString(), items: {} };

  for (const key of REQUIRED_KEYS) {
    if (key === "MIGRATION") final.items[key] = report.MIGRATION || statusOf(report, "MIGRATION");
    else if (key === "DB_TABLES") final.items[key] = report.DB_TABLES || statusOf(report, "DB_TABLES");
    else if (key === "RLS") final.items[key] = report.RLS || statusOf(report, "RLS");
    else if (key === "REALTIME_PUBLICATION") {
      final.items[key] = report.REALTIME_PUBLICATION || statusOf(report, "REALTIME_PUBLICATION");
    } else if (key === "PRODUCTION") {
      final.items[key] = "NOT_PROVEN";
    } else {
      final.items[key] = statusOf(report, key);
    }
  }

  const authorityKeys = [
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
  const blockedOk = new Set(["MEMBER_B_CROSS_GET", "MEMBER_B_CROSS_MESSAGE", "ADMIN_SENDER_SPOOF"]);
  const authorityClosed = authorityKeys.every((k) => {
    const s = final.items[k];
    if (blockedOk.has(k)) return s === "BLOCKED" || s === "PASS";
    return s === "PASS";
  });

  report.final = final;
  report.SUPPORT_AUTHORITY = authorityClosed ? "CLOSED" : "NOT_CLOSED";
  report.PRODUCTION = "NOT_PROVEN";
  report.REALTIME =
    final.items.CUSTOMER_TO_ADMIN_REALTIME === "PASS" &&
    final.items.ADMIN_TO_CUSTOMER_REALTIME === "PASS"
      ? "PASS"
      : final.items.CUSTOMER_TO_ADMIN_REALTIME === "NOT_PROVEN"
        ? "NOT_PROVEN"
        : "FAIL";

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ SUPPORT_AUTHORITY: report.SUPPORT_AUTHORITY, final: report.final }, null, 2));
}

main();
