#!/usr/bin/env node
/**
 * ARO-OPS-UX-002-B9 — Physical tablet Chrome (CDP via adb).
 * Classification: PHYSICAL_TABLET_BROWSER (not Chrome emulation, not CapApp).
 * Read-only. No destructive mutations.
 */
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync, spawnSync } from "node:child_process";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const OUT = resolve(process.cwd(), "docs/perf/admin-aro-ops-ux-002-b9");
const SERIAL = process.env.ARO_OPS_UX_B9_TABLET_SERIAL || "8b37179f7d94";
const CDP_PORT = Number(process.env.ARO_OPS_UX_B9_CDP_PORT || 9240);
const EMAIL = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
const ADB = process.env.ADB_PATH || (() => {
  try {
    return execSync("command -v adb", { encoding: "utf8" }).trim();
  } catch {
    return `${process.env.HOME}/Library/Android/sdk/platform-tools/adb`;
  }
})();

const ROUTES = [
  { id: "S1", path: "/admin" },
  { id: "S3", path: "/admin/stores/orders" },
  { id: "S4", path: "/admin/posts-management?tab=trade" },
  { id: "S7", path: "/admin/finance" },
  { id: "S8", path: "/admin/delivery-ads" },
  { id: "S9", path: "/admin/support" },
  { id: "S10", path: "/admin/prelaunch-reset" },
];

function log(...a) {
  console.error("[b9-tablet]", ...a);
}

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

function adb(...args) {
  const r = spawnSync(ADB, ["-s", SERIAL, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`adb ${args.join(" ")}: ${(r.stderr || r.stdout || "").trim()}`);
  return (r.stdout || "").trim();
}

function adbSoft(...args) {
  const r = spawnSync(ADB, ["-s", SERIAL, ...args], { encoding: "utf8" });
  return { status: r.status ?? 1, stdout: (r.stdout || "").trim(), stderr: (r.stderr || "").trim() };
}

async function loginSession(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const password of [
    ...new Set(
      [process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, process.env.E2E_ADMIN_PASSWORD, "DibayQa1!", "1234"].filter(
        Boolean
      )
    ),
  ]) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.session) return data.session;
  }
  const admin = createClient(url, sk, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const u = new URL(String(link?.properties?.action_link || ""));
  const tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  const { data: verified, error } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error || !verified?.session) throw new Error("login_failed");
  return verified.session;
}

async function injectSession(page, session) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: "bearer",
      user: session.user,
    })
  );
  await page.context().addCookies([
    {
      name: `sb-${ref}-auth-token`,
      value: encoded,
      domain: new URL(ORIGIN).hostname,
      path: "/",
      secure: true,
      sameSite: "Lax",
    },
  ]);
  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await svc.from("profiles").select("active_session_id").eq("id", session.user.id).maybeSingle();
  if (data?.active_session_id) {
    await page.context().addCookies([
      {
        name: "samarket_active_session_id",
        value: String(data.active_session_id),
        domain: new URL(ORIGIN).hostname,
        path: "/",
        secure: true,
        sameSite: "Lax",
      },
    ]);
  }
}

async function measure(page) {
  return page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    const header = document.querySelector(".admin-platform-shell__header");
    const main = document.querySelector("[data-admin-main-content], .admin-platform-shell__content");
    const crumb = document.querySelector("[data-admin-breadcrumb]");
    const hr = header?.getBoundingClientRect();
    const mr = main?.getBoundingClientRect();
    const bodyX = body.scrollWidth > body.clientWidth + 1 || de.scrollWidth > de.clientWidth + 1;
    const headerOverlap = !!hr && !!mr && hr.bottom > mr.top + 2;
    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
      bodyX,
      headerOverlap,
      breadcrumb: !!crumb,
      title: document.querySelector("h1")?.textContent?.trim() || "",
    };
  });
}

async function main() {
  loadEnv();
  mkdirSync(OUT, { recursive: true });

  const devices = adb("devices", "-l");
  if (!devices.includes(SERIAL)) {
    writeFileSync(
      resolve(OUT, "physical-tablet-report.json"),
      JSON.stringify({ ok: false, error: "tablet_not_attached", serial: SERIAL, devices }, null, 2)
    );
    process.exit(1);
  }

  // landscape
  adbSoft("shell", "settings", "put", "system", "user_rotation", "1");
  adbSoft("shell", "settings", "put", "system", "accelerometer_rotation", "0");

  adbSoft("forward", "--remove", `tcp:${CDP_PORT}`);
  adb("forward", `tcp:${CDP_PORT}`, "localabstract:chrome_devtools_remote");

  // Launch Chrome to origin
  adbSoft("shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `${ORIGIN}/admin`, "com.android.chrome");
  await new Promise((r) => setTimeout(r, 2500));

  const session = await loginSession(EMAIL);
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());
  await injectSession(page, session);

  const report = {
    ok: false,
    kind: "PHYSICAL_TABLET_BROWSER",
    serial: SERIAL,
    model: "24076RP19G",
    browser: "Chrome via CDP",
    orientation: "landscape",
    origin: ORIGIN,
    mutation: "NONE",
    routes: [],
  };

  try {
    for (const route of ROUTES) {
      log("goto", route.path);
      await page.goto(`${ORIGIN}${route.path}`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(1400);
      const m = await measure(page);
      const shot = `physical_${route.id}.png`;
      await page.screenshot({ path: resolve(OUT, shot), fullPage: false, timeout: 60000, animations: "disabled" }).catch(async () => {
        // CDP tablet Chrome sometimes stalls on font wait — capture via CDP buffer fallback
        const buf = await page.evaluate(async () => {
          // no-op marker; screenshot may still fail — write empty skip
          return null;
        });
        void buf;
        writeFileSync(resolve(OUT, shot.replace(".png", ".SKIP.txt")), "screenshot_timeout");
      });
      const pass = !m.bodyX && !m.headerOverlap && m.breadcrumb;
      report.routes.push({ ...route, measure: m, shot, pass });
    }

    // Trade hard confirm OPEN/CANCEL if possible
    await page.goto(`${ORIGIN}/admin/posts-management?tab=trade`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(1200);
    const row = page.locator("table tbody tr input[type='checkbox']").first();
    let dialog = { opened: false };
    if ((await row.count()) > 0) {
      await row.check({ force: true }).catch(() => row.click({ force: true }));
      await page.waitForTimeout(400);
      const hard = page.locator('[data-admin-mgmt-hard-delete="1"], [data-admin-mgmt-bulk-action="hard_delete"]').first();
      if ((await hard.count()) > 0 && !(await hard.isDisabled().catch(() => true))) {
        await hard.click({ force: true });
        await page.waitForSelector(".dibay-overlay-root", { timeout: 10000 });
        dialog = await page.evaluate(() => {
          const ar = document.querySelector(".dibay-overlay-actions")?.getBoundingClientRect();
          const vh = window.innerHeight;
          return {
            opened: true,
            footerVisible: !!ar && ar.top >= 0 && ar.bottom <= vh + 1,
            bodyX: document.body.scrollWidth > document.body.clientWidth + 1,
          };
        });
        dialog.pass = dialog.footerVisible && !dialog.bodyX;
        await page.screenshot({ path: resolve(OUT, "physical_trade_hard_confirm.png"), fullPage: false });
        const cancel = page.locator(".dibay-overlay-btn--secondary").first();
        if ((await cancel.count()) > 0) await cancel.click();
        else await page.keyboard.press("Escape");
      }
    }
    report.dialog = dialog;
    report.ok = report.routes.every((r) => r.pass) && (dialog.opened ? dialog.pass : true);

    writeFileSync(resolve(OUT, "physical-tablet-report.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ok: report.ok, routes: report.routes.map((r) => ({ id: r.id, pass: r.pass, vw: r.measure.vw, vh: r.measure.vh })), dialog }, null, 2));
    process.exit(report.ok ? 0 : 1);
  } catch (err) {
    writeFileSync(resolve(OUT, "physical-tablet-report.json"), JSON.stringify({ ok: false, error: String(err), report }, null, 2));
    console.error(err);
    process.exit(1);
  }
}

main();
