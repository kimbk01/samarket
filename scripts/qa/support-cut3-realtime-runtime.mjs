#!/usr/bin/env node
/**
 * Support CUT 3 — realtime proof (dual Playwright contexts, no manual refresh).
 * Usage: node --env-file=.env.local scripts/qa/support-cut3-realtime-runtime.mjs
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  FIXTURE,
  ORIGIN,
  apiJson,
  loginSession,
  memberContext,
  cookieHeader,
  sbService,
  loadEnvLocal,
} from "./support-cut3-lib.mjs";

const REPORT_PATH = resolve(process.cwd(), "docs/support-center/support-cut3-runtime-close-report.json");

function loadReport() {
  if (!existsSync(REPORT_PATH)) return { checklist: {} };
  return JSON.parse(readFileSync(REPORT_PATH, "utf8"));
}

function saveReport(report) {
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
}

async function playwrightCookies(session) {
  const header = await cookieHeader(session);
  const origin = new URL(ORIGIN);
  const expires = session.expires_at ?? Math.floor(Date.now() / 1000) + 3600;
  return header.split("; ").filter(Boolean).map((part) => {
    const eq = part.indexOf("=");
    const name = part.slice(0, eq);
    const value = part.slice(eq + 1);
    return {
      name,
      value,
      domain: origin.hostname,
      path: "/",
      expires,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax",
    };
  });
}

async function main() {
  loadEnvLocal();
  const report = loadReport();
  report.checklist = report.checklist || {};

  const sessionA = await loginSession(FIXTURE.memberA);
  const sessionAdmin = await loginSession(FIXTURE.admin);

  const open = await apiJson(sessionA, "POST", "/api/support/cases/open", {
    context: memberContext({ sourceSurface: "cut3_realtime_probe" }),
  });
  if (open.status !== 200 || !open.json?.case?.id) {
    report.checklist.CUSTOMER_TO_ADMIN_REALTIME = {
      status: "NOT_PROVEN",
      blocker: "case_open_failed",
      http: open.status,
    };
    report.checklist.ADMIN_TO_CUSTOMER_REALTIME = { status: "NOT_PROVEN", blocker: "case_open_failed" };
    saveReport(report);
    console.log(JSON.stringify(report.checklist, null, 2));
    process.exit(1);
  }
  const caseId = open.json.case.id;
  const casePath = `/support/cases/${caseId}`;
  const adminPath = `/admin/support/${caseId}`;

  const browser = await chromium.launch({ headless: true });
  const memberCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const adminCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await memberCtx.addCookies(await playwrightCookies(sessionA));
  await adminCtx.addCookies(await playwrightCookies(sessionAdmin));

  const memberPage = await memberCtx.newPage();
  const adminPage = await adminCtx.newPage();

  await memberPage.goto(`${ORIGIN}${casePath}`, { waitUntil: "domcontentloaded" });
  await adminPage.goto(`${ORIGIN}${adminPath}`, { waitUntil: "domcontentloaded" });
  await memberPage.waitForTimeout(2000);
  await adminPage.waitForTimeout(2000);

  const memberMsg = `CUT3-RT-MEMBER-${Date.now()}`;
  const adminMsg = `CUT3-RT-ADMIN-${Date.now()}`;

  const memberCountBefore = await memberPage.locator(".whitespace-pre-wrap").count();
  const adminCountBefore = await adminPage.locator(".whitespace-pre-wrap").count();

  await memberPage.locator("textarea").fill(memberMsg);
  await memberPage.getByRole("button", { name: /메시지 보내기|Send message/i }).click();

  try {
    await adminPage.waitForFunction(
      (text) => document.body.innerText.includes(text),
      memberMsg,
      { timeout: 15000 }
    );
    report.checklist.CUSTOMER_TO_ADMIN_REALTIME = { status: "PASS", message: memberMsg };
  } catch {
    report.checklist.CUSTOMER_TO_ADMIN_REALTIME = {
      status: "FAIL",
      message: memberMsg,
      admin_count_before: adminCountBefore,
      admin_count_after: await adminPage.locator(".whitespace-pre-wrap").count(),
    };
  }

  await adminPage.locator("textarea").first().fill(adminMsg);
  await adminPage.getByRole("button", { name: /^답변$|^Reply$/i }).click();

  try {
    await memberPage.waitForFunction(
      (text) => document.body.innerText.includes(text),
      adminMsg,
      { timeout: 15000 }
    );
    report.checklist.ADMIN_TO_CUSTOMER_REALTIME = { status: "PASS", message: adminMsg };
  } catch {
    report.checklist.ADMIN_TO_CUSTOMER_REALTIME = {
      status: "FAIL",
      message: adminMsg,
      member_count_before: memberCountBefore,
      member_count_after: await memberPage.locator(".whitespace-pre-wrap").count(),
    };
  }

  report.checklist.REALTIME_RECONNECT = { status: "NOT_PROVEN", note: "out_of_cut3_scope" };
  report.REALTIME =
    report.checklist.CUSTOMER_TO_ADMIN_REALTIME?.status === "PASS" &&
    report.checklist.ADMIN_TO_CUSTOMER_REALTIME?.status === "PASS"
      ? "PASS"
      : "FAIL";

  saveReport(report);
  await browser.close();
  console.log(JSON.stringify({ REALTIME: report.REALTIME, checklist: report.checklist }, null, 2));
  process.exit(report.REALTIME === "PASS" ? 0 : 1);
}

main().catch((e) => {
  console.error(JSON.stringify({ phase: "REALTIME", error: String(e?.message || e) }));
  process.exit(2);
});
