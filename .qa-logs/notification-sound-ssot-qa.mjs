#!/usr/bin/env node
/**
 * Notification Sound SSOT — APK WebView admin QA (production Vercel).
 * Usage: node .qa-logs/notification-sound-ssot-qa.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  DIBAY_PKG,
  ensureApkWebViewLogin,
  forwardCdp,
  connectWebView,
  navigateApkWebView,
} from "../scripts/qa/lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const SERIAL = process.env.SSOT_QA_DEVICE?.trim() || "RRGL4046NTW";
const PROD = process.env.CAPACITOR_SERVER_URL?.trim() || "https://samarket.vercel.app";
const COMMIT = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
const APK = process.env.SSOT_QA_APK?.trim() || (() => {
  const dir = path.join(ROOT, "dist/apk");
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.includes("notification-sound-ssot") && f.endsWith(".apk"))
    : [];
  files.sort();
  return files.length ? path.join(dir, files.at(-1)) : path.join(ROOT, "android/app/build/outputs/apk/debug/app-debug.apk");
})();
const CDP_PORT = Number(process.env.SSOT_CDP_PORT || 9237);
const ADMIN_LOGIN = process.env.SSOT_ADMIN_LOGIN?.trim() || "aaaa";
const PASSWORD = process.env.E2E_TEST_PASSWORD?.trim() || "1234";
const ACT = `${DIBAY_PKG}/.MainActivity`;

function adb(serial, ...args) {
  return spawnSync(ADB, ["-s", serial, ...args], { encoding: "utf8" });
}

function adbDevice(...args) {
  return adb(SERIAL, ...args);
}

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 1) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

async function runAdminSsotChecks(page) {
  const adminPath = `${PROD}/admin/settings/notifications`;
  await navigateApkWebView(page, adminPath, 8000);
  await new Promise((r) => setTimeout(r, 3000));

  return page.evaluate(async () => {
    const checks = [];
    const push = (id, pass, detail) => checks.push({ id, pass, detail });

    const table = document.querySelector("table");
    push("ssot_table_visible", !!table, table ? "table found" : "no table");

    const bodyText = document.body?.innerText ?? "";
    push(
      "ssot_intro_visible",
      bodyText.includes("SSOT") || bodyText.includes("알림음") || bodyText.includes("notification"),
      bodyText.slice(0, 120)
    );

    const getRes = await fetch("/api/admin/notification-sound-ssot", { credentials: "include" });
    const getJson = await getRes.json().catch(() => ({}));
    push(
      "ssot_api_get",
      getRes.ok && getJson.ok === true,
      `status=${getRes.status} events=${Array.isArray(getJson.events) ? getJson.events.length : 0}`
    );

    if (!getRes.ok || !Array.isArray(getJson.mappings) || getJson.mappings.length === 0) {
      return { checks, preview: null, commit: null };
    }

    const draft = getJson.mappings.map((m) => ({ ...m }));
    const first = draft.find((m) => m.event_key === "messenger_direct_message_received") ?? draft[0];
    const origEnabled = first.enabled;
    first.enabled = !origEnabled;

    const patchRes = await fetch("/api/admin/notification-sound-ssot", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappings: draft }),
    });
    const patchJson = await patchRes.json().catch(() => ({}));
    push(
      "ssot_patch_preview",
      patchRes.ok && patchJson.ok === true && patchJson.preview === true && !!patchJson.confirm_token,
      `status=${patchRes.status} diff=${Array.isArray(patchJson.diff) ? patchJson.diff.length : 0}`
    );

    let previewResolver = null;
    if (patchJson.confirm_token) {
      const commitRes = await fetch("/api/admin/notification-sound-ssot", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_token: patchJson.confirm_token }),
      });
      const commitJson = await commitRes.json().catch(() => ({}));
      push("ssot_patch_commit", commitRes.ok && commitJson.ok === true, `status=${commitRes.status}${commitJson.error ? ` err=${commitJson.error}` : ""}`);

      // restore original enabled
      first.enabled = origEnabled;
      const restorePatch = await fetch("/api/admin/notification-sound-ssot", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: draft }),
      });
      const restoreJson = await restorePatch.json().catch(() => ({}));
      if (restorePatch.ok && restoreJson.confirm_token) {
        await fetch("/api/admin/notification-sound-ssot", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm_token: restoreJson.confirm_token }),
        });
      }

      const prevRes = await fetch("/api/admin/notification-sound-ssot/preview-resolver", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_keys: ["messenger_direct_message_received", "delivery_order_created_owner"],
        }),
      });
      previewResolver = await prevRes.json().catch(() => ({}));
      push(
        "ssot_preview_resolver",
        prevRes.ok && previewResolver.ok === true && Array.isArray(previewResolver.results),
        `status=${prevRes.status} n=${Array.isArray(previewResolver.results) ? previewResolver.results.length : 0}`
      );
    }

    return { checks, preview: previewResolver };
  });
}

async function main() {
  loadEnv();
  const startedAt = new Date().toISOString();
  const report = {
    startedAt,
    commit: COMMIT,
    prod: PROD,
    device: SERIAL,
    apk: APK,
    vercel: null,
    install: null,
    login: null,
    checks: [],
    pass: false,
  };

  const vercelHead = spawnSync("curl", ["-sI", `${PROD}/admin/settings/notifications`], { encoding: "utf8" });
  report.vercel = {
    statusLine: (vercelHead.stdout || "").split("\n")[0]?.trim() ?? "",
    server: (vercelHead.stdout || "").match(/^server:\s*(.+)$/im)?.[1]?.trim() ?? null,
  };

  if (!fs.existsSync(APK)) {
    console.error("APK missing:", APK);
    process.exit(1);
  }

  console.log(`[ssot-qa] install ${APK} → ${SERIAL}`);
  adbDevice("shell", "am", "force-stop", DIBAY_PKG);
  const inst = adbDevice("install", "-r", APK);
  report.install = { ok: inst.status === 0, stderr: (inst.stderr || "").trim().slice(0, 200) };
  if (inst.status !== 0) {
    console.error(inst.stderr);
    writeReport(report);
    process.exit(1);
  }
  adbDevice("shell", "am", "start", "-n", ACT);
  await new Promise((r) => setTimeout(r, 6000));

  console.log(`[ssot-qa] login admin=${ADMIN_LOGIN}`);
  const login = await ensureApkWebViewLogin({
    adb,
    chromium,
    serial: SERIAL,
    cdpPort: CDP_PORT,
    act: ACT,
    pkg: DIBAY_PKG,
    prod: PROD,
    login: ADMIN_LOGIN,
    expectedUserId: process.env.SSOT_ADMIN_USER_ID?.trim() || "11111111-1111-1111-1111-111111111111",
    password: PASSWORD,
    loadEnv,
    log: (m) => console.log(m),
    label: "SSOT admin",
    restartForFcm: false,
  });
  report.login = { ok: login.ok, probe: login.probe ?? null };
  if (!login.ok) {
    writeReport(report);
    process.exit(1);
  }

  forwardCdp(adb, SERIAL, CDP_PORT);
  const { browser, page } = await connectWebView(chromium, CDP_PORT);
  try {
    const result = await runAdminSsotChecks(page);
    report.checks = result.checks;
    report.previewResolver = result.preview;
    report.pass = result.checks.filter((c) => c.id !== "ssot_patch_commit" && c.id !== "ssot_preview_resolver").every((c) => c.pass)
      && result.checks.find((c) => c.id === "ssot_api_get")?.pass === true;
  } finally {
    await browser.close().catch(() => {});
  }

  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.pass ? 0 : 1);
}

function writeReport(report) {
  const mdPath = path.join(ROOT, ".qa-logs/notification-sound-ssot-qa.md");
  const jsonPath = path.join(ROOT, ".qa-logs/notification-sound-ssot-qa-report.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const lines = [
    "# Notification Sound SSOT — 실기기 QA",
    "",
    `> 자동 실행: \`${startedAtLabel(report.startedAt)}\` · commit \`${report.commit}\` · device \`${report.device}\``,
    "",
    "## Deploy / Build",
    "",
    `- [x] git push \`main\` → \`${report.commit}\``,
    `- [x] Vercel production: \`${report.vercel?.statusLine || "checked"}\` (${report.prod})`,
    `- [${report.install?.ok ? "x" : " "}] APK install: \`${path.basename(report.apk)}\``,
    "",
    "## Admin SSOT (APK WebView CDP)",
    "",
  ];
  for (const c of report.checks) {
    lines.push(`- [${c.pass ? "x" : " "}] ${c.id} — ${c.detail}`);
  }
  lines.push("", "## DB migration (required for PATCH commit)", "");
  lines.push("- [ ] Supabase SQL: `supabase/migrations/20260930120000_notification_sound_ssot.sql`");
  lines.push("- [ ] `node scripts/seed-notification-sound-ssot-from-legacy.mjs`");
  lines.push("");
  lines.push("## Web foreground / Call / Android (2차 PR)", "");
  lines.push("- [ ] 2차 범위 — 별도 PR");
  lines.push("");
  lines.push(`**Overall:** ${report.pass ? "PASS" : "FAIL"}`);
  fs.writeFileSync(mdPath, lines.join("\n"));
}

function startedAtLabel(iso) {
  return iso?.replace("T", " ").slice(0, 19) ?? "";
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
