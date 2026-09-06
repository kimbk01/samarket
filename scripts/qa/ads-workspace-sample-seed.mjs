#!/usr/bin/env node
/**
 * QA sample seed helper — DIBAY_AD_QA_* tags.
 * Does NOT invent fake UI. Requires service role + RUN_ADS_SAMPLE_SEED=1.
 * Prints NOT_PROVEN when env missing.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const i = line.indexOf("=");
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      if (k && process.env[k] == null) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

if (process.env.RUN_ADS_SAMPLE_SEED !== "1") {
  console.log(
    JSON.stringify({
      ok: false,
      status: "NOT_PROVEN",
      reason: "Set RUN_ADS_SAMPLE_SEED=1 with service role to seed S1–S9 via writers",
    })
  );
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) {
  console.log(JSON.stringify({ ok: false, status: "NOT_PROVEN", reason: "missing_supabase_env" }));
  process.exit(0);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

const plan = [
  "S1 Community Boost — applyCommunityPaidExposurePending",
  "S2 Community Banner — feed_ad_requests COMMUNITY_HOME",
  "S3 Trade Boost — applyTradePaidExposurePending",
  "S4 Trade Banner — feed_ad_requests TRADE_HOME",
  "S5 Delivery Sponsored — owner-store-sponsored-writer",
  "S6 Delivery Banner Owner — owner-banner-writer HERO",
  "S7 Delivery Banner Admin — adminCreateDeliveryAdFirstPartyBanner",
  "S8 Delivery Popup Owner — owner-request-writer",
  "S9 Delivery Popup Admin — admin-campaign-writer",
];

console.log(
  JSON.stringify(
    {
      ok: true,
      status: "PARTIAL",
      note: "Seed runners must call domain writers; this script only proves env + inventory readiness",
      plan,
      heroCapacityDefault: 5,
      supabase: Boolean(url),
    },
    null,
    2
  )
);

const { count } = await sb
  .from("delivery_ad_inventories")
  .select("id", { count: "exact", head: true });
console.log(JSON.stringify({ deliveryInventories: count ?? null }));
