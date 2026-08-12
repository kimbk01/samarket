#!/usr/bin/env node
/**
 * Address PH format + address-book one-line runtime gate.
 * Login → /mypage/addresses (+ optional Philife) DOM checks.
 * Does not mutate addresses / does not call Google Places.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "@playwright/test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ORIGIN = (process.env.ADDRESS_RUNTIME_ORIGIN || process.env.NOTIF_UX_ORIGIN || "http://127.0.0.1:3010").replace(
  /\/$/,
  "",
);
const LOGIN = process.env.GATE4_RECEIVER_LOGIN || process.env.QA_MEMBER_LOGIN || "qqqq";
const STAMP = new Date().toISOString().replace(/[:.]/g, "-");
const OUT = path.join(ROOT, `.qa-logs/address-ph-format-runtime-${STAMP}`);
fs.mkdirSync(OUT, { recursive: true });

function loadEnv() {
  for (const rel of [".env.local", ".env", ".env.vercel.production"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
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

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        process.env.E2E_MEMBER_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter(Boolean),
    ),
  ];
}

const log = (m) => {
  console.log(m);
  fs.appendFileSync(path.join(OUT, "run.log"), m + "\n");
};

async function signInCookie(login) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon) throw new Error("missing supabase env");
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  for (const email of [`${login}@manual.local`, `${login}@dibay.local`, `${login}@samarket.local`]) {
    for (const password of passwords()) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (!error && data.session) {
        session = data.session;
        break;
      }
    }
    if (session) break;
  }
  if (!session) throw new Error(`login fail: ${login}`);
  const ref = new URL(url).hostname.split(".")[0];
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const cookiePayload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: "bearer",
    user: session.user,
  };
  const host = new URL(ORIGIN).hostname;
  const cookies = [
    {
      name: `sb-${ref}-auth-token`,
      value: encodeURIComponent(JSON.stringify(cookiePayload)),
      domain: host,
      path: "/",
      httpOnly: false,
      secure: ORIGIN.startsWith("https"),
      sameSite: "Lax",
    },
  ];
  if (sk) {
    const admin = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await admin
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    if (pr?.active_session_id) {
      cookies.push({
        name: "samarket_active_session_id",
        value: encodeURIComponent(String(pr.active_session_id)),
        domain: host,
        path: "/",
        httpOnly: false,
        secure: ORIGIN.startsWith("https"),
        sameSite: "Lax",
      });
    }
  }
  return { cookies, accessToken: session.access_token };
}

function assertNoCountry(text) {
  return !/PHILIPPINES|Philippines|필리핀/i.test(text || "");
}

async function main() {
  const report = {
    origin: ORIGIN,
    login: LOGIN,
    addressBook: { status: "HOLD", countryExcluded: null, rowCount: 0, sample: null },
    philifeHeader: { status: "HOLD", line: null },
    apiList: { status: "HOLD", samplePlainHints: [] },
    final: "HOLD",
  };

  log(`OUT=${OUT}`);
  log(`ORIGIN=${ORIGIN} LOGIN=${LOGIN}`);

  const auth = await signInCookie(LOGIN);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(auth.cookies);
  const page = await context.newPage();

  try {
    const api = await page.request.get(`${ORIGIN}/api/me/addresses`, {
      headers: { Authorization: `Bearer ${auth.accessToken}` },
    });
    report.apiList.http = api.status();
    if (api.ok()) {
      const body = await api.json();
      const list = Array.isArray(body) ? body : body?.addresses || body?.data || [];
      report.apiList.status = "PASS";
      report.apiList.count = list.length;
      for (const row of list.slice(0, 3)) {
        const blob = [
          row.unit_floor_room || row.unitFloorRoom,
          row.detail_address || row.detailAddress,
          row.street_address || row.streetAddress,
          row.city_municipality || row.cityMunicipality,
          row.formatted_address || row.formattedAddress,
        ]
          .filter(Boolean)
          .join(" | ");
        report.apiList.samplePlainHints.push(blob.slice(0, 160));
      }
    } else {
      report.apiList.status = "FAIL";
      report.apiList.body = (await api.text()).slice(0, 200);
    }

    await page.goto(`${ORIGIN}/mypage/addresses`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3500);
    const addrUrl = page.url();
    const addrBody = ((await page.locator("body").innerText()) || "").replace(/\s+/g, " ").trim();
    fs.writeFileSync(path.join(OUT, "mypage-addresses.txt"), addrBody.slice(0, 8000));
    await page.screenshot({ path: path.join(OUT, "mypage-addresses.png"), fullPage: true });
    report.addressBook.url = addrUrl;
    report.addressBook.bodyPreview = addrBody.slice(0, 400);

    const countryHit = !assertNoCountry(addrBody);
    const looksLikeAddressUi =
      /Unit|Pasay|Quezon|Manila|Barangay|Street|Avenue|Parañaque|Roxas/i.test(addrBody) &&
      !/Loading…|Loading\.\.\./i.test(addrBody) &&
      !/로그인|Log in|Sign in/i.test(addrBody.slice(0, 200));
    report.addressBook.countryExcluded = looksLikeAddressUi ? !countryHit : null;
    report.addressBook.rowCount = looksLikeAddressUi ? 1 : 0;
    report.addressBook.sample = looksLikeAddressUi ? addrBody.slice(0, 220) : null;
    report.addressBook.status = looksLikeAddressUi && !countryHit ? "PASS" : looksLikeAddressUi && countryHit ? "FAIL" : "HOLD";

    await page.goto(`${ORIGIN}/philife`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(OUT, "philife.png"), fullPage: false });
    const headerText = ((await page.locator("header").first().innerText().catch(() => "")) || "").replace(/\s+/g, " ");
    report.philifeHeader.line = headerText.slice(0, 240);
    const headerLeak = /Unit\s+\d|Barangay\s+|PHILIPPINES/i.test(headerText);
    report.philifeHeader.status = headerText ? (headerLeak ? "FAIL" : "PASS") : "HOLD";
  } catch (e) {
    report.error = String(e?.message || e);
    log(`ERROR ${report.error}`);
  } finally {
    await browser.close();
  }

  const passish =
    report.apiList.status === "PASS" &&
    report.addressBook.status === "PASS" &&
    report.philifeHeader.status !== "FAIL";
  report.final = passish ? "PASS" : "HOLD";
  fs.writeFileSync(path.join(OUT, "REPORT.json"), JSON.stringify(report, null, 2));
  log(JSON.stringify(report, null, 2));
  process.exit(passish ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
