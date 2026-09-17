#!/usr/bin/env node
/**
 * Read-only census: live PARTIALLY_REDEEMED gift_certificate_instances.
 * No mutate / delete / backfill. Historical compat evidence only.
 *
 *   node --env-file=.env.local scripts/qa/gift-historical-partial-census.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("MISSING_SUPABASE_ENV");
  process.exit(2);
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const OUT_DIR = resolve(process.cwd(), ".tmp/gift-one-time-full-consumption");
mkdirSync(OUT_DIR, { recursive: true });

const { count, error: countErr } = await sb
  .from("gift_certificate_instances")
  .select("id", { count: "exact", head: true })
  .eq("status", "PARTIALLY_REDEEMED");

if (countErr) {
  console.error(JSON.stringify({ ok: false, error: countErr.message }, null, 2));
  process.exit(1);
}

const { data: sample, error: sampleErr } = await sb
  .from("gift_certificate_instances")
  .select(
    "id, public_gift_number, face_value, remaining_balance, purchase_price, status, updated_at, current_owner_user_id"
  )
  .eq("status", "PARTIALLY_REDEEMED")
  .order("updated_at", { ascending: false })
  .limit(20);

if (sampleErr) {
  console.error(JSON.stringify({ ok: false, error: sampleErr.message }, null, 2));
  process.exit(1);
}

const report = {
  ok: true,
  censusAt: new Date().toISOString(),
  status: "PARTIALLY_REDEEMED",
  liveRowCount: count ?? 0,
  sampleLimit: 20,
  sample: (sample ?? []).map((r) => ({
    id: r.id,
    publicGiftNumber: r.public_gift_number,
    faceValue: r.face_value,
    remainingBalance: r.remaining_balance,
    purchasePrice: r.purchase_price,
    updatedAt: r.updated_at,
    // owner id redacted length only
    ownerIdLen: String(r.current_owner_user_id ?? "").length,
  })),
  policy: {
    autoDelete: false,
    autoMigrateAmounts: false,
    newPartialCreation: "FORBIDDEN",
    newRedeemAuthority: "ACTIVE → ONE REDEMPTION → FULLY_REDEEMED",
  },
};

const outPath = resolve(OUT_DIR, "HISTORICAL_PARTIAL_CENSUS.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: true, liveRowCount: report.liveRowCount, outPath }, null, 2));
