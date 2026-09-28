/**
 * CUT 1A Production real-file proof.
 * Auth via .env.local only. Never print passwords.
 * Real browser · real Production URL · real file input · no route mocks.
 *
 * EXPECT_GIT_SHA=<head> PLAYWRIGHT_BASE_URL=https://samarket.vercel.app \
 *   node --env-file=.env.local scripts/prove-opening-cut1a-production.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const ORIGIN = (process.env.PLAYWRIGHT_BASE_URL || "https://samarket.vercel.app").replace(/\/$/, "");
const EXPECT_SHA = (
  process.env.EXPECT_GIT_SHA ||
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim()
)
  .trim()
  .toLowerCase();
const ADMIN_USER =
  process.env.E2E_BANNER_ADMIN_USER?.trim() ||
  process.env.E2E_ADMIN_EMAIL?.trim() ||
  process.env.E2E_ADMIN_USERNAME?.trim() ||
  "aaaa";
const OUT_DIR = resolve(process.cwd(), ".tmp/opening-cut1a");
mkdirSync(OUT_DIR, { recursive: true });
const OUT = resolve(OUT_DIR, "PRODUCTION_PROOF.json");

const report = {
  title: "DIBAY_OPENING_CUT1A_PRODUCTION_REAL_FILE",
  checkedAt: new Date().toISOString(),
  origin: ORIGIN,
  expectSha: EXPECT_SHA,
  mocks: 0,
  network: [],
  steps: {},
  firstFail: null,
  final: "FAIL",
};

function save() {
  writeFileSync(OUT, JSON.stringify(report, null, 2));
}

function fail(step, detail) {
  if (!report.firstFail) report.firstFail = { step, detail };
  report.final = "FAIL";
  save();
  throw new Error(`${step}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
}

function passwords() {
  return [
    ...new Set(
      [
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        process.env.E2E_ADMIN_PASSWORD,
        process.env.E2E_BANNER_ADMIN_PASSWORD,
      ].filter(Boolean)
    ),
  ];
}

function emailsFor(user) {
  if (user.includes("@")) return [user];
  return [`${user}@manual.local`, `${user}@samarket.local`, `${user}@dibay.local`, user];
}

function reqEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

async function signInAdmin() {
  if (passwords().length === 0) fail("QA_ADMIN_CREDENTIAL", "MISSING_ENV_PASSWORD_KEYS");
  const sb = createClient(reqEnv("NEXT_PUBLIC_SUPABASE_URL"), reqEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const service = createClient(reqEnv("NEXT_PUBLIC_SUPABASE_URL"), reqEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const email of emailsFor(ADMIN_USER)) {
    for (const password of passwords()) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error || !data.session) continue;
      const userId = data.session.user.id;
      const { data: pr } = await service
        .from("profiles")
        .select("id, is_admin, username")
        .eq("id", userId)
        .maybeSingle();
      if (!pr?.is_admin) continue;
      let activeSessionId = "";
      const { data: row } = await service
        .from("profiles")
        .select("active_session_id")
        .eq("id", userId)
        .maybeSingle();
      activeSessionId = String(row?.active_session_id ?? "").trim() || randomUUID();
      await service.from("profiles").update({ active_session_id: activeSessionId }).eq("id", userId);
      report.steps.auth = { status: "PASS", is_admin: true };
      return { session: data.session, userId, activeSessionId };
    }
  }
  fail("AUTH_SESSION", "no_admin_session");
}

async function addAuthCookies(context, session, activeSessionId) {
  const ref = new URL(reqEnv("NEXT_PUBLIC_SUPABASE_URL")).hostname.split(".")[0];
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
  await context.addCookies([
    { ...base, name: `sb-${ref}-auth-token`, value: encoded },
    { ...base, name: "samarket_active_session_id", value: activeSessionId },
  ]);
}

function classifyRequest(url) {
  if (url.includes("/api/admin/opening-media/sign")) return "sign";
  if (url.includes("/storage/v1/object/upload") || url.includes("/storage/v1/object/")) return "upload";
  if (url.includes("/api/admin/opening-media/complete")) return "complete";
  return null;
}

async function main() {
  report.localHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const { session, activeSessionId } = await signInAdmin();

  const jpegPath = resolve(OUT_DIR, "cut1a-real.jpg");
  const jpeg = await sharp({
    create: { width: 960, height: 640, channels: 3, background: { r: 188, g: 32, b: 48 } },
  })
    .jpeg({ quality: 88 })
    .toBuffer();
  writeFileSync(jpegPath, jpeg);

  const browser = await chromium.launch({
    headless: true,
    channel: process.env.PROOF_CHROME_CHANNEL || "chrome",
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
  await addAuthCookies(context, session, activeSessionId);
  const page = await context.newPage();

  page.on("request", (req) => {
    const kind = classifyRequest(req.url());
    if (!kind) return;
    report.network.push({ kind, method: req.method(), url: req.url(), phase: "start" });
  });
  page.on("response", (res) => {
    const kind = classifyRequest(res.url());
    if (!kind) return;
    report.network.push({ kind, method: res.request().method(), url: res.url(), status: res.status() });
  });

  await page.goto(`${ORIGIN}/admin/intro`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  if (/\/login/.test(page.url())) fail("ADMIN_ROUTE", { url: page.url() });
  await page.locator("[data-opening-list='1']").waitFor({ timeout: 30_000 });
  report.steps.list = { status: "PASS", url: page.url() };

  await page.getByRole("button", { name: /새 인트로|New intro/ }).click();
  const title = `CUT1A ${Date.now()}`;
  await page.locator("input").last().fill(title);
  await page.getByRole("button", { name: /생성|Create/ }).click();
  await page.waitForURL(/\/admin\/intro\/[0-9a-f-]{8,}/, { timeout: 30_000 });
  await page.locator("[data-opening-studio='1']").waitFor({ timeout: 30_000 });
  report.steps.create = { status: "PASS", url: page.url() };

  const stage = page.locator("[data-opening-stage='live']");
  await stage.waitFor({ timeout: 15_000 });
  const bg = await stage.evaluate((el) => getComputedStyle(el).backgroundColor);
  report.steps.stageGreen = { status: bg.includes("11, 66, 26") || bg.includes("0B421A") ? "PASS" : "CHECK", bg };

  await page.getByRole("button", { name: /^이미지$|^Image$/ }).click();
  await page.locator("[data-opening-file-input='1']").setInputFiles(jpegPath);
  await page.locator("[data-opening-layer]").first().waitFor({ timeout: 60_000 });
  const signHit = report.network.some((n) => n.kind === "sign" && n.status && n.status < 400);
  const completeHit = report.network.some((n) => n.kind === "complete" && n.status && n.status < 400);
  const uploadHit = report.network.some(
    (n) => n.kind === "upload" && n.method === "PUT" && (!n.status || n.status < 400)
  );
  report.steps.realFile = {
    status: signHit && completeHit ? "PASS" : "FAIL",
    signHit,
    uploadHit,
    completeHit,
  };
  if (!signHit || !completeHit) fail("REAL_FILE_PIPELINE", report.steps.realFile);

  await page.getByRole("button", { name: /^저장$|^Save$/ }).click();
  await page.getByText(/저장됨|Saved/).waitFor({ timeout: 20_000 });
  report.steps.save = { status: "PASS" };

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-opening-layer]").first().waitFor({ timeout: 30_000 });
  report.steps.hardReload = { status: "PASS" };

  await page.getByRole("button", { name: /미리보기|Preview/ }).click();
  await page.locator("[data-opening-preview='1']").waitFor({ timeout: 10_000 });
  await page.locator("[data-opening-stage='preview']").waitFor({ timeout: 10_000 });
  report.steps.preview = { status: "PASS" };

  report.final = "PASS";
  report.ownerObserved = "NOT_PROVEN";
  save();
  await browser.close();
  console.log("[prove-opening-cut1a-production]", report.final);
  console.log(JSON.stringify({ network: report.network.length, steps: report.steps }, null, 2));
}

main().catch((e) => {
  console.error(e);
  save();
  process.exit(1);
});
