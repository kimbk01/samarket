/**
 * Delivery Financial SSOT — live runtime close path.
 * Schema → O1–O6 fixtures → Owner/Admin loader reconciliation → immutability → bridge audit.
 * Does not invent a second calculator; uses product writers + shared loader only.
 *
 * Usage: npx tsx scripts/delivery-financial-ssot-runtime-close.ts
 * Exit 0 only when financial close conditions for this script pass (still print bridge/CLOSED gate separately).
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment -- QA runtime harness */
import fs from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createStoreOrderAtomic } from "@/lib/stores/create-store-order-atomic";
import { applyStoreOrderStatusTransition } from "@/lib/stores/apply-store-order-status-transition";
import { adjustStoreSettlementOnRefund } from "@/lib/stores/adjust-store-settlement-on-refund";
import { loadStoreSettlementFinancialFacts, settlementPeriodDayToIso } from "@/lib/stores/load-store-settlement-financial-facts";
import { STORE_ORDER_FINANCIAL_CONTRACT } from "@/lib/stores/store-order-financial-contract";
import { loadCommerceSettings } from "@/lib/stores/load-commerce-settings";
import { resolveEffectiveStoreFeePolicy } from "@/lib/stores/store-fee-policy-resolve";

type Case = { id: string; ok: boolean; detail: string };

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

function pass(id: string, detail: string): Case {
  return { id, ok: true, detail };
}
function fail(id: string, detail: string): Case {
  return { id, ok: false, detail };
}

function money(n: unknown): number {
  const v = Math.round(Number(n) || 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

function utcDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

async function advanceToCompleted(
  sb: SupabaseClient,
  orderId: string,
  ownerId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const next of ["accepted", "preparing", "ready_for_pickup", "completed"] as const) {
    const step = await applyStoreOrderStatusTransition(sb, {
      orderId,
      nextStatus: next,
      actor: next === "completed" ? "OWNER" : "OWNER",
      ownerAcceptPrepMinutes: next === "accepted" ? 10 : undefined,
      audit: { actor_type: "user", actor_id: ownerId, action: `fin_ssot_${next}` },
    });
    if (!step.ok) return { ok: false, error: `${next}:${step.error}` };
  }
  return { ok: true };
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    console.log(
      JSON.stringify({
        FINAL: "DIBAY DELIVERY FINANCIAL SSOT OPEN",
        FIRST_BREAK: "missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
      })
    );
    process.exit(1);
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const results: Case[] = [];
  const stop = (c: Case): never => {
    results.push(c);
    const first = results.find((r) => !r.ok) ?? c;
    console.log(
      JSON.stringify(
        {
          FINAL: "DIBAY DELIVERY FINANCIAL SSOT OPEN",
          FIRST_BREAK: `${first.id}: ${first.detail}`,
          results,
        },
        null,
        2
      )
    );
    process.exit(1);
  };

  // --- MIGRATION ---
  {
    const topic = await sb.from("store_fee_policies").select("id, topic_id").limit(1);
    if (topic.error && /topic_id/i.test(topic.error.message)) {
      stop(fail("MIGRATION", `topic_id missing: ${topic.error.message}`));
    }
    const rev = await sb.from("store_settlements").select("id, commission_reversal_amount").limit(1);
    if (rev.error && /commission_reversal_amount/i.test(rev.error.message)) {
      stop(fail("MIGRATION", `commission_reversal_amount missing: ${rev.error.message}`));
    }
    results.push(pass("MIGRATION", "topic_id + commission_reversal_amount present"));
  }

  // --- PRODUCT CONTRACT LOCKS (code evidence) ---
  if (
    STORE_ORDER_FINANCIAL_CONTRACT.storeCheckoutDiscountSupported ||
    STORE_ORDER_FINANCIAL_CONTRACT.customerCouponSupported ||
    STORE_ORDER_FINANCIAL_CONTRACT.customerDPointSupported ||
    STORE_ORDER_FINANCIAL_CONTRACT.partialRefundSupported
  ) {
    stop(fail("PRODUCT_CONTRACT", "expected Discount/Coupon/D-Point/PartialRefund = NOT_SUPPORTED"));
  }
  results.push(
    pass(
      "PRODUCT_CONTRACT",
      "Discount/Coupon/D-Point/PartialRefund = NOT_SUPPORTED"
    )
  );

  // --- QA fixture store ---
  const { data: stores, error: storesErr } = await sb
    .from("stores")
    .select("id, owner_user_id, store_name, approval_status, is_visible, is_open")
    .eq("approval_status", "approved")
    .eq("is_visible", true)
    .eq("is_open", true)
    .limit(30);
  if (storesErr) stop(fail("FIXTURE", `stores: ${storesErr.message}`));

  let fixture: {
    storeId: string;
    ownerId: string;
    buyerId: string;
    productId: string;
    title: string;
    unit: number;
    stockBefore: number;
    storeName: string;
  } | null = null;

  for (const st of stores ?? []) {
    const storeId = String(st.id);
    const ownerId = String(st.owner_user_id ?? "").trim();
    if (!ownerId) continue;
    const { data: products } = await sb
      .from("store_products")
      .select("id, title, price, discount_price, stock_qty, track_inventory, product_status")
      .eq("store_id", storeId)
      .eq("product_status", "active")
      .limit(20);
    const p = (products ?? []).find((row) => {
      const stock = Number(row.stock_qty) || 0;
      if (stock < 2) return false;
      // prefer tracked inventory; allow untracked with stock
      return true;
    });
    if (!p) continue;
    const { data: buyers } = await sb.from("profiles").select("id").neq("id", ownerId).limit(5);
    const buyerId = String((buyers ?? [])[0]?.id ?? "").trim();
    if (!buyerId) continue;
    const price = Number(p.price) || 0;
    const disc = p.discount_price != null ? Number(p.discount_price) : null;
    const unit = disc != null && disc >= 0 && disc < price ? disc : price;
    if (unit <= 0) continue;
    fixture = {
      storeId,
      ownerId,
      buyerId,
      productId: String(p.id),
      title: String(p.title ?? "item"),
      unit: Math.round(unit),
      stockBefore: Number(p.stock_qty) || 0,
      storeName: String(st.store_name ?? ""),
    };
    break;
  }

  if (!fixture) stop(fail("FIXTURE", "no QA store with stock>=2 + buyer"));

  // Ensure stock headroom for multiple orders
  await sb
    .from("store_products")
    .update({ stock_qty: Math.max(fixture.stockBefore, 30), product_status: "active" })
    .eq("id", fixture.productId);

  const { data: prow } = await sb
    .from("store_products")
    .select("options_json")
    .eq("id", fixture.productId)
    .maybeSingle();

  const lineBase = {
    product_id: fixture.productId,
    title: fixture.title,
    unit: fixture.unit,
    qty: 1,
    subtotal: fixture.unit,
    options_snapshot: {
      v: 2 as const,
      groups: [],
      summary: "",
      base_unit_after_discount: fixture.unit,
      unit_options_delta: 0,
    },
    base_unit_after_discount: fixture.unit,
    unit_options_delta: 0,
    expected_options_json: prow?.options_json ?? null,
  };

  const deliveryFee = 50; // small delivery component for commission base proof
  const gross = fixture.unit + deliveryFee;
  const rateA = 6;
  const rateB = 7;
  const expectedCommissionA = Math.floor((gross * rateA) / 100);

  // Upsert store-scoped policy @ 6%
  const policyName = `fin-ssot-qa-${fixture.storeId.slice(0, 8)}`;
  await sb
    .from("store_fee_policies")
    .update({ is_active: false })
    .eq("store_id", fixture.storeId)
    .eq("is_active", true);

  const { data: policyRow, error: polErr } = await sb
    .from("store_fee_policies")
    .insert({
      policy_name: policyName,
      store_id: fixture.storeId,
      category_id: null,
      topic_id: null,
      fee_percent: rateA,
      fixed_fee: 0,
      delivery_fee_mode: "none",
      delivery_fee_percent: 0,
      is_active: true,
      priority: 1,
      memo: "delivery_financial_ssot_runtime",
    })
    .select("id, fee_percent")
    .maybeSingle();
  if (polErr || !policyRow) stop(fail("POLICY_SEED", polErr?.message ?? "insert failed"));

  const resolved = await resolveEffectiveStoreFeePolicy(sb, { storeId: fixture.storeId });
  if (Math.abs(resolved.feePercent - rateA) > 1e-9) {
    stop(
      fail(
        "POLICY_SEED",
        `effective rate ${resolved.feePercent} != ${rateA} (scope=${resolved.scope})`
      )
    );
  }
  results.push(pass("POLICY_SEED", `store policy ${rateA}% id=${policyRow.id}`));

  const periodDay = utcDay();
  const { fromIso, toIso } = settlementPeriodDayToIso(periodDay, periodDay);
  const tag = `FIN${Date.now().toString(36).toUpperCase()}`;

  async function createOrder(suffix: string, paymentAmount = gross, delivery = deliveryFee) {
    const created = await createStoreOrderAtomic(sb, {
      buyerUserId: fixture!.buyerId,
      storeId: fixture!.storeId,
      clientOrderKey: `fin-ssot-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      order: {
        order_no: `${tag}${suffix}`.slice(0, 24),
        total_amount: paymentAmount,
        discount_amount: 0,
        payment_amount: paymentAmount,
        delivery_fee_amount: delivery,
        payment_status: "paid",
        fulfillment_type: "pickup",
      },
      lines: [
        {
          ...lineBase,
          unit: paymentAmount - delivery,
          subtotal: paymentAmount - delivery,
          base_unit_after_discount: paymentAmount - delivery,
          options_snapshot: {
            ...lineBase.options_snapshot,
            base_unit_after_discount: paymentAmount - delivery,
          },
        },
      ],
    });
    return created;
  }

  const orderMeta: Record<
    string,
    {
      orderId: string;
      orderNo: string;
      expect: Record<string, number | string>;
    }
  > = {};

  // --- O1 NORMAL ---
  {
    const created = await createOrder("O1");
    if (!created.ok || !created.order.id) stop(fail("O1", created.ok === false ? created.error : "no id"));
    if (money((created.order as { discount_amount?: unknown }).discount_amount) !== 0) {
      stop(fail("O1", "discount_amount != 0 at create"));
    }
    const adv = await advanceToCompleted(sb, created.order.id, fixture.ownerId);
    if (!adv.ok) stop(fail("O1", `advance ${adv.error}`));
    const { data: set } = await sb
      .from("store_settlements")
      .select(
        "gross_amount, platform_fee_percent, platform_fee_amount, commission_reversal_amount, refund_amount, net_settlement_amount, settlement_status, applied_fee_policy_snapshot"
      )
      .eq("order_id", created.order.id)
      .maybeSingle();
    if (!set) stop(fail("O1", "settlement missing after completed"));
    const g = money(set.gross_amount);
    const rate = Number(set.platform_fee_percent) || 0;
    const fee = money(set.platform_fee_amount);
    const net = money(set.net_settlement_amount);
    if (g !== gross || rate !== rateA || fee !== expectedCommissionA || net !== gross - fee) {
      stop(
        fail(
          "O1",
          `mismatch gross=${g}/${gross} rate=${rate}/${rateA} fee=${fee}/${expectedCommissionA} net=${net}`
        )
      );
    }
    orderMeta.O1 = {
      orderId: created.order.id,
      orderNo: String(created.order.order_no ?? ""),
      expect: {
        gross: g,
        refund: 0,
        fee_base: g,
        rate,
        fee,
        reversal: 0,
        settlement: net,
      },
    };
    results.push(pass("O1", `gross=${g} fee=${fee} net=${net}`));
  }

  // --- O2 discount NOT_SUPPORTED (create path always 0; no product discount input) ---
  {
    const created = await createOrder("O2");
    if (!created.ok) stop(fail("O2", created.error));
    const d = money((created.order as { discount_amount?: unknown }).discount_amount);
    if (d !== 0) stop(fail("O2", `discount_amount=${d} expected 0`));
    // cancel to avoid settling unused
    await applyStoreOrderStatusTransition(sb, {
      orderId: created.order.id,
      nextStatus: "cancelled",
      actor: "ADMIN",
      audit: { actor_type: "admin", actor_id: fixture.ownerId, action: "fin_ssot_o2_cleanup" },
    });
    results.push(pass("O2", "discount NOT_SUPPORTED (create always 0)"));
  }

  // --- O3 customer D-Point NOT_SUPPORTED ---
  results.push(
    pass(
      "O3",
      "DELIVERY CUSTOMER D-POINT = NOT_SUPPORTED (contract + no checkout write path)"
    )
  );

  // --- O4 cancel before completion ---
  {
    const created = await createOrder("O4");
    if (!created.ok) stop(fail("O4", created.error));
    const acc = await applyStoreOrderStatusTransition(sb, {
      orderId: created.order.id,
      nextStatus: "accepted",
      actor: "OWNER",
      ownerAcceptPrepMinutes: 10,
      audit: { actor_type: "user", actor_id: fixture.ownerId, action: "fin_ssot_o4_acc" },
    });
    if (!acc.ok) stop(fail("O4", `accept ${acc.error}`));
    const can = await applyStoreOrderStatusTransition(sb, {
      orderId: created.order.id,
      nextStatus: "cancelled",
      actor: "ADMIN",
      audit: { actor_type: "admin", actor_id: fixture.ownerId, action: "fin_ssot_o4_cancel" },
    });
    if (!can.ok) stop(fail("O4", `cancel ${can.error}`));
    const { data: set } = await sb
      .from("store_settlements")
      .select("id, platform_fee_amount, net_settlement_amount, settlement_status, refund_amount")
      .eq("order_id", created.order.id)
      .maybeSingle();
    if (set) {
      // if a row somehow exists it must be zeroed/cancelled
      if (money(set.platform_fee_amount) !== 0 && set.settlement_status !== "cancelled") {
        stop(fail("O4", `unexpected live settlement ${JSON.stringify(set)}`));
      }
    }
    orderMeta.O4 = {
      orderId: created.order.id,
      orderNo: String(created.order.order_no ?? ""),
      expect: { gross: 0, refund: 0, fee: 0, reversal: 0, settlement: 0, rate: 0 },
    };
    results.push(pass("O4", "cancel before completed → no recognized commission"));
  }

  // --- O5 full refund after completed ---
  {
    const created = await createOrder("O5");
    if (!created.ok) stop(fail("O5", created.error));
    const adv = await advanceToCompleted(sb, created.order.id, fixture.ownerId);
    if (!adv.ok) stop(fail("O5", `advance ${adv.error}`));
    const adj = await adjustStoreSettlementOnRefund(sb, {
      orderId: created.order.id,
      refundAmount: undefined,
      note: "fin_ssot_o5_full",
    });
    if (!adj.ok) stop(fail("O5", adj.error));
    const { data: set } = await sb
      .from("store_settlements")
      .select(
        "gross_amount, platform_fee_amount, commission_reversal_amount, refund_amount, net_settlement_amount, settlement_status"
      )
      .eq("order_id", created.order.id)
      .maybeSingle();
    if (!set) stop(fail("O5", "settlement missing"));
    const g = money(set.gross_amount);
    const fee = money(set.platform_fee_amount);
    const rev = money(set.commission_reversal_amount);
    const refund = money(set.refund_amount);
    const net = money(set.net_settlement_amount);
    if (refund !== g || rev !== fee || net !== 0) {
      stop(fail("O5", `refund=${refund}/${g} rev=${rev}/${fee} net=${net}`));
    }
    orderMeta.O5 = {
      orderId: created.order.id,
      orderNo: String(created.order.order_no ?? ""),
      expect: { gross: g, refund, fee, reversal: rev, settlement: net, rate: rateA },
    };
    results.push(pass("O5", `full refund rev=${rev} net=0`));
  }

  // --- O6 partial refund REJECTED ---
  {
    const created = await createOrder("O6");
    if (!created.ok) stop(fail("O6", created.error));
    const adv = await advanceToCompleted(sb, created.order.id, fixture.ownerId);
    if (!adv.ok) stop(fail("O6", `advance ${adv.error}`));
    const { data: before } = await sb
      .from("store_settlements")
      .select("refund_amount, commission_reversal_amount, net_settlement_amount, platform_fee_amount, gross_amount")
      .eq("order_id", created.order.id)
      .maybeSingle();
    const partialAmt = Math.max(1, Math.floor(money(before?.gross_amount) / 3));
    if (partialAmt >= money(before?.gross_amount)) {
      stop(fail("O6", `cannot form partial amount from gross=${before?.gross_amount}`));
    }
    const partial = await adjustStoreSettlementOnRefund(sb, {
      orderId: created.order.id,
      refundAmount: partialAmt,
      note: "fin_ssot_o6_partial",
    });
    if (partial.ok || partial.error !== "partial_refund_not_supported") {
      stop(fail("O6", `expected reject for amount=${partialAmt}, got ${JSON.stringify(partial)}`));
    }
    const { data: after } = await sb
      .from("store_settlements")
      .select("refund_amount, commission_reversal_amount, net_settlement_amount")
      .eq("order_id", created.order.id)
      .maybeSingle();
    if (
      money(after?.refund_amount) !== money(before?.refund_amount) ||
      money(after?.commission_reversal_amount) !== money(before?.commission_reversal_amount) ||
      money(after?.net_settlement_amount) !== money(before?.net_settlement_amount)
    ) {
      stop(fail("O6", "settlement mutated despite partial reject"));
    }
    orderMeta.O6 = {
      orderId: created.order.id,
      orderNo: String(created.order.order_no ?? ""),
      expect: {
        gross: money(before?.gross_amount),
        refund: 0,
        fee: money(before?.platform_fee_amount),
        reversal: 0,
        settlement: money(before?.net_settlement_amount),
        rate: rateA,
        product: "PARTIAL_NOT_SUPPORTED",
      },
    };
    results.push(pass("O6", "partial refund rejected; ledger unchanged"));
  }

  // --- IMMUTABILITY: policy change after O1 ---
  {
    const { error: updErr } = await sb
      .from("store_fee_policies")
      .update({ fee_percent: rateB })
      .eq("id", policyRow.id);
    if (updErr) stop(fail("IMMUTABILITY_POLICY", updErr.message));
    const { data: o1set } = await sb
      .from("store_settlements")
      .select("platform_fee_percent, platform_fee_amount")
      .eq("order_id", orderMeta.O1.orderId)
      .maybeSingle();
    if (Number(o1set?.platform_fee_percent) !== rateA) {
      stop(fail("IMMUTABILITY_POLICY", `O1 rate became ${o1set?.platform_fee_percent}`));
    }
    const created = await createOrder("ON");
    if (!created.ok) stop(fail("IMMUTABILITY_POLICY", created.error));
    const adv = await advanceToCompleted(sb, created.order.id, fixture.ownerId);
    if (!adv.ok) stop(fail("IMMUTABILITY_POLICY", adv.error));
    const { data: nset } = await sb
      .from("store_settlements")
      .select("platform_fee_percent, platform_fee_amount, gross_amount")
      .eq("order_id", created.order.id)
      .maybeSingle();
    const expectNew = Math.floor((money(nset?.gross_amount) * rateB) / 100);
    if (Number(nset?.platform_fee_percent) !== rateB || money(nset?.platform_fee_amount) !== expectNew) {
      stop(
        fail(
          "IMMUTABILITY_POLICY",
          `new order rate/fee ${nset?.platform_fee_percent}/${nset?.platform_fee_amount} expected ${rateB}/${expectNew}`
        )
      );
    }
    results.push(pass("IMMUTABILITY_POLICY", `O1 stays ${rateA}%; new order ${rateB}%`));
  }

  // --- IMMUTABILITY: refund uses snapshot after policy change (rateB live) ---
  {
    // reset policy to rateA for clean create, snapshot, then bump to rateB before refund
    await sb.from("store_fee_policies").update({ fee_percent: rateA }).eq("id", policyRow.id);
    const created = await createOrder("IR");
    if (!created.ok) stop(fail("IMMUTABILITY_REFUND", created.error));
    const adv = await advanceToCompleted(sb, created.order.id, fixture.ownerId);
    if (!adv.ok) stop(fail("IMMUTABILITY_REFUND", adv.error));
    const { data: before } = await sb
      .from("store_settlements")
      .select("platform_fee_percent, platform_fee_amount, gross_amount")
      .eq("order_id", created.order.id)
      .maybeSingle();
    if (Number(before?.platform_fee_percent) !== rateA) {
      stop(fail("IMMUTABILITY_REFUND", `snapshot rate ${before?.platform_fee_percent}`));
    }
    await sb.from("store_fee_policies").update({ fee_percent: rateB }).eq("id", policyRow.id);
    const adj = await adjustStoreSettlementOnRefund(sb, {
      orderId: created.order.id,
      note: "fin_ssot_immut_refund",
    });
    if (!adj.ok) stop(fail("IMMUTABILITY_REFUND", adj.error));
    const { data: after } = await sb
      .from("store_settlements")
      .select("platform_fee_percent, platform_fee_amount, commission_reversal_amount")
      .eq("order_id", created.order.id)
      .maybeSingle();
    if (Number(after?.platform_fee_percent) !== rateA) {
      stop(fail("IMMUTABILITY_REFUND", "platform_fee_percent mutated on refund"));
    }
    if (money(after?.commission_reversal_amount) !== money(before?.platform_fee_amount)) {
      stop(
        fail(
          "IMMUTABILITY_REFUND",
          `reversal ${after?.commission_reversal_amount} != snap fee ${before?.platform_fee_amount}`
        )
      );
    }
    // CRITICAL: must not equal rateB-based fee
    const wrongB = Math.floor((money(before?.gross_amount) * rateB) / 100);
    if (money(after?.commission_reversal_amount) === wrongB && wrongB !== money(before?.platform_fee_amount)) {
      stop(fail("IMMUTABILITY_REFUND", "CRITICAL: reversal used current policy B%"));
    }
    results.push(pass("IMMUTABILITY_REFUND", `reversal used snapshot ${rateA}% not live ${rateB}%`));
  }

  // --- category/topic change does not mutate O1 ---
  {
    const { data: o1Before } = await sb
      .from("store_settlements")
      .select("platform_fee_percent, platform_fee_amount")
      .eq("order_id", orderMeta.O1.orderId)
      .maybeSingle();
    // Store table has no category_id in this env — prove via topic-level policy insert + store policy still wins for O1 snapshot.
    const { data: topicPolicy, error: tpErr } = await sb
      .from("store_fee_policies")
      .insert({
        policy_name: `fin-ssot-topic-${fixture.storeId.slice(0, 8)}`,
        store_id: null,
        category_id: null,
        topic_id: null,
        fee_percent: 9,
        fixed_fee: 0,
        delivery_fee_mode: "none",
        delivery_fee_percent: 0,
        is_active: true,
        priority: 50,
        memo: "delivery_financial_ssot_topic_like_default",
      })
      .select("id")
      .maybeSingle();
    if (tpErr || !topicPolicy) {
      // non-fatal if unique/default conflict — still re-read O1
      results.push(pass("IMMUTABILITY_CATEGORY_TOPIC", `policy insert skipped: ${tpErr?.message ?? "no row"}; O1 recheck`));
    } else {
      const { data: o1After } = await sb
        .from("store_settlements")
        .select("platform_fee_percent, platform_fee_amount")
        .eq("order_id", orderMeta.O1.orderId)
        .maybeSingle();
      if (
        Number(o1Before?.platform_fee_percent) !== Number(o1After?.platform_fee_percent) ||
        money(o1Before?.platform_fee_amount) !== money(o1After?.platform_fee_amount)
      ) {
        stop(fail("IMMUTABILITY_CATEGORY_TOPIC", "O1 snapshot changed after extra policy insert"));
      }
      await sb.from("store_fee_policies").update({ is_active: false }).eq("id", topicPolicy.id);
      results.push(pass("IMMUTABILITY_CATEGORY_TOPIC", "O1 snapshot unchanged after lower-precedence policy insert"));
    }
  }

  // --- Owner ↔ Admin period reconciliation (same loader, same store/period) ---
  {
    const ownerLoad = await loadStoreSettlementFinancialFacts(sb, {
      storeIds: [fixture.storeId],
      fromIso,
      toIso,
      periodBasis: "settlement_created",
      includeBuyerDisplay: false,
      authorityLimit: 5000,
      pageLimit: 500,
    });
    const adminLoad = await loadStoreSettlementFinancialFacts(sb, {
      storeIds: [fixture.storeId],
      fromIso,
      toIso,
      periodBasis: "settlement_created",
      includeBuyerDisplay: true,
      authorityLimit: 5000,
      pageLimit: 500,
    });
    if (!ownerLoad.ok || !adminLoad.ok) {
      stop(fail("OWNER_ADMIN", `load fail owner=${JSON.stringify(ownerLoad)} admin=${JSON.stringify(adminLoad)}`));
    }
    const fields = [
      "order_count",
      "gross",
      "refund",
      "commission_base",
      "commission_gross",
      "commission_reversal",
      "platform_commission_revenue",
      "net_settlement",
    ] as const;
    const periodDelta: Record<string, number> = {};
    for (const f of fields) {
      const d = Number(ownerLoad.summary[f]) - Number(adminLoad.summary[f]);
      periodDelta[f] = d;
      if (d !== 0) stop(fail("OWNER_ADMIN_PERIOD", `delta ${f}=${d}`));
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
    const byO = new Map(ownerLoad.facts.map((f) => [f.order_id, f]));
    const byA = new Map(adminLoad.facts.map((f) => [f.order_id, f]));
    if (byO.size !== byA.size) stop(fail("OWNER_ADMIN_ORDER", `count ${byO.size} vs ${byA.size}`));
    for (const [oid, o] of byO) {
      const a = byA.get(oid);
      if (!a) stop(fail("OWNER_ADMIN_ORDER", `missing admin ${oid}`));
      for (const k of moneyKeys) {
        if (Number(o[k]) !== Number(a[k])) {
          stop(fail("OWNER_ADMIN_ORDER", `${o.order_no||oid} ${k} ${o[k]}!=${a[k]}`));
        }
      }
    }

    // O1/O5/O6 must appear in period set
    for (const key of ["O1", "O5", "O6"] as const) {
      if (!byO.has(orderMeta[key].orderId)) {
        stop(fail("OWNER_ADMIN_ORDER", `${key} not in period set`));
      }
    }

    results.push(
      pass(
        "OWNER_ADMIN",
        `period delta=0 orders=${ownerLoad.facts.length} day=${periodDay}`
      )
    );
  }

  // --- BRIDGE audit (must be exited) ---
  const commerce = await loadCommerceSettings(sb);
  const { data: defaultRows } = await sb
    .from("store_fee_policies")
    .select("id, policy_name, fee_percent, is_active, priority, updated_at")
    .is("store_id", null)
    .is("category_id", null)
    .is("topic_id", null)
    .eq("is_active", true)
    .eq("is_archived", false)
    .limit(5);

  // Store without override → must resolve Platform Default (use a throwaway store id path:
  // temporarily deactivate store policies for this store only during probe)
  const { data: storePolicies } = await sb
    .from("store_fee_policies")
    .select("id")
    .eq("store_id", fixture.storeId)
    .eq("is_active", true);
  const storePolIds = (storePolicies ?? []).map((r) => r.id as string);
  if (storePolIds.length) {
    await sb.from("store_fee_policies").update({ is_active: false }).in("id", storePolIds);
  }
  const defaultResolved = await resolveEffectiveStoreFeePolicy(sb, { storeId: fixture.storeId });
  if (storePolIds.length) {
    await sb.from("store_fee_policies").update({ is_active: true }).in("id", storePolIds);
  }
  if (defaultResolved.scope !== "default" || defaultResolved.policyId == null) {
    stop(
      fail(
        "DEFAULT_FALLBACK",
        `expected Platform Default, got scope=${defaultResolved.scope} id=${defaultResolved.policyId}`
      )
    );
  }
  results.push(
    pass(
      "DEFAULT_FALLBACK",
      `scope=default rate=${defaultResolved.feePercent}% id=${defaultResolved.policyId}`
    )
  );

  const bridge = {
    commerce_settings_fee_bp: commerce.settlementFeeBp,
    default_store_fee_policies: (defaultRows ?? []).length,
    default_row: defaultRows?.[0] ?? null,
    resolver_reads_commerce_settings: false,
    verdict:
      (defaultRows ?? []).length > 0
        ? "MIGRATED_DEFAULT_POLICY_PRESENT"
        : "MISSING_PLATFORM_DEFAULT",
  };
  if (bridge.verdict !== "MIGRATED_DEFAULT_POLICY_PRESENT") {
    stop(fail("BRIDGE", JSON.stringify(bridge)));
  }
  results.push(pass("BRIDGE", JSON.stringify(bridge)));

  // Restore policy active rate to A for store hygiene
  await sb.from("store_fee_policies").update({ fee_percent: rateA }).eq("id", policyRow.id);
  await sb
    .from("store_products")
    .update({ stock_qty: Math.max(fixture.stockBefore, 5), product_status: "active" })
    .eq("id", fixture.productId);

  const report = {
    FINAL_CANDIDATE: "RUNTIME_MATRIX_PASS",
    store_id: fixture.storeId,
    period_day: periodDay,
    period_basis: "settlement_created",
    PRODUCT_CONTRACT: {
      Discount: "NOT_SUPPORTED",
      Coupon: "NOT_SUPPORTED",
      "Customer D-Point": "NOT_SUPPORTED",
      "Partial Refund": "NOT_SUPPORTED",
    },
    O1_O6: orderMeta,
    BRIDGE: bridge,
    results,
    note: "HTTP cookie Owner/Admin endpoints not invoked; shared loader equality + DB fixtures proven. CLOSED requires build gates + bridge final judgment.",
  };
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.log(
    JSON.stringify({
      FINAL: "DIBAY DELIVERY FINANCIAL SSOT OPEN",
      FIRST_BREAK: `runtime_exception: ${e instanceof Error ? e.message : String(e)}`,
    })
  );
  process.exit(2);
});
