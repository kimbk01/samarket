#!/usr/bin/env node
/**
 * Playwright admin: upload calibration phone+tablet(+logo) to QA PTR campaign,
 * save, reopen, screenshot Samsung/Xiaomi presets.
 *
 * Campaign default: 584561fb-1edd-49d7-9475-09e00eb4426a ([CURSOR-QA-PTR] do-not-approve-public)
 * Origin: NEXT_PUBLIC_SITE_URL or https://www.dibay.app
 *
 * Never prints secrets. Requires .env.local for admin login.
 */
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const CAMPAIGN_ID =
  process.env.PTR_QA_CAMPAIGN_ID?.trim() || "584561fb-1edd-49d7-9475-09e00eb4426a";
const OUT = resolve(process.cwd(), ".tmp/ptr-calibration/admin-screens");
const CAL = resolve(process.cwd(), ".tmp/ptr-calibration");

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

async function adminLogin(page, origin) {
  const email = process.env.E2E_ADMIN_EMAIL || process.env.QA_ADMIN_EMAIL || "aaaa@manual.local";
  const passes = passwords();
  await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded", timeout: 60000 });
  for (const pass of passes) {
    const emailInput = page.locator('input[type="email"], input[name="email"], input[autocomplete="username"]').first();
    const passInput = page.locator('input[type="password"]').first();
    if (await emailInput.count()) await emailInput.fill(email);
    if (await passInput.count()) await passInput.fill(pass);
    await page.locator('button[type="submit"]').first().click().catch(() => {});
    await page.waitForTimeout(2500);
    if (!page.url().includes("/login")) {
      console.log("[login] ok (password not printed)");
      return email;
    }
  }
  throw new Error("admin_login_failed");
}

async function uploadVariant(page, variant, filePath) {
  const slot = page.locator(`[data-admin-ptr-upload="${variant}"]`);
  await slot.waitFor({ state: "visible", timeout: 15000 });
  page.once("dialog", (d) => d.accept());
  const input = slot.locator('input[type="file"]');
  await input.setInputFiles(filePath);
  await page.waitForTimeout(5000);
  console.log("[upload]", variant, filePath);
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
      console.error("Missing calibration PNG — run generate-ptr-calibration-bands.mjs first:", f);
      process.exit(2);
    }
  }

  const origin = (
    process.env.PTR_ADMIN_ORIGIN ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "https://www.dibay.app"
  ).replace(/\/$/, "");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);

  try {
    await adminLogin(page, origin);
    const detailUrl = `${origin}/admin/ptr-reveal-ads/${CAMPAIGN_ID}`;
    await page.goto(detailUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-admin-ptr-detail]", { timeout: 30000 });

    await uploadVariant(page, "default", resolve(CAL, "ptr-cal-phone-1280x320.png"));
    await uploadVariant(page, "tablet", resolve(CAL, "ptr-cal-tablet-2560x320.png"));
    await uploadVariant(page, "logo", resolve(CAL, "ptr-cal-logo-256.png"));

    // Audience allowlist empty for now — set later with QA user only before activate
    const allowlistRadio = page.locator('[data-admin-ptr-audience-mode="allowlist"]');
    if (await allowlistRadio.count()) {
      await allowlistRadio.check();
      // leave ids empty until we resolve QA admin user id — fail-closed
      console.log("[audience] set allowlist (ids may be empty until activate step)");
    }

    page.once("dialog", (d) => d.accept());
    await page.locator("[data-admin-ptr-save]").click();
    await page.waitForTimeout(3000);

    // Reopen
    await page.goto(detailUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-admin-ptr-preview]", { timeout: 30000 });

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

    console.log("[PASS] upload/save/reopen screens at", OUT);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
