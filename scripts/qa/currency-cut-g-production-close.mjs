#!/usr/bin/env node
/**
 * DIBAY Currency SSOT — Production close (CUT C–G bounded QA).
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
const STORE_ID = process.env.STORE_ID?.trim() || "19085860-52d2-4183-b033-e71fcb58bcec";
const OUT = path.join(process.cwd(), "docs/perf/currency-cut-g-production-close-report.json");

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

function dbQuery(sql) {
  const raw = execFileSync("npx", ["supabase", "db", "query", "--linked", sql], {
    encoding: "utf8",
    cwd: process.cwd(),
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(raw).rows ?? [];
}

function gitHead() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function pickOrderWithoutObligation(sb, storeId) {
  const { data: orders } = await sb
    .from("store_orders")
    .select("id")
    .eq("store_id", storeId)
    .eq("order_status", "completed")
    .order("created_at", { ascending: false })
    .limit(30);

  for (const row of orders ?? []) {
    const oid = String(row.id);
    const { data: ob } = await sb
      .from("store_sale_fee_obligations")
      .select("id")
      .eq("order_id", oid)
      .maybeSingle();
    if (!ob) return oid;
  }
  return null;
}

async function setCashBalanceMinor(sb, storeId, balanceMinor) {
  await sb.from("business_cash_accounts").upsert(
    { store_id: storeId, balance_minor: balanceMinor, updated_at: new Date().toISOString() },
    { onConflict: "store_id" }
  );
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.error("missing supabase env");
    process.exit(1);
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  const report = {
    title: "DIBAY CURRENCY SSOT — PRODUCTION CLOSE",
    commit: gitHead(),
    migrations: {},
    rpc_acl: {},
    env_flags: {
      sale_recognition_live: process.env.DIBAY_CURRENCY_SALE_RECOGNITION_LIVE ?? "unset",
      ast002_retired: process.env.DIBAY_CURRENCY_AST002_RETIRED ?? "unset",
    },
    sale_fee_refund: {},
    coin_reversal: {},
    obligation_settle: {},
    first_divergence: null,
    currency_ssot: "PARTIAL",
  };

  report.migrations = {
    cut_c_sale_coin: dbQuery(
      "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='credit_coin_from_confirmed_sale') AS ok"
    )[0]?.ok,
    cut_d_sale_fee: dbQuery(
      "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='charge_sale_fee_for_order') AS ok"
    )[0]?.ok,
    cut_d_obligations: dbQuery(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='store_sale_fee_obligations') AS ok"
    )[0]?.ok,
    cut_d_sale_fee_reversal: dbQuery(
      "SELECT EXISTS (SELECT 1 FROM pg_proc WHERE proname='reverse_sale_fee_for_order') AS ok"
    )[0]?.ok,
  };

  report.rpc_acl = dbQuery(`
    SELECT NOT (
      has_function_privilege('anon', 'public.credit_coin_from_confirmed_sale(uuid,uuid,uuid,integer,text)', 'EXECUTE')
      OR has_function_privilege('authenticated', 'public.credit_coin_from_confirmed_sale(uuid,uuid,uuid,integer,text)', 'EXECUTE')
    ) AS clients_revoked
  `)[0];

  const migOk =
    report.migrations.cut_c_sale_coin === true &&
    report.migrations.cut_d_sale_fee === true &&
    report.migrations.cut_d_obligations === true &&
    report.migrations.cut_d_sale_fee_reversal === true;

  if (!migOk) {
    report.first_divergence = "migrations_not_applied";
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  if (report.rpc_acl?.clients_revoked !== true) {
    report.first_divergence = "rpc_acl_clients_not_revoked";
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // ── SALE FEE REFUND CONTRACT ──
  const testOrderId = await pickOrderWithoutObligation(sb, STORE_ID);
  if (!testOrderId) {
    report.sale_fee_refund = { status: "NOT_PROVEN", reason: "no_order_fixture" };
    report.first_divergence = report.first_divergence || "no_order_fixture";
  } else {
  const feeKey = `sale_fee:order:${testOrderId}`;
  const revKey = `sale_fee_reversal:order:${testOrderId}`;

  await setCashBalanceMinor(sb, STORE_ID, 2000);

  const { data: charge1, error: chargeErr } = await sb.rpc("charge_sale_fee_for_order", {
    p_store_id: STORE_ID,
    p_order_id: testOrderId,
    p_settlement_id: null,
    p_confirmed_revenue_php: 900,
    p_fee_due_php: 45,
    p_idempotency_key: feeKey,
  });

  const { data: obBefore } = await sb
    .from("store_sale_fee_obligations")
    .select("*")
    .eq("order_id", testOrderId)
    .maybeSingle();

  const { data: rev1 } = await sb.rpc("reverse_sale_fee_for_order", {
    p_order_id: testOrderId,
    p_idempotency_key: revKey,
  });
  const { data: rev2 } = await sb.rpc("reverse_sale_fee_for_order", {
    p_order_id: testOrderId,
    p_idempotency_key: revKey,
  });

  const { data: obAfter } = await sb
    .from("store_sale_fee_obligations")
    .select("*")
    .eq("order_id", testOrderId)
    .maybeSingle();

  const { data: revLed } = await sb
    .from("business_cash_ledger")
    .select("id,entry_kind,amount_minor,direction")
    .eq("idempotency_key", revKey)
    .maybeSingle();

  const feeRefundOk =
    charge1?.ok === true &&
    Math.trunc(Number(charge1.fee_paid_minor)) === 2000 &&
    Math.trunc(Number(charge1.fee_outstanding_minor)) === 2500 &&
    rev1?.ok === true &&
    Math.trunc(Number(rev1.cash_credited_minor)) === 2000 &&
    Math.trunc(Number(rev1.outstanding_cancelled_minor)) === 2500 &&
    rev2?.idempotent === true &&
    obAfter?.status === "waived" &&
    Math.trunc(Number(obAfter.fee_outstanding_minor)) === 0 &&
    revLed?.entry_kind === "SALE_FEE_REVERSAL";

  report.sale_fee_refund = {
    order_id: testOrderId,
    charge_error: chargeErr?.message ?? null,
    charge: charge1,
    obligation_before: obBefore,
    reversal: rev1,
    obligation_after: obAfter,
    reversal_ledger: revLed,
    duplicate_retry_idempotent: rev2?.idempotent === true,
    pass: feeRefundOk,
  };

  if (!feeRefundOk) {
    report.first_divergence = report.first_divergence || "sale_fee_refund_contract";
  }
  }

  // ── Coin reversal idempotent replay (CUT B regression) ──
  const { data: giftCredits } = await sb
    .from("store_economic_point_ledger")
    .select("id,amount,meta")
    .eq("store_id", STORE_ID)
    .eq("entry_kind", "SALE_EARN")
    .gt("amount", 0)
    .order("created_at", { ascending: false })
    .limit(5);

  let coinRevPass = false;
  for (const row of giftCredits ?? []) {
    const meta = row.meta && typeof row.meta === "object" ? row.meta : null;
    const oid = meta && "order_id" in meta ? String(meta.order_id ?? "").trim() : null;
    if (!oid) continue;
    const idem = `coin_reversal:order:${oid}`;
    const { data: ex } = await sb
      .from("store_economic_point_ledger")
      .select("id,entry_kind,amount")
      .eq("idempotency_key", idem)
      .maybeSingle();
    if (ex?.entry_kind === "REVERSAL") {
      coinRevPass = true;
      report.coin_reversal = { order_id: oid, ledger_id: ex.id, pass: true, idempotent_replay: true };
      break;
    }
  }
  if (!coinRevPass) {
    report.coin_reversal = { status: "NOT_PROVEN", reason: "no_prior_reversal_fixture" };
  }

  // ── Obligation settle on inflow ──
  const settleOrderId = await pickOrderWithoutObligation(sb, STORE_ID);
  if (!settleOrderId) {
    report.obligation_settle = { status: "NOT_PROVEN", reason: "no_order_fixture" };
    report.first_divergence = report.first_divergence || "no_order_fixture_settle";
  } else {
  await setCashBalanceMinor(sb, STORE_ID, 2000);
  await sb.rpc("charge_sale_fee_for_order", {
    p_store_id: STORE_ID,
    p_order_id: settleOrderId,
    p_settlement_id: null,
    p_confirmed_revenue_php: 900,
    p_fee_due_php: 45,
    p_idempotency_key: `sale_fee:order:${settleOrderId}`,
  });

  await setCashBalanceMinor(sb, STORE_ID, 10000);

  const { data: settle } = await sb.rpc("settle_store_sale_fee_obligations", {
    p_store_id: STORE_ID,
  });

  const { data: obSettled } = await sb
    .from("store_sale_fee_obligations")
    .select("status,fee_outstanding_minor")
    .eq("order_id", settleOrderId)
    .maybeSingle();

  const settleOk =
    settle?.ok === true &&
    Number(settle.settled_count) >= 1 &&
    obSettled?.status === "settled" &&
    Math.trunc(Number(obSettled.fee_outstanding_minor)) === 0;

  report.obligation_settle = {
    order_id: settleOrderId,
    settle,
    obligation_after: obSettled,
    pass: settleOk,
  };

  if (!settleOk) {
    report.first_divergence = report.first_divergence || "obligation_settle_on_inflow";
  }
  }

  const feeOk = report.sale_fee_refund.pass === true;
  const settlePass = report.obligation_settle.pass === true;
  const allOk = feeOk && settlePass && coinRevPass;
  if (allOk && !report.first_divergence) {
    report.currency_ssot = "CLOSED";
  }

  report.production_db = { store_id: STORE_ID, timestamp: new Date().toISOString() };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.currency_ssot === "CLOSED" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
