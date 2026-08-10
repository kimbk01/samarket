#!/usr/bin/env node
/** One-shot Community write geometry on a serial (debug). */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  DIBAY_PKG,
  connectWebView,
  ensureApkWebViewLogin,
  forwardCdp,
  navigateApkWebView,
} from "./lib/apk-webview-cdp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ADB = process.env.ADB_PATH || `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
const serial = process.argv[2] || "RFCY40PY2CA";
const port = Number(process.argv[3] || 9235);
const PROD = "https://samarket.vercel.app";

function adb(s, ...a) {
  return spawnSync(ADB, ["-s", s, ...a], { encoding: "utf8" });
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

loadEnv();
const login = await ensureApkWebViewLogin({
  adb,
  chromium,
  serial,
  cdpPort: port,
  act: `${DIBAY_PKG}/.MainActivity`,
  pkg: DIBAY_PKG,
  prod: PROD,
  login: "aaaa",
  expectedUserId: "11111111-1111-1111-1111-111111111111",
  loadEnv,
  password: process.env.E2E_TEST_PASSWORD || "1234",
  log: console.error,
  label: "oneshot",
  restartForFcm: false,
});
console.log("login", JSON.stringify(login));
if (!login.ok) process.exit(1);

forwardCdp(adb, serial, port);
const { browser, page } = await connectWebView(chromium, port);
await navigateApkWebView(page, `${PROD}/philife`, 4000);
const opened = await page.evaluate(() => {
  const btn = Array.from(document.querySelectorAll("button,a,[role=button]")).find((b) =>
    /글쓰기|Write/.test(`${b.getAttribute("aria-label") || ""}${b.textContent || ""}`)
  );
  if (!btn) return { ok: false, path: location.pathname };
  btn.click();
  return { ok: true };
});
console.log("opened", opened);
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const form = document.getElementById("philife-neighborhood-write-form");
  const input = form?.querySelector("input,textarea");
  input?.focus();
  input?.click();
});
await page.waitForTimeout(2500);
const geo = await page.evaluate(() => {
  const vv = window.visualViewport;
  const f = document.querySelector("[data-form-keyboard-footer='1']");
  const fr = f?.getBoundingClientRect();
  const el = document.activeElement;
  const er = el?.getBoundingClientRect?.();
  return {
    href: location.href,
    hasForm: Boolean(document.getElementById("philife-neighborhood-write-form")),
    pad: f && getComputedStyle(f).paddingBottom,
    open: f?.getAttribute("data-form-keyboard-open"),
    vvH: vv?.height,
    innerH: innerHeight,
    focused: el?.tagName,
    fBottom: er && Math.round(er.bottom),
    ctaBottom: fr && Math.round(fr.bottom),
    blank: fr && vv ? Math.max(0, Math.round(vv.offsetTop + vv.height - fr.bottom - 4)) : null,
    safe: getComputedStyle(document.documentElement).getPropertyValue("--safe-bottom"),
  };
});
console.log("geo", JSON.stringify(geo, null, 2));
await browser.close();
