import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { formatMoneyPhp } from "@/lib/utils/format";

async function loadStoreName(sb: SupabaseClient, storeId: string): Promise<string> {
  const { data } = await sb.from("stores").select("store_name").eq("id", storeId.trim()).maybeSingle();
  return String((data?.store_name as string) ?? "").trim();
}

/** 신규 주문 접수 시 매장 오너에게 인앱 알림 */
function truncateNote(s: string | null | undefined, max: number): string {
  const t = (s ?? "").trim().replace(/\s+/g, " ");
  if (!t) return "";
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

export async function notifyStoreOwnerNewOrder(
  sb: SupabaseClient,
  opts: {
    storeId: string;
    orderId: string;
    orderNo: string;
    paymentAmount: number;
    lineCount: number;
    storeName?: string;
    /** 고객 선택 결제 수단 표시문 */
    paymentLabel?: string | null;
    /** 고객 요청 사항(요약) */
    buyerNote?: string | null;
  }
): Promise<void> {
  const sid = opts.storeId.trim();
  const oid = opts.orderId.trim();
  if (!sid || !oid) return;

  const { data: store, error } = await sb
    .from("stores")
    .select("owner_user_id, store_name")
    .eq("id", sid)
    .maybeSingle();

  if (error || !store?.owner_user_id) return;

  const ownerId = store.owner_user_id as string;
  const name = (opts.storeName ?? (store.store_name as string) ?? "").trim();
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);
  const amt = formatMoneyPhp(opts.paymentAmount);
  const lines = Math.max(0, opts.lineCount);
  const pay = (opts.paymentLabel ?? "").trim();
  const note = truncateNote(opts.buyerNote, 80);
  const extras: string[] = [];
  if (pay && pay !== "—") extras.push(`결제 ${pay}`);
  if (note) extras.push(`요청 ${note}`);
  const extraSeg = extras.length ? ` · ${extras.join(" · ")}` : "";

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    title: "새 매장 주문",
    body: name
      ? `「${name}」 ${orderNo} · ${amt} · 품목 ${lines}종${extraSeg} — 접수·채팅에서 확인해 주세요.`
      : `${orderNo} · ${amt} · 품목 ${lines}종${extraSeg} — 접수·채팅에서 확인해 주세요.`,
    link_url: `/my/business/store-orders?order_id=${encodeURIComponent(oid)}&ack_owner_notifications=1`,
    meta: {
      kind: "store_order_created",
      store_id: sid,
      order_id: oid,
      order_no: orderNo,
      payment_amount: Math.round(opts.paymentAmount),
      line_count: lines,
      ...(pay && pay !== "—" ? { payment_label: pay } : {}),
      ...(note ? { buyer_note_preview: note } : {}),
    },
  });
}

/** 결제 완료 시 구매자 — 주문 상세·채팅 안내 */
export async function notifyBuyerStorePaymentCompleted(
  sb: SupabaseClient,
  opts: {
    buyerUserId: string;
    orderId: string;
    orderNo: string;
    storeId: string;
  }
): Promise<void> {
  const bid = opts.buyerUserId.trim();
  const oid = opts.orderId.trim();
  if (!bid || !oid) return;

  const storeName = await loadStoreName(sb, opts.storeId);
  const label = storeName || "매장";
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    title: "결제가 완료됐어요",
    body: `「${label}」 ${orderNo} — 매장이 확인·접수하면 채팅과 알림으로 단계가 안내돼요.`,
    link_url: `/my/store-orders/${encodeURIComponent(oid)}/chat`,
    meta: {
      kind: "store_order_payment_completed_buyer",
      order_id: oid,
      order_no: orderNo,
      store_id: opts.storeId.trim(),
    },
  });
}

/** 결제 완료 시 오너 — 접수 가능 안내 */
export async function notifyStoreOwnerPaymentCompleted(
  sb: SupabaseClient,
  opts: {
    storeId: string;
    orderId: string;
    orderNo: string;
    paymentAmount: number;
    storeName?: string;
  }
): Promise<void> {
  const sid = opts.storeId.trim();
  const oid = opts.orderId.trim();
  if (!sid || !oid) return;

  const { data: store, error } = await sb
    .from("stores")
    .select("owner_user_id, store_name")
    .eq("id", sid)
    .maybeSingle();

  if (error || !store?.owner_user_id) return;

  const ownerId = store.owner_user_id as string;
  const name = (opts.storeName ?? (store.store_name as string) ?? "").trim();
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);
  const amt = formatMoneyPhp(opts.paymentAmount);

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    title: "매장 주문 결제 완료",
    body: name
      ? `「${name}」 ${orderNo} · ${amt} — 결제가 완료되었습니다. 주문을 접수할 수 있어요.`
      : `${orderNo} · ${amt} — 결제가 완료되었습니다. 주문을 접수할 수 있어요.`,
    link_url: `/my/business/store-orders?order_id=${encodeURIComponent(oid)}&ack_owner_notifications=1`,
    meta: {
      kind: "store_order_payment_completed",
      store_id: sid,
      order_id: oid,
      order_no: orderNo,
    },
  });
}

/** 구매자가 접수 전 취소 시 오너 */
export async function notifyStoreOwnerBuyerCancelled(
  sb: SupabaseClient,
  opts: { storeId: string; orderId: string; orderNo: string; storeName?: string }
): Promise<void> {
  const sid = opts.storeId.trim();
  const oid = opts.orderId.trim();
  if (!sid || !oid) return;

  const { data: store, error } = await sb
    .from("stores")
    .select("owner_user_id, store_name")
    .eq("id", sid)
    .maybeSingle();

  if (error || !store?.owner_user_id) return;

  const ownerId = store.owner_user_id as string;
  const name = (opts.storeName ?? (store.store_name as string) ?? "").trim();
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    title: "고객이 주문을 취소했습니다",
    body: name ? `「${name}」 ${orderNo} — 접수 전 취소되었습니다.` : `${orderNo} — 접수 전 취소되었습니다.`,
    link_url: `/my/business/store-orders?order_id=${encodeURIComponent(oid)}&ack_owner_notifications=1`,
    meta: { kind: "store_order_buyer_cancelled", store_id: sid, order_id: oid, order_no: orderNo },
  });
}

/** 구매자 환불 요청 시 매장 오너에게 인앱 알림 */
export async function notifyStoreOwnerRefundRequested(
  sb: SupabaseClient,
  opts: { storeId: string; orderId: string; orderNo: string; storeName?: string }
): Promise<void> {
  const sid = opts.storeId.trim();
  const oid = opts.orderId.trim();
  if (!sid || !oid) return;

  const { data: store, error } = await sb
    .from("stores")
    .select("owner_user_id, store_name")
    .eq("id", sid)
    .maybeSingle();

  if (error || !store?.owner_user_id) return;

  const ownerId = store.owner_user_id as string;
  const name = (opts.storeName ?? (store.store_name as string) ?? "").trim();
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    title: "매장 주문 환불 요청",
    body: name
      ? `「${name}」 주문 ${orderNo} — 고객이 환불을 요청했습니다.`
      : `주문 ${orderNo} — 고객이 환불을 요청했습니다.`,
    link_url: `/my/business/store-orders?order_id=${encodeURIComponent(oid)}&ack_owner_notifications=1`,
    meta: {
      kind: "store_order_refund_requested",
      store_id: sid,
      order_id: oid,
      order_no: orderNo,
    },
  });
}

const OWNER_STATUS_NOTIFY = new Set([
  "accepted",
  "preparing",
  "ready_for_pickup",
  "delivering",
  "arrived",
  "completed",
  "cancelled",
]);

function buyerCopyForOwnerStatus(
  nextStatus: string,
  storeLabel: string,
  orderNo: string
): { title: string; body: string } | null {
  const s = storeLabel || "매장";
  const no = orderNo;
  switch (nextStatus) {
    case "accepted":
      return {
        title: "주문이 접수되었어요",
        body: `「${s}」 ${no} 주문을 매장이 접수했습니다.`,
      };
    case "preparing":
      return { title: "상품 준비 중이에요", body: `「${s}」 ${no} 주문을 준비하고 있어요.` };
    case "ready_for_pickup":
      return {
        title: "픽업 준비됐어요",
        body: `「${s}」 ${no} 주문 — 픽업·출고 준비 단계입니다.`,
      };
    case "delivering":
      return { title: "배송 중이에요", body: `「${s}」 ${no} 주문이 배송 중이에요.` };
    case "arrived":
      return {
        title: "배송지에 도착했어요",
        body: `「${s}」 ${no} 주문이 배송지에 도착했습니다.`,
      };
    case "completed":
      return { title: "주문이 완료됐어요", body: `「${s}」 ${no} 주문이 완료 처리되었습니다.` };
    case "cancelled":
      return {
        title: "주문이 취소됐어요",
        body: `「${s}」 ${no} 주문이 매장에 의해 취소되었습니다.`,
      };
    default:
      return null;
  }
}

/** 오너가 주문 상태를 바꿀 때 구매자에게 */
export async function notifyBuyerStoreOrderOwnerStatus(
  sb: SupabaseClient,
  opts: {
    buyerUserId: string;
    orderId: string;
    orderNo: string;
    storeId: string;
    nextStatus: string;
  }
): Promise<void> {
  const bid = opts.buyerUserId.trim();
  const oid = opts.orderId.trim();
  if (!bid || !oid) return;
  if (!OWNER_STATUS_NOTIFY.has(opts.nextStatus)) return;

  const storeName = await loadStoreName(sb, opts.storeId);
  const label = storeName || "매장";
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);
  const copy = buyerCopyForOwnerStatus(opts.nextStatus, label, orderNo);
  if (!copy) return;

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    title: copy.title,
    body: copy.body,
    link_url: `/my/store-orders/${encodeURIComponent(oid)}/chat`,
    meta: {
      kind: "store_order_owner_status",
      order_id: oid,
      order_no: orderNo,
      store_id: opts.storeId.trim(),
      order_status: opts.nextStatus,
    },
  });
}

/** 결제 실패(pending→failed) 시 구매자 */
export async function notifyBuyerStorePaymentFailed(
  sb: SupabaseClient,
  opts: { buyerUserId: string; orderId: string; orderNo: string; storeId: string }
): Promise<void> {
  const bid = opts.buyerUserId.trim();
  const oid = opts.orderId.trim();
  if (!bid || !oid) return;

  const storeName = await loadStoreName(sb, opts.storeId);
  const label = storeName || "매장";
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    title: "결제에 실패했어요",
    body: `「${label}」 ${orderNo} 주문 — 결제가 완료되지 않았습니다. 다시 시도하거나 주문을 취소할 수 있어요.`,
    link_url: `/my/store-orders/${encodeURIComponent(oid)}`,
    meta: { kind: "store_order_payment_failed", order_id: oid, order_no: orderNo, store_id: opts.storeId },
  });
}

/** 관리자 환불 승인 후 구매자 */
export async function notifyBuyerStoreRefundApproved(
  sb: SupabaseClient,
  opts: { buyerUserId: string; orderId: string; orderNo: string; storeId: string }
): Promise<void> {
  const bid = opts.buyerUserId.trim();
  const oid = opts.orderId.trim();
  if (!bid || !oid) return;

  const storeName = await loadStoreName(sb, opts.storeId);
  const label = storeName || "매장";
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    title: "환불이 처리되었어요",
    body: `「${label}」 ${orderNo} 주문이 환불 처리되었습니다. 실제 금액 반환은 매장과 직접 확인해 주세요.`,
    link_url: `/my/store-orders/${encodeURIComponent(oid)}`,
    meta: { kind: "store_order_refund_approved", order_id: oid, order_no: orderNo, store_id: opts.storeId },
  });
}

/** 크론 자동 구매확정 시 구매자 */
export async function notifyBuyerStoreOrderAutoCompleted(
  sb: SupabaseClient,
  opts: { buyerUserId: string; orderId: string; orderNo: string; storeId: string }
): Promise<void> {
  const bid = opts.buyerUserId.trim();
  const oid = opts.orderId.trim();
  if (!bid || !oid) return;

  const storeName = await loadStoreName(sb, opts.storeId);
  const label = storeName || "매장";
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    title: "주문이 자동 완료됐어요",
    body: `「${label}」 ${orderNo} 주문이 기한에 따라 자동으로 완료 처리되었습니다.`,
    link_url: `/my/store-orders/${encodeURIComponent(oid)}`,
    meta: { kind: "store_order_auto_completed", order_id: oid, order_no: orderNo, store_id: opts.storeId },
  });
}
