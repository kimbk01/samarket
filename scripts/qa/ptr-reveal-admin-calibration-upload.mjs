#!/usr/bin/env node
/**
 * Playwright + HTTP admin: upload calibration bands, set allowlist, screenshot presets.
 * Origin: https://samarket.vercel.app
 */
import { assertQaHttpWriteTarget } from "../lib/db-target-guard.mjs";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const CAMPAIGN_ID =
  process.env.PTR_QA_CAMPAIGN_ID?.trim() || "584561fb-1edd-49d7-9475-09e00eb4426a";
const QA_UID = process.env.PTR_QA_USER_ID?.trim() || "11111111-1111-1111-1111-111111111111";
const OUT = resolve(process.cwd(), ".tmp/ptr-calibration/admin-screens");
const CAL = resolve(process.cwd(), ".tmp/ptr-calibration");
const ORIGIN = (
  process.env.PTR_ADMIN_ORIGIN ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");
assertQaHttpWriteTarget(ORIGIN);

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_ADMIN_PASSWORD,
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean)
    ),
  ];
}

async function loginSession(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return null;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const password of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (!error && data?.session) return { session: data.session, method: "password" };
  }
  if (!sk) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  let tokenHash = "";
  try {
    const u = new URL(String(link?.properties?.action_link || ""));
    tokenHash = u.searchParams.get("token") || u.searchParams.get("token_hash") || "";
  } catch {
    tokenHash = "";
  }
  if (linkErr || !tokenHash) return null;
  const { data: verified, error: otpErr } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (otpErr || !verified?.session) return null;
  return { session: verified.session, method: "magiclink" };
}

async function resolveActiveSessionId(userId) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !sk || !userId) return null;
  const admin = createClient(url, sk, { auth: { persistSession: false } });
  const { data } = await admin.from("profiles").select("active_session_id").eq("id", userId).maybeSingle();
  return String(data?.active_session_id ?? "").trim() || null;
}

function authCookies(session, activeSessionId = null) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = new URL(url).hostname.split(".")[0];
  const origin = new URL(ORIGIN);
  const encoded = encodeURIComponent(
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      expires_in: session.expires_in,
      token_type: session.token_type || "bearer",
      user: session.user,
    })
  );
  const base = {
    domain: origin.hostname,
    path: "/",
    expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    httpOnly: false,
    secure: origin.protocol === "https:",
    sameSite: "Lax",
  };
  const cookies = [
    { ...base, name: `sb-${ref}-auth-token`, value: encoded },
    { ...base, name: "samarket_signup_locale", value: "ko" },
  ];
  if (activeSessionId) {
    cookies.push({ ...base, name: "x-samarket-active-session", value: activeSessionId });
  }
  return cookies;
}

async function uploadViaApi(request, variant, filePath) {
  const buf = readFileSync(filePath);
  const res = await request.post(`${ORIGIN}/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}/creative`, {
    multipart: {
      file: {
        name: filePath.split("/").pop(),
        mimeType: "image/png",
        buffer: buf,
      },
      creativeMode: "ptr_band",
      variant,
      altText: "PTR calibration",
    },
  });
  const json = await res.json().catch(() => ({}));
  console.log("[upload-api]", variant, res.status(), json.ok ? "ok" : json.error || json.message);
  if (!res.ok() || !json.ok) throw new Error(`upload_failed:${variant}:${json.error || res.status()}`);
}

async function main() {
  loadEnvLocal();
  mkdirSync(OUT, { recursive: true });
  for (const f of [
    "ptr-cal-phone-1280x320.png",
    "ptr-cal-tablet-2560x320.png",
    "ptr-cal-logo-256.png",
  ]) {
    if (!existsSync(resolve(CAL, f))) {
      console.error("Missing calibration PNG:", f);
      process.exit(2);
    }
  }

  const email = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
  const auth = await loginSession(email);
  if (!auth?.session) {
    console.error("admin_login_failed");
    process.exit(1);
  }
  const activeSessionId = await resolveActiveSessionId(auth.session.user.id);
  console.log("[login]", auth.method, "uid=", auth.session.user?.id, "activeSession=", Boolean(activeSessionId));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "ko-KR" });
  await context.addCookies(authCookies(auth.session, activeSessionId));
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const request = context.request;

  try {
    // Warm admin shell
    await page.goto(`${ORIGIN}/admin`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(1500);

    await uploadViaApi(request, "default", resolve(CAL, "ptr-cal-phone-1280x320.png"));
    await uploadViaApi(request, "tablet", resolve(CAL, "ptr-cal-tablet-2560x320.png"));
    await uploadViaApi(request, "logo", resolve(CAL, "ptr-cal-logo-256.png"));

    const patch = await request.patch(`${ORIGIN}/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}`, {
      data: {
        audienceMode: "allowlist",
        audienceUserIds: [QA_UID],
        name: "[CURSOR-QA-PTR] do-not-approve-public",
      },
    });
    const patchJson = await patch.json().catch(() => ({}));
    console.log("[patch-audience]", patch.status(), patchJson.ok, patchJson.error || "");
    if (!patch.ok() || !patchJson.ok) throw new Error(`patch_failed:${patchJson.error}`);

    const detail = await request.get(`${ORIGIN}/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}`);
    const detailJson = await detail.json();
    writeFileSync(resolve(OUT, "campaign-after-upload.json"), JSON.stringify(detailJson, null, 2));
    console.log(
      "[detail]",
      detail.status(),
      "bands=",
      detailJson.campaign?.ptrBands?.map((b) => b.variant),
      "audience=",
      detailJson.campaign?.audienceMode,
      detailJson.campaign?.audienceUserIds
    );

    const detailUrl = `${ORIGIN}/admin/ptr-reveal-ads/${CAMPAIGN_ID}`;
    await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: resolve(OUT, "detail-reopen.png"), fullPage: true });

    const previewReady = (await page.locator("[data-admin-ptr-preview]").count()) > 0;
    console.log("[preview-ready]", previewReady, "url=", page.url());

    if (previewReady) {
      async function shotDevice(deviceId) {
        await page.locator(`select[aria-label="기기"], select[aria-label="Device"]`).selectOption(deviceId);
        await page.waitForTimeout(800);
        const frame = page.locator(`[data-admin-ptr-preview-device="${deviceId}"]`);
        await frame.screenshot({ path: resolve(OUT, `preview-${deviceId}.png`) });
        const cropText = await frame.locator("[data-admin-ptr-preview-crop]").innerText().catch(() => "");
        console.log("[shot]", deviceId, cropText);
      }
      await shotDevice("samsung-m156s");
      await shotDevice("xiaomi-24076rp19g");
    } else {
      console.log("[WARN] preview DOM missing — API upload/save still recorded");
    }

    console.log("[PASS] calibration upload+audience at", OUT);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
