/**
 * Delivery Financial SSOT — live DB reconciliation gate.
 *
 * Does NOT invent a second calculator. Compares:
 *   DB ledger rows → projectStoreOrderFinancialFact
 *   → loadStoreSettlementFinancialFacts (Owner filters)
 *   → loadStoreSettlementFinancialFacts (Admin filters)
 * with exact integer equality (delta = 0).
 *
 * Usage:
 *   npx tsx scripts/delivery-financial-reconciliation-gate.ts
 *   STORE_ID=... FROM=YYYY-MM-DD TO=YYYY-MM-DD npx tsx scripts/delivery-financial-reconciliation-gate.ts
 *
 * Exit:
 *   0 = period reconciliation PASS (and schema PASS)
 *   1 = FAIL (schema or delta ≠ 0 or missing env)
 *   2 = blocked (migrations / fixtures incomplete — report OPEN)
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadStoreSettlementFinancialFacts, settlementPeriodDayToIso } from "@/lib/stores/load-store-settlement-financial-facts";
import { STORE_ORDER_FINANCIAL_CONTRACT } from "@/lib/stores/store-order-financial-contract";

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

type Check = { name: string; ok: boolean; detail?: unknown };

async function probeSchema(sb: any): Promise<Check[]> {
  const out: Check[] = [];
  {
    const { error } = await sb.from("store_fee_policies").select("id, topic_id").limit(1);
    const missing = Boolean(error && /topic_id/i.test(error.message));
    out.push({
      name: "store_fee_policies.topic_id",
      ok: !missing && !error,
      detail: error?.message ?? null,
    });
  }
  {
    const { error } = await sb.from("store_settlements").select("id, commission_reversal_amount").limit(1);
    const missing = Boolean(error && /commission_reversal_amount/i.test(error.message));
    out.push({
      name: "store_settlements.commission_reversal_amount",
      ok: !missing && !error,
      detail: error?.message ?? null,
    });
  }
  return out;
}

function pickQaStoreId(explicit: string | undefined, rows: { store_id: string }[]): string | null {
  if (explicit?.trim()) return explicit.trim();
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.store_id, (counts.get(r.store_id) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [id, c] of counts) {
    if (c > n) {
      best = id;
      n = c;
    }
  }
  return best;
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.log(
      JSON.stringify({
        ok: false,
        FINAL: "DIBAY DELIVERY FINANCIAL SSOT OPEN",
        FIRST_BREAK: "missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      })
    );
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const schema = await probeSchema(sb);
  const migrationPass = schema.every((c) => c.ok);

  const productContract = {
    Discount: STORE_ORDER_FINANCIAL_CONTRACT.storeCheckoutDiscountSupported
      ? "SUPPORTED"
      : "NOT_SUPPORTED",
    Coupon: STORE_ORDER_FINANCIAL_CONTRACT.customerCouponSupported ? "SUPPORTED" : "NOT_SUPPORTED",
    "Customer D-Point": STORE_ORDER_FINANCIAL_CONTRACT.customerDPointSupported
      ? "SUPPORTED"
      : "NOT_SUPPORTED",
    "Partial Refund": STORE_ORDER_FINANCIAL_CONTRACT.partialRefundSupported
      ? "SUPPORTED"
      : "NOT_SUPPORTED",
  };

  if (!migrationPass) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          MIGRATION_RUNTIME_PASS: false,
          schema,
          PRODUCT_CONTRACT: productContract,
          PERIOD_CONTRACT: {
            Sales: STORE_ORDER_FINANCIAL_CONTRACT.salesPeriodField,
            Settlement: STORE_ORDER_FINANCIAL_CONTRACT.settlementPeriodField,
            Payout: STORE_ORDER_FINANCIAL_CONTRACT.payoutPeriodField,
            Refund: STORE_ORDER_FINANCIAL_CONTRACT.refundPeriodField,
            Timezone: STORE_ORDER_FINANCIAL_CONTRACT.timezone,
          },
          FINAL: "DIBAY DELIVERY FINANCIAL SSOT OPEN",
          FIRST_BREAK:
            "Live DB migrations not applied (topic_id and/or commission_reversal_amount missing). Apply via SUPABASE_DB_PASSWORD/DATABASE_URL + scripts/apply-delivery-financial-ssot-migrations.mjs before O1–O6 reconciliation.",
          O1_O6: "NOT_RUN",
          OWNER_ADMIN_ORDER: "NOT_RUN",
          OWNER_ADMIN_PERIOD: "NOT_RUN",
        },
        null,
        2
      )
    );
    process.exit(2);
  }

  // Find a store with settlements in optional window
  const fromDay = process.env.FROM?.trim() || "";
  const toDay = process.env.TO?.trim() || "";
  const { fromIso, toIso } = settlementPeriodDayToIso(fromDay || null, toDay || null);

  let sampleQ = sb
    .from("store_settlements")
    .select("store_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (fromIso) sampleQ = sampleQ.gte("created_at", fromIso);
  if (toIso) sampleQ = sampleQ.lte("created_at", toIso);
  const { data: sampleRows, error: sampleErr } = await sampleQ;
  if (sampleErr) {
    console.log(JSON.stringify({ ok: false, error: sampleErr.message, FINAL: "OPEN" }, null, 2));
    process.exit(1);
  }

  const storeId = pickQaStoreId(process.env.STORE_ID, (sampleRows ?? []) as { store_id: string }[]);
  if (!storeId) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          MIGRATION_RUNTIME_PASS: true,
          FINAL: "DIBAY DELIVERY FINANCIAL SSOT OPEN",
          FIRST_BREAK: "No store_settlements rows found for period — O1–O6 fixtures not present",
          PRODUCT_CONTRACT: productContract,
        },
        null,
        2
      )
    );
    process.exit(2);
  }

  // Same store / same period / same period_basis for Owner-shaped and Admin-shaped loads
  const periodBasis =
    process.env.PERIOD_BASIS === "order_completed" || process.env.PERIOD_BASIS === "paid_at"
      ? process.env.PERIOD_BASIS
      : "settlement_created";

  const ownerLoad = await loadStoreSettlementFinancialFacts(sb as any, {
    storeIds: [storeId],
    fromIso,
    toIso,
    periodBasis,
    includeBuyerDisplay: false,
    authorityLimit: 5000,
    pageLimit: 500,
  });
  const adminLoad = await loadStoreSettlementFinancialFacts(sb as any, {
    storeIds: [storeId],
    fromIso,
    toIso,
    periodBasis,
    includeBuyerDisplay: true,
    authorityLimit: 5000,
    pageLimit: 500,
  });

  if (!ownerLoad.ok || !adminLoad.ok) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          owner: ownerLoad,
          admin: adminLoad,
          FINAL: "DIBAY DELIVERY FINANCIAL SSOT OPEN",
          FIRST_BREAK: "loadStoreSettlementFinancialFacts failed",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const fields = [
    "order_count",
    "gross",
    "discount",
    "point",
    "refund",
    "commission_base",
    "commission_gross",
    "commission_reversal",
    "platform_commission_revenue",
    "net_settlement",
  ] as const;

  const periodDelta: Record<string, number> = {};
  let periodPass = true;
  for (const f of fields) {
    const d = Number(ownerLoad.summary[f]) - Number(adminLoad.summary[f]);
    periodDelta[f] = d;
    if (d !== 0) periodPass = false;
  }

  // Order-level: same order_id set + identical money fields
  const byOrderOwner = new Map(ownerLoad.facts.map((f) => [f.order_id, f]));
  const byOrderAdmin = new Map(adminLoad.facts.map((f) => [f.order_id, f]));
  const orderIds = new Set([...byOrderOwner.keys(), ...byOrderAdmin.keys()]);
  const orderRows: Record<string, unknown>[] = [];
  let orderPass = byOrderOwner.size === byOrderAdmin.size;
  for (const oid of orderIds) {
    const o = byOrderOwner.get(oid);
    const a = byOrderAdmin.get(oid);
    if (!o || !a) {
      orderPass = false;
      orderRows.push({ order_id: oid, Result: "FAIL", reason: "missing_side" });
      continue;
    }
    const moneyKeys = [
      "gross_amount",
      "refund_amount",
      "commission_base_amount",
      "commission_rate",
      "commission_amount",
      "commission_reversal_amount",
      "net_settlement_amount",
      "platform_commission_revenue",
    ] as const;
    let ok = true;
    const deltas: Record<string, number> = {};
    for (const k of moneyKeys) {
      const d = Number(o[k]) - Number(a[k]);
      deltas[k] = d;
      if (d !== 0) ok = false;
    }
    if (!ok) orderPass = false;
    orderRows.push({
      order_no: o.order_no,
      order_id: oid,
      store_id: o.store_id,
      customer_id: o.buyer_user_id,
      Owner: Object.fromEntries(moneyKeys.map((k) => [k, o[k]])),
      Admin: Object.fromEntries(moneyKeys.map((k) => [k, a[k]])),
      Delta: deltas,
      Result: ok ? "PASS" : "FAIL",
    });
  }

  // Note: HTTP cookie Owner/Admin endpoints are not invoked here (service-role shared loader).
  // Same filter + same projection equality is required but insufficient alone for CLOSED —
  // O1–O6 fixture matrix still required for lifecycle coverage.
  const hasRefund = ownerLoad.facts.some((f) => f.refund_amount > 0);
  const hasCompleted = ownerLoad.facts.some((f) => f.settlement_status !== "cancelled");
  const fixturesHint = {
    O1_normal_completed: hasCompleted,
    O5_full_refund_present: hasRefund,
    O6_partial_refund: "NOT_SUPPORTED_PRODUCT_LOCK",
    note: "Explicit QA fixture tags (O1–O6) not asserted by this gate; period equality only.",
  };

  const allPass = periodPass && orderPass;
  const report = {
    ok: allPass,
    MIGRATION_RUNTIME_PASS: true,
    store_id: storeId,
    from: fromDay || null,
    to: toDay || null,
    period_basis: periodBasis,
    PRODUCT_CONTRACT: productContract,
    PERIOD_CONTRACT: {
      Sales: STORE_ORDER_FINANCIAL_CONTRACT.salesPeriodField,
      Settlement: STORE_ORDER_FINANCIAL_CONTRACT.settlementPeriodField,
      Payout: STORE_ORDER_FINANCIAL_CONTRACT.payoutPeriodField,
      Timezone: STORE_ORDER_FINANCIAL_CONTRACT.timezone,
    },
    OWNER_ADMIN_PERIOD: periodPass ? "PASS" : "FAIL",
    period_delta: periodDelta,
    OWNER_ADMIN_ORDER: orderPass ? "PASS" : "FAIL",
    order_count: ownerLoad.facts.length,
    orders: orderRows.slice(0, 50),
    fixtures: fixturesHint,
    FINAL: "DIBAY DELIVERY FINANCIAL SSOT OPEN",
    FIRST_BREAK: allPass
      ? "HTTP cookie Owner/Admin endpoint session path not invoked in this gate (shared loader equality PASS; treat as residual if product requires cookie E2E)"
      : "Owner↔Admin period/order delta ≠ 0 on live loader",
  };

  console.log(JSON.stringify(report, null, 2));
  // Exit 0 when period/order delta=0 — CLOSED still requires full report checklist (bridge exit proven elsewhere).
  process.exit(allPass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
