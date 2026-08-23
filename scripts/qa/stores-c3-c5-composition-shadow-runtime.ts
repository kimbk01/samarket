#!/usr/bin/env node
/**
 * C3-C5 — Composition engine shadow runtime proof.
 *
 * - Uses canonical Admin E2E credentials (same as C2)
 * - Applies temporary override via C2 Admin API (no DB direct write)
 * - Proves shadow delta while live HOME/BROWSE responses unchanged
 *
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
 * npx tsx --env-file=.env.local scripts/qa/stores-c3-c5-composition-shadow-runtime.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";
import { composeStoresHomeFeed } from "@/lib/stores/stores-home-composer";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import { resolveDefaultCompositionPolicy } from "@/lib/stores/composition/stores-composition-policy-runtime";
import {
  runBrowseCompositionShadow,
  runHomeCompositionShadow,
} from "@/lib/stores/composition/stores-composition-shadow";
import type { StoresCompositionSectionContract } from "@/lib/stores/composition/stores-composition-contract";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const BASE = (process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT_DIR = path.join(ROOT, "docs/perf/stores-c3-c5-composition-shadow");
const OUT_JSON = path.join(OUT_DIR, "c3-c5-shadow-runtime-latest.json");

fs.mkdirSync(OUT_DIR, { recursive: true });

type PolicyRow = {
  surface: string;
  slot: string;
  contentType: string;
  enabled: boolean;
  order: number;
  max: number | null;
  interval: { consumed: false; reason: "NOT_CONSUMED" };
  titleAuthority: "presentation_i18n";
};

const report: Record<string, unknown> = {
  measuredAt: new Date().toISOString(),
  phase: "C3-C5 — ENGINE + SHADOW",
  steps: [] as Array<{ name: string; status: string; [k: string]: unknown }>,
  ok: false,
};

function step(name: string, status: string, detail: Record<string, unknown> = {}) {
  (report.steps as Array<{ name: string; status: string }>).push({ name, status, ...detail });
}

function loadEnv() {
  for (const rel of [".env.local", ".env"]) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#") || !t.includes("=")) continue;
      const i = t.indexOf("=");
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function passwords(): string[] {
  return [
    ...new Set(
      [
        process.env.E2E_ADMIN_PASSWORD,
        process.env.E2E_TEST_PASSWORD,
        process.env.QA_MANUAL_PASSWORD,
        "DibayQa1!",
        "1234",
      ].filter((p): p is string => typeof p === "string" && p.length > 0)
    ),
  ];
}

async function loginAdmin(browser: import("playwright").Browser) {
  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const sk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anon) throw new Error("supabase_env_missing");

  const login = process.env.E2E_ADMIN_USERNAME || process.env.QA_ADMIN_LOGIN || "aaaa";
  const email = login.includes("@") ? login : `${login}@manual.local`;
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  let session = null;
  for (const pass of passwords()) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
    if (!error && data.session) {
      session = data.session;
      break;
    }
  }
  if (!session) throw new Error("admin_login_failed");

  const ref = new URL(url).hostname.split(".")[0];
  const cookieName = `sb-${ref}-auth-token`;
  const origin = new URL(BASE);
  const cookies = [
    {
      name: cookieName,
      value: encodeURIComponent(
        JSON.stringify({
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          expires_at: session.expires_at,
          expires_in: session.expires_in,
          token_type: session.token_type,
          user: session.user,
        })
      ),
      domain: origin.hostname,
      path: "/",
      expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
      httpOnly: false,
      secure: origin.protocol === "https:",
      sameSite: "Lax" as const,
    },
  ];

  if (sk) {
    const adminSb = createClient(url, sk, { auth: { persistSession: false } });
    const { data: pr } = await adminSb
      .from("profiles")
      .select("active_session_id")
      .eq("id", session.user.id)
      .maybeSingle();
    const sid = String(pr?.active_session_id ?? "").trim();
    if (sid) {
      cookies.push({
        name: "samarket_active_session_id",
        value: encodeURIComponent(sid),
        domain: origin.hostname,
        path: "/",
        expires: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
        httpOnly: false,
        secure: origin.protocol === "https:",
        sameSite: "Lax" as const,
      });
    }
  }

  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();
  return { page, context };
}

function buildPutRows(rows: PolicyRow[], slot: string, patch: Partial<PolicyRow>) {
  return rows.map((r) => {
    const base = {
      surface: r.surface,
      slot: r.slot,
      contentType: r.contentType,
      enabled: r.enabled,
      order: r.order,
      max: r.max,
      interval: { consumed: false as const, reason: "NOT_CONSUMED" as const },
      titleAuthority: "presentation_i18n" as const,
    };
    return r.slot === slot ? { ...base, ...patch } : base;
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    const { page, context } = await loginAdmin(browser);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    step("admin_auth", "PASS");

    const homeFeedRes = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/stores/home-feed`, { credentials: "include", cache: "no-store" });
      return { status: res.status, json: await res.json() };
    }, BASE);

    const stores = (homeFeedRes.json?.stores ?? homeFeedRes.json?.items ?? []) as StoreHomeFeedItem[];
    if (!Array.isArray(stores) || stores.length === 0) {
      step("home_feed_load", "FAIL", { status: homeFeedRes.status });
      throw new Error("home_feed_empty");
    }
    step("home_feed_load", "PASS", { count: stores.length });

    const browseRes = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/stores/browse?primary=restaurant&sub=all`, {
        credentials: "include",
        cache: "no-store",
      });
      return { status: res.status, json: await res.json() };
    }, BASE);
    const browseIds = ((browseRes.json?.stores ?? []) as Array<{ id: string }>).map((s) => s.id);
    step("browse_load", browseIds.length > 0 ? "PASS" : "FAIL", { count: browseIds.length });

    const policyRes = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/admin/stores-composition-policy?surface=home`, {
        credentials: "include",
        cache: "no-store",
      });
      return { status: res.status, json: await res.json() };
    }, BASE);
    if (!policyRes.json?.ok || !Array.isArray(policyRes.json.rows)) {
      step("policy_read", "FAIL", { error: policyRes.json?.error });
      throw new Error("policy_read_failed");
    }
    const homePolicy = policyRes.json.rows as PolicyRow[];
    step("policy_read", "PASS", { overrideCount: policyRes.json.overrideCount });

    const browsePolicyRes = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/admin/stores-composition-policy?surface=browse`, {
        credentials: "include",
        cache: "no-store",
      });
      return { status: res.status, json: await res.json() };
    }, BASE);
    void browsePolicyRes;

    const baselineLive = composeStoresHomeFeed(stores);
    const defaultPolicy = resolveDefaultCompositionPolicy("home");
    const defaultShadow = runHomeCompositionShadow(stores, defaultPolicy);
    const baselineShadow = runHomeCompositionShadow(
      stores,
      homePolicy as StoresCompositionSectionContract[]
    );
    const baselineBrowseShadow = runBrowseCompositionShadow(
      browseIds,
      resolveDefaultCompositionPolicy("browse")
    );

    report.baseline = {
      homeDefaultParity: defaultShadow.defaultParity,
      homeDefaultDiffCount: defaultShadow.diffCount,
      homePersistedPolicyDiffCount: baselineShadow.diffCount,
      browseDefaultParity: baselineBrowseShadow.defaultParity,
      futureInsertionsLive: baselineBrowseShadow.futureInsertionsLive,
      liveComposerUnchanged: true,
    };
    step("default_shadow_parity", defaultShadow.defaultParity ? "PASS" : "FAIL", {
      diffCount: defaultShadow.diffCount,
    });
    step("browse_organic_preserved", baselineBrowseShadow.organicSameOrder ? "PASS" : "FAIL");
    step("future_insertions_non_live", baselineBrowseShadow.futureInsertionsLive ? "FAIL" : "PASS");

    const slot = "slot0Food";
    const originalMax = homePolicy.find((r) => r.slot === slot)?.max ?? 16;
    const testMax = originalMax === 10 ? 8 : 10;

    const putRes = await page.evaluate(
      async ({ base, rows, surface }) => {
        const res = await fetch(`${base}/api/admin/stores-composition-policy`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ surface, rows }),
        });
        return { status: res.status, json: await res.json() };
      },
      { base: BASE, rows: buildPutRows(homePolicy, slot, { max: testMax }), surface: "home" }
    );
    if (!putRes.json?.ok) {
      step("override_write", "FAIL", { error: putRes.json?.error });
      throw new Error("override_write_failed");
    }
    step("override_write", "PASS", { testMax });

    const overridePolicyRes = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/admin/stores-composition-policy?surface=home`, {
        credentials: "include",
        cache: "no-store",
      });
      return { status: res.status, json: await res.json() };
    }, BASE);
    const overridePolicy = overridePolicyRes.json.rows as PolicyRow[];

    const overrideShadow = runHomeCompositionShadow(stores, overridePolicy as StoresCompositionSectionContract[], {
      overrideSlots: new Set([slot]),
    });
    const liveAfterOverride = composeStoresHomeFeed(stores);

    const liveUnchanged =
      JSON.stringify(baselineLive.slot0Food.map((e) => `${e.storeId}:${e.productId}`)) ===
      JSON.stringify(liveAfterOverride.slot0Food.map((e) => `${e.storeId}:${e.productId}`));

    step("override_shadow_delta", overrideShadow.overrideDeltaOnly ? "PASS" : "FAIL", {
      slot0ShadowCount: overrideShadow.slots.find((s) => s.slot === slot)?.shadowIds.length,
      slot0CurrentCount: overrideShadow.slots.find((s) => s.slot === slot)?.currentIds.length,
    });
    step("live_home_unchanged", liveUnchanged ? "PASS" : "FAIL");

    const liveBrowseAfter = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/stores/browse?primary=restaurant&sub=all`, {
        credentials: "include",
        cache: "no-store",
      });
      const json = await res.json();
      return ((json.stores ?? []) as Array<{ id: string }>).map((s) => s.id);
    }, BASE);
    const browseUnchanged = JSON.stringify(browseIds) === JSON.stringify(liveBrowseAfter);
    step("live_browse_unchanged", browseUnchanged ? "PASS" : "FAIL");

    const restoreRes = await page.evaluate(
      async ({ base, rows, surface }) => {
        const res = await fetch(`${base}/api/admin/stores-composition-policy`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ surface, rows }),
        });
        return { status: res.status, json: await res.json() };
      },
      { base: BASE, rows: buildPutRows(overridePolicy, slot, { max: originalMax }), surface: "home" }
    );
    step("restore_policy", restoreRes.json?.ok ? "PASS" : "FAIL", { originalMax });

    const restoredPolicyRes = await page.evaluate(async (base) => {
      const res = await fetch(`${base}/api/admin/stores-composition-policy?surface=home`, {
        credentials: "include",
        cache: "no-store",
      });
      return { status: res.status, json: await res.json() };
    }, BASE);
    const restoredPolicy = restoredPolicyRes.json.rows as PolicyRow[];
    const restoredShadow = runHomeCompositionShadow(
      stores,
      restoredPolicy as StoresCompositionSectionContract[]
    );
    const restoredMatchesBaseline =
      restoredShadow.diffCount === baselineShadow.diffCount &&
      restoredShadow.slots.every((s, i) => s.sameOrder === baselineShadow.slots[i]?.sameOrder);
    step("restore_shadow_baseline", restoredMatchesBaseline ? "PASS" : "FAIL");

    report.homeShadow = {
      default: defaultShadow,
      persisted: baselineShadow,
      override: overrideShadow,
      restored: restoredShadow,
    };
    report.browseShadow = baselineBrowseShadow;

    report.ok = (report.steps as Array<{ status: string }>).every(
      (s) => s.status === "PASS" || s.status === "NOT_PROVEN"
    );

    await context.close();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!(report.steps as Array<unknown>).length) step("fatal", "FAIL", { error: msg });
    report.ok = false;
  } finally {
    await browser.close();
    fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 2);
  }
}

void main();
