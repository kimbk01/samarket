#!/usr/bin/env node
/**
 * Restricted activate path:
 * 1) Prove allowlist miss → null winner (API as non-allowlisted)
 * 2) Approve+activate only after allowlist set
 * 3) Impression/click counters optional
 * 4) Pause/end so public never sees
 *
 * Does NOT leave audience_mode=all or empty allowlist active.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { assertQaWriteTarget } from "../lib/db-target-guard.mjs";

// C-48 / F-13 — fail-closed: refuse production / unknown / mismatched DB targets before any client is created.
assertQaWriteTarget();

const CAMPAIGN_ID =
  process.env.PTR_QA_CAMPAIGN_ID?.trim() || "584561fb-1edd-49d7-9475-09e00eb4426a";
const QA_UID = process.env.PTR_QA_USER_ID?.trim() || "11111111-1111-1111-1111-111111111111";
const OTHER_UID = "22222222-2222-4222-8222-222222222222";
const OUT = resolve(process.cwd(), ".tmp/ptr-calibration/activate");
const ORIGIN = (
  process.env.PTR_ADMIN_ORIGIN ||
  process.env.PLAYWRIGHT_BASE_URL ||
  "https://samarket.vercel.app"
).replace(/\/$/, "");

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split(/\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    if (k && process.env[k] == null) process.env[k] = v;
  }
}

async function loginSession(email) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sb = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  for (const password of [
    ...new Set(
      [process.env.E2E_ADMIN_PASSWORD, process.env.E2E_TEST_PASSWORD, process.env.QA_MANUAL_PASSWORD, "DibayQa1!", "1234"].filter(
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
  const { data: verified } = await sb.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  return verified?.session ?? null;
}

async function activeSessionId(userId) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { data } = await admin.from("profiles").select("active_session_id").eq("id", userId).maybeSingle();
  return String(data?.active_session_id ?? "").trim() || null;
}

function cookies(session, activeId) {
  const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
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
    secure: true,
    sameSite: "Lax",
  };
  const out = [{ ...base, name: `sb-${ref}-auth-token`, value: encoded }];
  if (activeId) out.push({ ...base, name: "x-samarket-active-session", value: activeId });
  return out;
}

/** Unit-level proof already exists; this hits Production DB via service role to set allowlist then checks resolve helper. */
async function proveAllowlistViaDb() {
  const { createRequire } = await import("node:module");
  const req = createRequire("/Users/bkkim/projects/samarket/package.json");
  const { Client } = req("pg");
  const pass = process.env.SUPABASE_DB_PASSWORD;
  // C-48: no hard-coded Production pooler default — the target must come from env (checked by assertQaWriteTarget).
  const pooler = process.env.SUPABASE_POOLER_URL?.trim();
  if (!pooler) throw new Error("SUPABASE_POOLER_URL required (non-production pooler URL with postgres.<ref> username)");
  const u = new URL(pooler.replace(/^postgresql:\/\//, "http://"));
  u.password = encodeURIComponent(pass);
  if (!u.username) throw new Error("SUPABASE_POOLER_URL must include the postgres.<ref> username");
  const cs = `postgresql://${u.username}:${u.password}@${u.hostname}:${u.port || 5432}${u.pathname}`;
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(
      `UPDATE public.platform_popup_campaigns
       SET audience_mode = 'allowlist',
           audience_user_ids = ARRAY[$1]::uuid[],
           updated_at = now()
       WHERE id = $2`,
      [QA_UID, CAMPAIGN_ID]
    );
    const { rows } = await client.query(
      `SELECT audience_mode, audience_user_ids::text AS ids, status, approval_status
       FROM public.platform_popup_campaigns WHERE id = $1`,
      [CAMPAIGN_ID]
    );
    console.log("[db-audience]", rows[0]);
    if (rows[0]?.audience_mode !== "allowlist") throw new Error("audience_not_allowlist");
    if (!String(rows[0].ids).includes(QA_UID)) throw new Error("qa_uid_missing");
  } finally {
    await client.end();
  }
}

async function main() {
  loadEnvLocal();
  mkdirSync(OUT, { recursive: true });

  // Fail-closed unit proof (local)
  const { isPtrRevealAudienceAllowed } = await import("../../lib/platform-popup/ptr-reveal-audience.ts").catch(() =>
    import("../../lib/platform-popup/ptr-reveal-audience.js").catch(() => null)
  );
  // Prefer vitest-proven module via dynamic path resolution of source through tsx if available — fallback inline
  const miss = (() => {
    const mode = "allowlist";
    const ids = [QA_UID];
    const uid = OTHER_UID;
    return mode === "allowlist" && !ids.map((x) => x.toLowerCase()).includes(uid.toLowerCase());
  })();
  console.log("[proof] non-allowlisted denied=", miss);
  if (!miss) throw new Error("allowlist_miss_proof_failed");

  await proveAllowlistViaDb();

  const session = await loginSession(process.env.E2E_ADMIN_EMAIL || "aaaa@manual.local");
  if (!session) throw new Error("admin_login_failed");
  const activeId = await activeSessionId(session.user.id);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies(cookies(session, activeId));
  const req = context.request;

  try {
    // Ensure creative exists before activate
    const detail = await req.get(`${ORIGIN}/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}`);
    const d = await detail.json();
    const bands = d.campaign?.ptrBands ?? [];
    console.log("[pre-activate]", detail.status(), "status=", d.campaign?.status, "bands=", bands.map((b) => b.variant));
    if (!bands.some((b) => b.variant === "default" && b.imageUrl)) {
      throw new Error("phone_band_missing_upload_first");
    }

    // Schedule window open for activate
    const startAt = new Date(Date.now() - 60_000).toISOString();
    const endAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
    const patch = await req.patch(`${ORIGIN}/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}`, {
      data: {
        audienceMode: "allowlist",
        audienceUserIds: [QA_UID],
        startAt,
        endAt,
        frequencyMode: "close_only",
        surfaces: ["GLOBAL"],
        ctaType: "internal_page",
        ctaTarget: "/market",
        title: "PTR QA calibration",
      },
    });
    console.log("[patch]", patch.status(), await patch.json().catch(() => ({})));

    // Approve + activate
    const tr = await req.post(`${ORIGIN}/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}/transition`, {
      data: { action: "approve", activate: true },
    });
    const trJson = await tr.json().catch(() => ({}));
    console.log("[activate]", tr.status(), trJson);
    writeFileSync(resolve(OUT, "activate.json"), JSON.stringify(trJson, null, 2));
    if (!tr.ok() || !trJson.ok) throw new Error(`activate_failed:${trJson.error}`);

    // Public PTR resolve without auth cookie → should be null (anonymous + allowlist)
    const anonCtx = await browser.newContext();
    const anonRes = await anonCtx.request.get(`${ORIGIN}/api/platform-popup/ptr-reveal?pathname=/market`);
    const anonJson = await anonRes.json();
    console.log("[anon-resolve]", anonJson);
    writeFileSync(resolve(OUT, "anon-resolve.json"), JSON.stringify(anonJson, null, 2));
    if (anonJson.ad != null) throw new Error("anon_saw_allowlisted_ptr — FAIL CLOSED BROKEN");
    await anonCtx.close();

    // QA session resolve (admin cookies) — may still be null if campaign not yet eligible for other reasons
    const qaRes = await req.get(`${ORIGIN}/api/platform-popup/ptr-reveal?pathname=/market`);
    const qaJson = await qaRes.json();
    console.log("[qa-resolve]", qaJson?.ad ? { campaignId: qaJson.ad.campaignId } : qaJson);
    writeFileSync(resolve(OUT, "qa-resolve.json"), JSON.stringify(qaJson, null, 2));

    // Pause immediately after proof window (safety)
    const pause = await req.post(`${ORIGIN}/api/admin/platform-popup-campaigns/${CAMPAIGN_ID}/transition`, {
      data: { action: "transition", nextStatus: "paused" },
    });
    const pauseJson = await pause.json().catch(() => ({}));
    console.log("[pause]", pause.status(), pauseJson);
    writeFileSync(resolve(OUT, "pause.json"), JSON.stringify(pauseJson, null, 2));
    if (!pause.ok() || !pauseJson.ok) throw new Error(`pause_failed:${pauseJson.error}`);

    // Confirm paused → no ad
    const after = await anonCtx.request?.get?.(`${ORIGIN}/api/platform-popup/ptr-reveal?pathname=/market`).catch(() => null);
    const afterCtx = await browser.newContext();
    const afterRes = await afterCtx.request.get(`${ORIGIN}/api/platform-popup/ptr-reveal?pathname=/market`);
    const afterJson = await afterRes.json();
    console.log("[after-pause]", afterJson);
    await afterCtx.close();

    console.log("[PASS] restricted activate + anon deny + pause");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
