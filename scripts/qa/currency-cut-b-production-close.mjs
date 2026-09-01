#!/usr/bin/env node
/**
 * DIBAY Currency CUT B — Production integrity close (bounded QA store).
 * Proves: Coin REVERSAL from actual ledger credits, idempotent retry,
 * gift reverse skips Store Cash when Coin credited, conversion RPC frozen.
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";

const STORE_ID = process.env.STORE_ID?.trim() || "19085860-52d2-4183-b033-e71fcb58bcec";
const ORIGIN = process.env.CURRENCY_QA_ORIGIN?.trim() || "https://samarket.vercel.app";
const OUT = path.join(process.cwd(), "docs/perf/currency-cut-b-production-close-report.json");

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

async function coinBal(sb, storeId) {
  const { data } = await sb
    .from("store_economic_point_accounts")
    .select("balance")
    .eq("store_id", storeId)
    .maybeSingle();
  return Math.trunc(Number(data?.balance) || 0);
}

async function countStoreCashLedgerSince(sb, storeId, sinceIso) {
  const { count } = await sb
    .from("store_cash_ledger")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .gte("created_at", sinceIso)
    .in("source_type", ["GIFT_REDEMPTION_REVERSAL", "GIFT_REVENUE_CONVERSION"]);
  return count ?? 0;
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
    title: "DIBAY CURRENCY — CUT B PRODUCTION FINAL",
    commit: gitHead(),
    push: process.env.CUT_B_PUSH_SHA?.trim() || gitHead(),
    migration: {},
    production_db: {},
    sale_refund: {},
    gift_refund: {},
    gift_conversion_freeze: {},
    first_divergence: null,
    cut_b: "PARTIAL",
  };

  report.migration = {
    reverse_rpc: dbQuery(
      "SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='reverse_coin_credits_for_order') THEN 'SQL_APPLIED' ELSE 'MISSING' END AS s"
    )[0]?.s,
    conversion_frozen: dbQuery(
      `SELECT pg_get_functiondef(p.oid) LIKE '%gift_store_cash_conversion_frozen%' AS frozen
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname='public' AND p.proname='gift_certificate_conversion_request' LIMIT 1`
    )[0],
  };

  if (report.migration.reverse_rpc !== "SQL_APPLIED") {
    report.first_divergence = "reverse_coin_credits_for_order missing on Production DB";
    report.cut_b = "BLOCKED";
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  // ── SALE: find order with existing SALE_EARN credit ──
  const { data: saleCredits } = await sb
    .from("store_economic_point_ledger")
    .select("id,amount,meta,related_id,related_type")
    .eq("store_id", STORE_ID)
    .eq("entry_kind", "SALE_EARN")
    .gt("amount", 0)
    .order("created_at", { ascending: false })
    .limit(20);

  let saleOrderId = null;
  let saleCreditAmount = 0;
  let saleCreditLedgerId = null;

  for (const row of saleCredits ?? []) {
    const meta = row.meta as { order_id?: string } | null;
    let oid = meta?.order_id?.trim() || null;
    if (!oid && row.related_type === "store_settlement" && row.related_id) {
      const { data: st } = await sb
        .from("store_settlements")
        .select("order_id")
        .eq("id", row.related_id)
        .maybeSingle();
      oid = st?.order_id ? String(st.order_id) : null;
    }
    if (!oid) continue;
    const idem = `coin_reversal:order:${oid}`;
    const { data: existingRev } = await sb
      .from("store_economic_point_ledger")
      .select("id")
      .eq("idempotency_key", idem)
      .maybeSingle();
    if (existingRev) continue;
    saleOrderId = oid;
    saleCreditAmount = Math.trunc(Number(row.amount) || 0);
    saleCreditLedgerId = row.id;
    break;
  }

  if (!saleOrderId) {
    // Bootstrap: credit from settlement then reverse
    const { data: st } = await sb
      .from("store_settlements")
      .select("id,order_id,net_settlement_amount")
      .eq("store_id", STORE_ID)
      .gt("net_settlement_amount", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (st) {
      const amt = Math.trunc(Number(st.net_settlement_amount) || 0);
      const idem = `settlement_coin:${st.id}`;
      await sb.rpc("credit_coin_from_settlement", {
        p_store_id: STORE_ID,
        p_settlement_id: st.id,
        p_order_id: st.order_id,
        p_amount: amt,
        p_idempotency_key: idem,
      });
      const { data: led } = await sb
        .from("store_economic_point_ledger")
        .select("id,amount")
        .eq("idempotency_key", idem)
        .maybeSingle();
      saleOrderId = String(st.order_id);
      saleCreditAmount = Math.trunc(Number(led?.amount) || amt);
      saleCreditLedgerId = led?.id ?? null;
    }
  }

  if (saleOrderId && saleCreditAmount > 0) {
    const idem = `coin_reversal:order:${saleOrderId}`;
    const balBefore = await coinBal(sb, STORE_ID);
    const { data: r1, error: e1 } = await sb.rpc("reverse_coin_credits_for_order", {
      p_order_id: saleOrderId,
      p_idempotency_key: idem,
      p_reason: "cut_b_sale_refund_e2e",
    });
    const balAfter = await coinBal(sb, STORE_ID);
    const { data: revLed } = await sb
      .from("store_economic_point_ledger")
      .select("id,entry_kind,amount")
      .eq("idempotency_key", idem)
      .maybeSingle();
    const { data: r2 } = await sb.rpc("reverse_coin_credits_for_order", {
      p_order_id: saleOrderId,
      p_idempotency_key: idem,
      p_reason: "cut_b_sale_refund_e2e_retry",
    });
    const balAfterRetry = await coinBal(sb, STORE_ID);

    const expectedAfter = balBefore - saleCreditAmount;
    const restored =
      revLed?.entry_kind === "REVERSAL" &&
      Math.trunc(Number(revLed.amount)) === -saleCreditAmount &&
      balAfter === expectedAfter &&
      balAfterRetry === balAfter;

    report.sale_refund = {
      order_id: saleOrderId,
      original_coin_credit: { ledger_id: saleCreditLedgerId, amount: saleCreditAmount },
      reversal: {
        ledger_id: revLed?.id ?? null,
        amount: revLed?.amount ?? null,
        rpc_ok: !e1 && r1?.ok === true,
        reversed_amount: r1?.reversed_amount ?? null,
      },
      balance_before: balBefore,
      balance_after: balAfter,
      balance_restored: restored,
      duplicate_retry: {
        idempotent: r2?.idempotent === true,
        balance_unchanged: balAfterRetry === balAfter,
        pass: r2?.idempotent === true && balAfterRetry === balAfter,
      },
    };

    if (!restored || !report.sale_refund.duplicate_retry.pass) {
      report.first_divergence = report.first_divergence || "sale_refund_reversal";
      report.cut_b = "PARTIAL";
    }
  } else {
    report.sale_refund = { status: "NOT_PROVEN", reason: "no_sale_credit_fixture" };
    report.first_divergence = report.first_divergence || "no_sale_credit_fixture";
  }

  // ── GIFT: redemption with Coin credit — reverse via RPC, no new Store Cash ──
  const sinceIso = new Date().toISOString();
  const { data: giftCredits } = await sb
    .from("store_economic_point_ledger")
    .select("id,amount,related_id")
    .eq("store_id", STORE_ID)
    .eq("entry_kind", "GIFT_REDEMPTION_EARN")
    .gt("amount", 0)
    .order("created_at", { ascending: false })
    .limit(10);

  let giftOrderId = null;
  let giftRedemptionId = null;
  let giftCreditAmount = 0;

  for (const gc of giftCredits ?? []) {
    const rid = String(gc.related_id ?? "").trim();
    if (!rid) continue;
    const { data: red } = await sb
      .from("gift_certificate_redemptions")
      .select("id,order_id,reversed")
      .eq("id", rid)
      .maybeSingle();
    if (!red?.order_id || red.reversed) continue;
    const oid = String(red.order_id);
    const revIdem = `coin_reversal:order:${oid}`;
    const { data: ex } = await sb
      .from("store_economic_point_ledger")
      .select("id")
      .eq("idempotency_key", revIdem)
      .maybeSingle();
    if (ex) continue;
    giftOrderId = oid;
    giftRedemptionId = rid;
    giftCreditAmount = Math.trunc(Number(gc.amount) || 0);
    break;
  }

  if (!giftOrderId) {
    const { data: red } = await sb
      .from("gift_certificate_redemptions")
      .select("id,order_id,merchant_net_amount")
      .eq("store_id", STORE_ID)
      .eq("reversed", false)
      .gt("merchant_net_amount", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (red) {
      const kid = `gift_coin:${red.id}`;
      await sb.rpc("credit_coin_from_gift_revenue", {
        p_store_id: STORE_ID,
        p_redemption_id: red.id,
        p_amount: Math.trunc(Number(red.merchant_net_amount) || 0),
        p_idempotency_key: kid,
      });
      giftOrderId = String(red.order_id);
      giftRedemptionId = String(red.id);
      const { data: gc } = await sb
        .from("store_economic_point_ledger")
        .select("amount")
        .eq("idempotency_key", kid)
        .maybeSingle();
      giftCreditAmount = Math.trunc(Number(gc?.amount) || 0);
    }
  }

  if (giftOrderId && giftCreditAmount > 0) {
    const cashBefore = await countStoreCashLedgerSince(sb, STORE_ID, sinceIso);
    const balBefore = await coinBal(sb, STORE_ID);

    const { data: giftRev } = await sb.rpc("gift_certificate_redemption_reverse", {
      p_order_id: giftOrderId,
    });

    const idem = `coin_reversal:order:${giftOrderId}`;
    const { data: coinRev } = await sb.rpc("reverse_coin_credits_for_order", {
      p_order_id: giftOrderId,
      p_idempotency_key: idem,
      p_reason: "cut_b_gift_refund_e2e",
    });

    const balAfter = await coinBal(sb, STORE_ID);
    const cashAfter = await countStoreCashLedgerSince(sb, STORE_ID, sinceIso);
    const { data: revLed } = await sb
      .from("store_economic_point_ledger")
      .select("id,entry_kind,amount")
      .eq("idempotency_key", idem)
      .maybeSingle();

    const coinReversed =
      coinRev?.ok === true &&
      revLed?.entry_kind === "REVERSAL" &&
      Math.abs(Math.trunc(Number(revLed.amount))) === giftCreditAmount;
    const noNewStoreCash = cashAfter === cashBefore;

    report.gift_refund = {
      order_id: giftOrderId,
      redemption_id: giftRedemptionId,
      coin_credit_amount: giftCreditAmount,
      gift_reverse_rpc: giftRev?.ok === true,
      coin_reversal: {
        ledger_id: revLed?.id ?? null,
        amount: revLed?.amount ?? null,
        pass: coinReversed,
      },
      legacy_store_cash_clawback: noNewStoreCash ? "SKIPPED" : "NEW_LEDGER_DETECTED",
      new_store_cash_ledger_count_delta: cashAfter - cashBefore,
      balance_before: balBefore,
      balance_after: balAfter,
    };

    if (!coinReversed || !noNewStoreCash) {
      report.first_divergence = report.first_divergence || "gift_refund_reversal";
      report.cut_b = "PARTIAL";
    }
  } else {
    report.gift_refund = { status: "NOT_PROVEN", reason: "no_gift_coin_fixture" };
    report.first_divergence = report.first_divergence || "no_gift_coin_fixture";
  }

  // ── Conversion RPC freeze ──
  const { data: convReq } = await sb.rpc("gift_certificate_conversion_request", {
    p_owner_user_id: "00000000-0000-0000-0000-000000000001",
    p_store_id: STORE_ID,
    p_amount: 100,
    p_idempotency_key: `cut_b_freeze_${Date.now()}`,
  });
  const { data: convAppr } = await sb.rpc("gift_certificate_conversion_approve", {
    p_admin_user_id: "00000000-0000-0000-0000-000000000001",
    p_request_id: "00000000-0000-0000-0000-000000000002",
  });

  report.gift_conversion_freeze = {
    rpc_request_frozen: convReq?.error === "gift_store_cash_conversion_frozen",
    rpc_approve_frozen: convAppr?.error === "gift_store_cash_conversion_frozen",
    historical_read: "PRESUMED_OK",
    owner_post_http: "NOT_PROVEN_UNTIL_DEPLOY",
    admin_approve_http: "NOT_PROVEN_UNTIL_DEPLOY",
  };

  if (!report.gift_conversion_freeze.rpc_request_frozen || !report.gift_conversion_freeze.rpc_approve_frozen) {
    report.first_divergence = report.first_divergence || "conversion_rpc_not_frozen";
    report.cut_b = "PARTIAL";
  }

  // HTTP 410 after deploy (best-effort)
  try {
    const ownerUrl = `${ORIGIN}/api/me/stores/${STORE_ID}/gift-certificates/conversions`;
    const res = await fetch(ownerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 100, idempotencyKey: `cut_b_http_${Date.now()}` }),
    });
    report.gift_conversion_freeze.owner_post_http = res.status === 410 ? "410_FROZEN" : `HTTP_${res.status}`;
  } catch (e) {
    report.gift_conversion_freeze.owner_post_http = `ERR:${String(e)}`;
  }

  const saleOk =
    report.sale_refund.balance_restored === true && report.sale_refund.duplicate_retry?.pass === true;
  const giftOk =
    report.gift_refund.coin_reversal?.pass === true &&
    report.gift_refund.legacy_store_cash_clawback === "SKIPPED";
  const freezeOk =
    report.gift_conversion_freeze.rpc_request_frozen && report.gift_conversion_freeze.rpc_approve_frozen;

  if (saleOk && giftOk && freezeOk && !report.first_divergence) {
    report.cut_b = "CLOSED";
  } else if (!report.first_divergence && (saleOk || giftOk)) {
    report.first_divergence = !saleOk ? "sale_refund" : !giftOk ? "gift_refund" : "partial_proof";
  }

  report.production_db = {
    store_id: STORE_ID,
    origin: ORIGIN,
    timestamp: new Date().toISOString(),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.cut_b === "CLOSED" ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
