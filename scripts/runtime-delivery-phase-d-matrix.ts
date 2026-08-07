/**
 * Phase D — Delivery Runtime Full Matrix (DB/RPC + apply SSOT).
 * UI Frozen — no UI. Structure untouched unless first break found.
 *
 * Usage: npx tsx scripts/runtime-delivery-phase-d-matrix.ts
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";
import { createStoreOrderAtomic } from "../lib/stores/create-store-order-atomic";
import { applyStoreOrderStatusTransition } from "../lib/stores/apply-store-order-status-transition";
import { recordStoreOrderPaymentFailed } from "../lib/stores/record-store-order-payment";

type CaseResult = { id: string; ok: boolean; detail: string };

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

function fail(id: string, detail: string): CaseResult {
  return { id, ok: false, detail };
}
function pass(id: string, detail: string): CaseResult {
  return { id, ok: true, detail };
}

async function rpcExists(sb: SupabaseClient, name: string): Promise<{ ok: boolean; detail: string }> {
  if (name === "create_store_order_atomic") {
    const { data, error } = await sb.rpc(name, {
      p_buyer_user_id: "00000000-0000-0000-0000-000000000001",
      p_store_id: "00000000-0000-0000-0000-000000000001",
      p_client_order_key: null,
      p_order: {},
      p_lines: [],
    });
    if (error && /Could not find the function|does not exist|schema cache/i.test(error.message)) {
      return { ok: false, detail: error.message };
    }
    const row = data as { error?: string } | null;
    return { ok: true, detail: `responds (${row?.error ?? "ok"})` };
  }
  if (name === "get_owner_store_order_detail_snapshot") {
    const { data, error } = await sb.rpc(name, {
      p_user_id: "00000000-0000-0000-0000-000000000001",
      p_store_id: "00000000-0000-0000-0000-000000000001",
      p_order_id: "00000000-0000-0000-0000-000000000001",
    });
    if (error && /Could not find the function|does not exist|schema cache/i.test(error.message)) {
      return { ok: false, detail: error.message };
    }
    const row = data as { error?: string } | null;
    return { ok: true, detail: `responds (${row?.error ?? "ok"})` };
  }
  return { ok: false, detail: "unknown rpc" };
}

async function main() {
  loadEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !service) {
    console.error("FAIL: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(2);
  }

  const sb = createClient(url, service, { auth: { persistSession: false } });
  const results: CaseResult[] = [];
  const cleanupOrderIds: string[] = [];
  const stockRestore: { productId: string; qty: number }[] = [];

  // --- RPC presence ---
  {
    const atomicOk = await rpcExists(sb, "create_store_order_atomic");
    results.push(
      atomicOk.ok
        ? pass("rpc_create_store_order_atomic", atomicOk.detail)
        : fail("rpc_create_store_order_atomic", atomicOk.detail)
    );
    const ownerSnapOk = await rpcExists(sb, "get_owner_store_order_detail_snapshot");
    results.push(
      ownerSnapOk.ok
        ? pass("rpc_owner_detail_snapshot", ownerSnapOk.detail)
        : fail("rpc_owner_detail_snapshot", ownerSnapOk.detail)
    );
  }

  if (results.some((r) => !r.ok)) {
    printReport(results);
    process.exit(1);
  }

  // Fixture: approved visible open store + active tracked product with stock >= 2
  const { data: stores } = await sb
    .from("stores")
    .select("id, owner_user_id, store_name")
    .eq("approval_status", "approved")
    .eq("is_visible", true)
    .eq("is_open", true)
    .limit(20);

  let fixture: {
    storeId: string;
    ownerId: string;
    buyerId: string;
    productId: string;
    title: string;
    unit: number;
    stockBefore: number;
  } | null = null;

  for (const st of stores ?? []) {
    const storeId = String(st.id);
    const ownerId = String(st.owner_user_id ?? "").trim();
    if (!ownerId) continue;
    const { data: products } = await sb
      .from("store_products")
      .select("id, title, price, discount_price, stock_qty, track_inventory, product_status, options_json")
      .eq("store_id", storeId)
      .eq("product_status", "active")
      .eq("track_inventory", true)
      .gte("stock_qty", 2)
      .limit(5);
    const p = (products ?? [])[0];
    if (!p) continue;

    // buyer: any other user
    const { data: buyers } = await sb
      .from("profiles")
      .select("id")
      .neq("id", ownerId)
      .limit(5);
    const buyerId = String((buyers ?? [])[0]?.id ?? "").trim();
    if (!buyerId) continue;

    const price = Number(p.price) || 0;
    const disc = p.discount_price != null ? Number(p.discount_price) : null;
    const unit = disc != null && disc >= 0 && disc < price ? disc : price;

    fixture = {
      storeId,
      ownerId,
      buyerId,
      productId: String(p.id),
      title: String(p.title ?? "item"),
      unit,
      stockBefore: Number(p.stock_qty) || 0,
    };
    break;
  }

  if (!fixture) {
    results.push(fail("fixture", "no approved open store with tracked stock>=2 + buyer"));
    printReport(results);
    process.exit(1);
  }

  results.push(
    pass(
      "fixture",
      `store=${fixture.storeId.slice(0, 8)} product=${fixture.productId.slice(0, 8)} stock=${fixture.stockBefore}`
    )
  );

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
    expected_options_json: null as unknown,
  };

  // Load live options_json for expected
  {
    const { data: prow } = await sb
      .from("store_products")
      .select("options_json")
      .eq("id", fixture.productId)
      .maybeSingle();
    lineBase.expected_options_json = prow?.options_json ?? null;
  }

  const orderPayload = {
    order_no: `PD${Date.now()}`,
    total_amount: fixture.unit,
    discount_amount: 0,
    payment_amount: fixture.unit,
    delivery_fee_amount: 0,
    payment_status: "paid",
    fulfillment_type: "pickup",
  };

  // A. Normal order
  const keyA = `phase-d-normal-${Date.now()}`;
  const created = await createStoreOrderAtomic(sb, {
    buyerUserId: fixture.buyerId,
    storeId: fixture.storeId,
    clientOrderKey: keyA,
    order: { ...orderPayload, order_no: `PDN${Date.now()}` },
    lines: [lineBase],
  });
  if (!created.ok || !created.order.id) {
    results.push(fail("A_normal_order", created.ok === false ? created.error : "no id"));
    printReport(results);
    process.exit(1);
  }
  cleanupOrderIds.push(created.order.id);
  stockRestore.push({ productId: fixture.productId, qty: 1 });

  const { data: itemsA } = await sb
    .from("store_order_items")
    .select("id")
    .eq("order_id", created.order.id);
  const { count: evCount } = await sb
    .from("store_order_events")
    .select("id", { count: "exact", head: true })
    .eq("order_id", created.order.id)
    .eq("event_type", "order_created");
  const { data: stockAfterA } = await sb
    .from("store_products")
    .select("stock_qty")
    .eq("id", fixture.productId)
    .maybeSingle();
  const stockA = Number(stockAfterA?.stock_qty);
  results.push(
    (itemsA?.length ?? 0) === 1 && (evCount ?? 0) >= 1 && stockA === fixture.stockBefore - 1
      ? pass("A_normal_order", `order=${created.order.id.slice(0, 8)} stock ${fixture.stockBefore}->${stockA}`)
      : fail(
          "A_normal_order",
          `items=${itemsA?.length} events=${evCount} stock=${stockA} expected=${fixture.stockBefore - 1}`
        )
  );

  // B. Duplicate client_order_key
  const dup = await createStoreOrderAtomic(sb, {
    buyerUserId: fixture.buyerId,
    storeId: fixture.storeId,
    clientOrderKey: keyA,
    order: { ...orderPayload, order_no: `PDDUP${Date.now()}` },
    lines: [lineBase],
  });
  const { data: stockAfterB } = await sb
    .from("store_products")
    .select("stock_qty")
    .eq("id", fixture.productId)
    .maybeSingle();
  results.push(
    dup.ok && dup.idempotent === true && dup.order.id === created.order.id && Number(stockAfterB?.stock_qty) === stockA
      ? pass("B_duplicate_key", "same order, stock unchanged")
      : fail(
          "B_duplicate_key",
          JSON.stringify({
            ok: dup.ok,
            idempotent: dup.ok ? dup.idempotent : false,
            sameId: dup.ok && dup.order.id === created.order.id,
            stock: stockAfterB?.stock_qty,
          })
        )
  );

  // C. Last stock race — set stock to 1, two concurrent creates
  await sb
    .from("store_products")
    .update({ stock_qty: 1, product_status: "active" })
    .eq("id", fixture.productId);
  const keyC1 = `phase-d-race-a-${Date.now()}`;
  const keyC2 = `phase-d-race-b-${Date.now()}`;
  const [race1, race2] = await Promise.all([
    createStoreOrderAtomic(sb, {
      buyerUserId: fixture.buyerId,
      storeId: fixture.storeId,
      clientOrderKey: keyC1,
      order: { ...orderPayload, order_no: `PDR1${Date.now()}` },
      lines: [lineBase],
    }),
    createStoreOrderAtomic(sb, {
      buyerUserId: fixture.buyerId,
      storeId: fixture.storeId,
      clientOrderKey: keyC2,
      order: { ...orderPayload, order_no: `PDR2${Date.now()}` },
      lines: [lineBase],
    }),
  ]);
  const raceOk = [race1, race2].filter((r) => r.ok).length;
  const raceFail = [race1, race2].filter((r) => !r.ok).length;
  if (race1.ok) cleanupOrderIds.push(race1.order.id);
  if (race2.ok) cleanupOrderIds.push(race2.order.id);
  results.push(
    raceOk === 1 && raceFail === 1
      ? pass("C_stock_race", `exactly one PASS (${race1.ok ? "A" : "B"})`)
      : fail("C_stock_race", `ok=${raceOk} fail=${raceFail}`)
  );

  // Restore stock for remaining cases
  await sb
    .from("store_products")
    .update({ stock_qty: Math.max(5, fixture.stockBefore), product_status: "active" })
    .eq("id", fixture.productId);

  // F. Price changed
  const priceFail = await createStoreOrderAtomic(sb, {
    buyerUserId: fixture.buyerId,
    storeId: fixture.storeId,
    clientOrderKey: `phase-d-price-${Date.now()}`,
    order: { ...orderPayload, order_no: `PDP${Date.now()}`, payment_amount: fixture.unit },
    lines: [
      {
        ...lineBase,
        unit: fixture.unit + 999,
        base_unit_after_discount: fixture.unit + 999,
        subtotal: fixture.unit + 999,
      },
    ],
  });
  results.push(
    !priceFail.ok && priceFail.error === "price_changed"
      ? pass("F_price_changed", "rejected")
      : fail("F_price_changed", priceFail.ok ? "unexpected ok" : priceFail.error)
  );

  // G. Sold-out after validate simulation
  await sb
    .from("store_products")
    .update({ product_status: "sold_out" })
    .eq("id", fixture.productId);
  const soldFail = await createStoreOrderAtomic(sb, {
    buyerUserId: fixture.buyerId,
    storeId: fixture.storeId,
    clientOrderKey: `phase-d-sold-${Date.now()}`,
    order: { ...orderPayload, order_no: `PDS${Date.now()}` },
    lines: [lineBase],
  });
  await sb
    .from("store_products")
    .update({ product_status: "active", stock_qty: Math.max(5, fixture.stockBefore) })
    .eq("id", fixture.productId);
  results.push(
    !soldFail.ok && soldFail.error === "product_sold_out"
      ? pass("G_sold_out", "rejected")
      : fail("G_sold_out", soldFail.ok ? "unexpected ok" : soldFail.error)
  );

  // H. Closed store
  await sb.from("stores").update({ is_open: false }).eq("id", fixture.storeId);
  const closedFail = await createStoreOrderAtomic(sb, {
    buyerUserId: fixture.buyerId,
    storeId: fixture.storeId,
    clientOrderKey: `phase-d-closed-${Date.now()}`,
    order: { ...orderPayload, order_no: `PDC${Date.now()}` },
    lines: [lineBase],
  });
  await sb.from("stores").update({ is_open: true }).eq("id", fixture.storeId);
  results.push(
    !closedFail.ok && closedFail.error === "store_closed"
      ? pass("H_store_closed", "rejected")
      : fail("H_store_closed", closedFail.ok ? "unexpected ok" : closedFail.error)
  );

  // Cancel recovery — customer cancel pending
  const keyCancel = `phase-d-cancel-${Date.now()}`;
  const toCancel = await createStoreOrderAtomic(sb, {
    buyerUserId: fixture.buyerId,
    storeId: fixture.storeId,
    clientOrderKey: keyCancel,
    order: { ...orderPayload, order_no: `PDX${Date.now()}` },
    lines: [lineBase],
  });
  if (!toCancel.ok) {
    results.push(fail("I_customer_cancel", toCancel.error));
  } else {
    cleanupOrderIds.push(toCancel.order.id);
    const { data: stockBeforeCancel } = await sb
      .from("store_products")
      .select("stock_qty")
      .eq("id", fixture.productId)
      .maybeSingle();
    const applied = await applyStoreOrderStatusTransition(sb, {
      orderId: toCancel.order.id,
      nextStatus: "cancelled",
      actor: "CUSTOMER",
      audit: { actor_type: "user", actor_id: fixture.buyerId, action: "phase_d_customer_cancel" },
    });
    const { data: afterCancel } = await sb
      .from("store_orders")
      .select("order_status, payment_status")
      .eq("id", toCancel.order.id)
      .maybeSingle();
    const { data: stockAfterCancel } = await sb
      .from("store_products")
      .select("stock_qty")
      .eq("id", fixture.productId)
      .maybeSingle();
    results.push(
      applied.ok &&
        afterCancel?.order_status === "cancelled" &&
        Number(stockAfterCancel?.stock_qty) === Number(stockBeforeCancel?.stock_qty) + 1
        ? pass("I_customer_cancel", "cancelled + stock restored")
        : fail(
            "I_customer_cancel",
            JSON.stringify({ applied, afterCancel, stockBeforeCancel, stockAfterCancel })
          )
    );
  }

  // Owner cancel_requested → admin cancel (stock restore from cancel_requested)
  const keyCR = `phase-d-cr-${Date.now()}`;
  const mid = await createStoreOrderAtomic(sb, {
    buyerUserId: fixture.buyerId,
    storeId: fixture.storeId,
    clientOrderKey: keyCR,
    order: { ...orderPayload, order_no: `PDCR${Date.now()}` },
    lines: [lineBase],
  });
  if (!mid.ok) {
    results.push(fail("J_cancel_requested_approve", mid.error));
  } else {
    cleanupOrderIds.push(mid.order.id);
    // advance to preparing so cancel_requested is allowed
    for (const next of ["accepted", "preparing"] as const) {
      const step = await applyStoreOrderStatusTransition(sb, {
        orderId: mid.order.id,
        nextStatus: next,
        actor: "OWNER",
        ownerAcceptPrepMinutes: next === "accepted" ? 15 : undefined,
        audit: { actor_type: "user", actor_id: fixture.ownerId, action: `phase_d_${next}` },
      });
      if (!step.ok) {
        results.push(fail("J_cancel_requested_approve", `advance ${next}: ${step.error}`));
        break;
      }
    }
    const { data: cur } = await sb
      .from("store_orders")
      .select("order_status")
      .eq("id", mid.order.id)
      .maybeSingle();
    if (cur?.order_status === "preparing") {
      const req = await applyStoreOrderStatusTransition(sb, {
        orderId: mid.order.id,
        nextStatus: "cancel_requested",
        actor: "OWNER",
        audit: { actor_type: "user", actor_id: fixture.ownerId, action: "phase_d_cancel_req" },
      });
      const { data: stockMid } = await sb
        .from("store_products")
        .select("stock_qty")
        .eq("id", fixture.productId)
        .maybeSingle();
      const approve = await applyStoreOrderStatusTransition(sb, {
        orderId: mid.order.id,
        nextStatus: "cancelled",
        actor: "ADMIN",
        audit: { actor_type: "admin", actor_id: fixture.ownerId, action: "phase_d_admin_force_cancel" },
      });
      const { data: stockEnd } = await sb
        .from("store_products")
        .select("stock_qty")
        .eq("id", fixture.productId)
        .maybeSingle();
      results.push(
        req.ok &&
          approve.ok &&
          Number(stockEnd?.stock_qty) === Number(stockMid?.stock_qty) + 1
          ? pass("J_cancel_requested_approve", "admin cancel restored stock")
          : fail(
              "J_cancel_requested_approve",
              JSON.stringify({ req, approve, stockMid, stockEnd })
            )
      );
    }
  }

  // Refund path: create → accepted → refund_requested → refunded
  const keyRf = `phase-d-rf-${Date.now()}`;
  const rf = await createStoreOrderAtomic(sb, {
    buyerUserId: fixture.buyerId,
    storeId: fixture.storeId,
    clientOrderKey: keyRf,
    order: { ...orderPayload, order_no: `PDRF${Date.now()}` },
    lines: [lineBase],
  });
  if (!rf.ok) {
    results.push(fail("K_refund_chain", rf.error));
  } else {
    cleanupOrderIds.push(rf.order.id);
    const acc = await applyStoreOrderStatusTransition(sb, {
      orderId: rf.order.id,
      nextStatus: "accepted",
      actor: "OWNER",
      ownerAcceptPrepMinutes: 10,
      audit: { actor_type: "user", actor_id: fixture.ownerId, action: "phase_d_accept" },
    });
    const rr = await applyStoreOrderStatusTransition(sb, {
      orderId: rf.order.id,
      nextStatus: "refund_requested",
      actor: "CUSTOMER",
      audit: { actor_type: "user", actor_id: fixture.buyerId, action: "phase_d_refund_req" },
    });
    const { data: stockRf0 } = await sb
      .from("store_products")
      .select("stock_qty")
      .eq("id", fixture.productId)
      .maybeSingle();
    const done = await applyStoreOrderStatusTransition(sb, {
      orderId: rf.order.id,
      nextStatus: "refunded",
      actor: "ADMIN",
      audit: { actor_type: "admin", actor_id: fixture.ownerId, action: "phase_d_refund" },
    });
    const { data: afterRf } = await sb
      .from("store_orders")
      .select("order_status, payment_status")
      .eq("id", rf.order.id)
      .maybeSingle();
    const { data: stockRf1 } = await sb
      .from("store_products")
      .select("stock_qty")
      .eq("id", fixture.productId)
      .maybeSingle();
    results.push(
      acc.ok &&
        rr.ok &&
        done.ok &&
        afterRf?.order_status === "refunded" &&
        afterRf?.payment_status === "refunded" &&
        Number(stockRf1?.stock_qty) === Number(stockRf0?.stock_qty) + 1
        ? pass("K_refund_chain", "refunded + stock restored")
        : fail("K_refund_chain", JSON.stringify({ acc, rr, done, afterRf, stockRf0, stockRf1 }))
    );
  }

  // Owner double-handle: same transition twice → idempotent, no double stock
  const keyDbl = `phase-d-dbl-${Date.now()}`;
  const dbl = await createStoreOrderAtomic(sb, {
    buyerUserId: fixture.buyerId,
    storeId: fixture.storeId,
    clientOrderKey: keyDbl,
    order: { ...orderPayload, order_no: `PDDBL${Date.now()}` },
    lines: [lineBase],
  });
  if (!dbl.ok) {
    results.push(fail("L_owner_double", dbl.error));
  } else {
    cleanupOrderIds.push(dbl.order.id);
    const a1 = await applyStoreOrderStatusTransition(sb, {
      orderId: dbl.order.id,
      nextStatus: "cancelled",
      actor: "OWNER",
      audit: { actor_type: "user", actor_id: fixture.ownerId, action: "phase_d_owner_cancel_1" },
    });
    const { data: stock1 } = await sb
      .from("store_products")
      .select("stock_qty")
      .eq("id", fixture.productId)
      .maybeSingle();
    const a2 = await applyStoreOrderStatusTransition(sb, {
      orderId: dbl.order.id,
      nextStatus: "cancelled",
      actor: "OWNER",
      audit: { actor_type: "user", actor_id: fixture.ownerId, action: "phase_d_owner_cancel_2" },
    });
    const { data: stock2 } = await sb
      .from("store_products")
      .select("stock_qty")
      .eq("id", fixture.productId)
      .maybeSingle();
    results.push(
      a1.ok && a2.ok && a2.idempotent === true && Number(stock1?.stock_qty) === Number(stock2?.stock_qty)
        ? pass("L_owner_double", "second cancel idempotent, stock stable")
        : fail("L_owner_double", JSON.stringify({ a1, a2, stock1, stock2 }))
    );
  }

  // Payment failure on pending unpaid — need payment_status pending order.
  // Create atomic forces paid; simulate by inserting pending unpaid then calling recordStoreOrderPaymentFailed
  // Skip if we cannot invent unpaid without bypassing atomic — use direct insert for payment_failure path only.
  {
    const oid = crypto.randomUUID();
    const { error: insErr } = await sb.from("store_orders").insert({
      id: oid,
      order_no: `PDPAY${Date.now()}`,
      buyer_user_id: fixture.buyerId,
      store_id: fixture.storeId,
      total_amount: fixture.unit,
      discount_amount: 0,
      payment_amount: fixture.unit,
      delivery_fee_amount: 0,
      payment_status: "pending",
      order_status: "pending",
      fulfillment_type: "pickup",
    });
    if (insErr) {
      results.push(fail("M_payment_failure", `insert: ${insErr.message}`));
    } else {
      cleanupOrderIds.push(oid);
      const { data: sBeforeReserve } = await sb
        .from("store_products")
        .select("stock_qty")
        .eq("id", fixture.productId)
        .maybeSingle();
      const reserved = Math.max(0, Number(sBeforeReserve?.stock_qty ?? 1) - 1);
      await sb
        .from("store_products")
        .update({ stock_qty: reserved })
        .eq("id", fixture.productId);
      await sb.from("store_order_items").insert({
        order_id: oid,
        product_id: fixture.productId,
        product_title_snapshot: fixture.title,
        price_snapshot: Math.round(fixture.unit),
        qty: 1,
        subtotal: Math.round(fixture.unit),
      });
      const { data: s0 } = await sb
        .from("store_products")
        .select("stock_qty")
        .eq("id", fixture.productId)
        .maybeSingle();
      const payFail = await recordStoreOrderPaymentFailed(sb, { orderId: oid });
      const { data: afterPay } = await sb
        .from("store_orders")
        .select("order_status, payment_status")
        .eq("id", oid)
        .maybeSingle();
      const { data: s1 } = await sb
        .from("store_products")
        .select("stock_qty")
        .eq("id", fixture.productId)
        .maybeSingle();
      results.push(
        payFail.ok &&
          afterPay?.order_status === "cancelled" &&
          afterPay?.payment_status === "failed" &&
          Number(s1?.stock_qty) === Number(s0?.stock_qty) + 1
          ? pass("M_payment_failure", "cancel+failed+stock restore")
          : fail("M_payment_failure", JSON.stringify({ payFail, afterPay, s0, s1 }))
      );
    }
  }

  // Owner detail snapshot includes review field (may be null)
  {
    const { data, error } = await sb.rpc("get_owner_store_order_detail_snapshot", {
      p_user_id: fixture.ownerId,
      p_store_id: fixture.storeId,
      p_order_id: created.order.id,
    });
    const row = data as Record<string, unknown> | null;
    results.push(
      !error && row?.ok === true && "review" in (row ?? {}) && "review_status" in (row ?? {})
        ? pass("N_owner_detail_review_field", `review_status=${row?.review_status}`)
        : fail("N_owner_detail_review_field", error?.message ?? JSON.stringify(row)?.slice(0, 200))
    );
  }

  // O. SYSTEM auto-complete (cron SSOT path)
  {
    const keyCron = `phase-d-cron-${Date.now()}`;
    const cronOrder = await createStoreOrderAtomic(sb, {
      buyerUserId: fixture.buyerId,
      storeId: fixture.storeId,
      clientOrderKey: keyCron,
      order: { ...orderPayload, order_no: `PDCRON${Date.now()}`, fulfillment_type: "pickup" },
      lines: [lineBase],
    });
    if (!cronOrder.ok) {
      results.push(fail("O_auto_complete", cronOrder.error));
    } else {
      cleanupOrderIds.push(cronOrder.order.id);
      let advanceOk = true;
      for (const next of ["accepted", "preparing", "ready_for_pickup"] as const) {
        const step = await applyStoreOrderStatusTransition(sb, {
          orderId: cronOrder.order.id,
          nextStatus: next,
          actor: "OWNER",
          ownerAcceptPrepMinutes: next === "accepted" ? 10 : undefined,
          audit: {
            actor_type: "user",
            actor_id: fixture.ownerId,
            action: `phase_d_cron_${next}`,
          },
        });
        if (!step.ok) {
          results.push(fail("O_auto_complete", `advance ${next}: ${step.error}`));
          advanceOk = false;
          break;
        }
      }
      if (advanceOk) {
        await sb
          .from("store_orders")
          .update({ auto_complete_at: new Date(Date.now() - 60_000).toISOString() })
          .eq("id", cronOrder.order.id);
        const done = await applyStoreOrderStatusTransition(sb, {
          orderId: cronOrder.order.id,
          nextStatus: "completed",
          actor: "SYSTEM",
          requireAutoCompleteDue: true,
          systemPurpose: "auto_complete",
          audit: {
            actor_type: "system",
            actor_id: null,
            action: "phase_d_cron_complete",
          },
        });
        const { data: row } = await sb
          .from("store_orders")
          .select("order_status")
          .eq("id", cronOrder.order.id)
          .maybeSingle();
        results.push(
          done.ok && row?.order_status === "completed"
            ? pass("O_auto_complete", "SYSTEM completed when due")
            : fail("O_auto_complete", JSON.stringify({ done, status: row?.order_status }))
        );
      }
    }
  }

  // Soft cleanup: cancel leftover pending test orders (best effort)
  for (const oid of cleanupOrderIds) {
    await applyStoreOrderStatusTransition(sb, {
      orderId: oid,
      nextStatus: "cancelled",
      actor: "ADMIN",
      audit: { actor_type: "system", actor_id: null, action: "phase_d_cleanup" },
    }).catch(() => {});
  }

  // Restore product stock floor
  await sb
    .from("store_products")
    .update({ stock_qty: Math.max(fixture.stockBefore, 5), product_status: "active" })
    .eq("id", fixture.productId);

  const failed = results.filter((r) => !r.ok);
  printReport(results);
  process.exit(failed.length ? 1 : 0);
}

function printReport(results: CaseResult[]) {
  console.log("\n=== DIBAY DELIVERY PHASE D RUNTIME MATRIX ===\n");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id} — ${r.detail}`);
  }
  const failed = results.filter((x) => !x.ok);
  console.log(
    `\nVERDICT: ${failed.length ? "DELIVERY PRODUCT FAIL" : "DELIVERY PRODUCT PASS (runtime matrix)"} (${results.length - failed.length}/${results.length})`
  );
  if (failed[0]) {
    console.log(`FIRST_BREAK: ${failed[0].id} — ${failed[0].detail}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
