#!/usr/bin/env node
/**
 * READ-ONLY historical gift revenue recognition impact report (categories A–E).
 * Does NOT mutate financial data.
 *
 * node scripts/qa/gift-revenue-historical-impact-report.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve(process.cwd(), ".tmp-gift-revenue-historical-impact.json");

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

loadEnv();

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  const [{ data: redemptions }, { data: orders }, { data: ledger }, { data: conversions }] = await Promise.all([
    sb.from("gift_certificate_redemptions").select("id, order_id, store_id, merchant_net_amount, platform_fee_amount, reversed").limit(5000),
    sb.from("store_orders").select("id, order_status, gift_redemption_amount").gt("gift_redemption_amount", 0).limit(5000),
    sb.from("gift_certificate_revenue_ledger").select("redemption_id, entry_type").in("entry_type", ["REVENUE_AVAILABLE", "CONVERSION_APPROVE"]).limit(10000),
    sb.from("gift_certificate_conversion_requests").select("id, store_id, amount, status").eq("status", "APPROVED").limit(5000),
  ]);

  const orderStatus = new Map((orders ?? []).map((o) => [String(o.id), String(o.order_status ?? "")]));
  const recognized = new Set(
    (ledger ?? [])
      .filter((l) => l.entry_type === "REVENUE_AVAILABLE")
      .map((l) => String(l.redemption_id))
  );
  const convertedStores = new Set((conversions ?? []).map((c) => String(c.store_id)));

  const A = [];
  const B = [];
  const C = [];
  const D = [];
  for (const r of redemptions ?? []) {
    if (r.reversed) {
      D.push(r);
      continue;
    }
    const st = orderStatus.get(String(r.order_id)) ?? "unknown";
    const hasAvail = recognized.has(String(r.id));
    if (st !== "completed" && hasAvail) {
      const row = { ...r, order_status: st };
      if (convertedStores.has(String(r.store_id))) B.push(row);
      else A.push(row);
    } else if (st === "completed" && hasAvail) {
      C.push({ ...r, order_status: st });
    }
  }

  const report = {
    title: "GIFT REVENUE RECOGNITION HISTORICAL IMPACT (READ-ONLY)",
    categories: {
      A_pending_available_not_converted: { count: A.length, sample: A.slice(0, 10) },
      B_pending_available_already_converted_store: { count: B.length, sample: B.slice(0, 10) },
      C_completed_available: { count: C.length, sample: C.slice(0, 10) },
      D_reversed: { count: D.length },
      E_recovery_obligation: "NOT_QUERIED",
    },
    totals: {
      pendingAvailableMerchantNet: [...A, ...B].reduce((s, r) => s + Math.trunc(Number(r.merchant_net_amount) || 0), 0),
      pendingAvailablePlatformFee: [...A, ...B].reduce((s, r) => s + Math.trunc(Number(r.platform_fee_amount) || 0), 0),
    },
    financialMutationInThisFix: "NONE",
    productionMigrationApplied: "NOT_PROVEN",
  };

  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
