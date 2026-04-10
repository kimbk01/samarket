import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { buildStoreOrdersHref } from "@/lib/business/store-orders-tab";
import { DEFAULT_APP_LANGUAGE, normalizeAppLanguage, type AppLanguageCode } from "@/lib/i18n/config";
import { translate } from "@/lib/i18n/messages";
import { formatMoneyPhp } from "@/lib/utils/format";

/** 구매자 매장 주문 알림의 바로가기 — 주문 내역 목록으로 통일 */
const BUYER_STORE_ORDERS_NOTIFICATION_HREF = "/my/store-orders";

async function loadStoreName(sb: SupabaseClient, storeId: string): Promise<string> {
  const { data } = await sb.from("stores").select("store_name").eq("id", storeId.trim()).maybeSingle();
  return String((data?.store_name as string) ?? "").trim();
}

async function loadUserLanguage(
  sb: SupabaseClient,
  userId: string
): Promise<AppLanguageCode> {
  const uid = userId.trim();
  if (!uid) return DEFAULT_APP_LANGUAGE;
  const { data } = await sb
    .from("profiles")
    .select("preferred_language")
    .eq("id", uid)
    .maybeSingle();
  return normalizeAppLanguage((data as { preferred_language?: unknown } | null)?.preferred_language);
}

function nt(
  language: AppLanguageCode,
  key: Parameters<typeof translate>[1],
  vars?: Record<string, string | number>
): string {
  return translate(language, key, vars);
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
  const language = await loadUserLanguage(sb, ownerId);
  const name = (opts.storeName ?? (store.store_name as string) ?? "").trim();
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);
  const amt = formatMoneyPhp(opts.paymentAmount);
  const lines = Math.max(0, opts.lineCount);
  const pay = (opts.paymentLabel ?? "").trim();
  const note = truncateNote(opts.buyerNote, 80);
  const extras: string[] = [];
  if (pay && pay !== "—") extras.push(nt(language, "notify_commerce_payment_prefix", { payment: pay }));
  if (note) extras.push(nt(language, "notify_commerce_request_prefix", { note }));
  const extraSeg = extras.length ? ` · ${extras.join(" · ")}` : "";

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: oid,
    title: nt(language, "notify_commerce_new_order_title"),
    body: name
      ? nt(language, "notify_commerce_new_order_body_named", {
          store: name,
          orderNo,
          amount: amt,
          lineCount: lines,
          extra: extraSeg,
        })
      : nt(language, "notify_commerce_new_order_body", {
          orderNo,
          amount: amt,
          lineCount: lines,
          extra: extraSeg,
        }),
    link_url: buildStoreOrdersHref({
      storeId: sid,
      orderId: oid,
      ackOwnerNotifications: true,
    }),
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

  const language = await loadUserLanguage(sb, bid);
  const storeName = await loadStoreName(sb, opts.storeId);
  const label = storeName || nt(language, "notify_commerce_store_fallback");
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    domain: "order",
    ref_id: oid,
    title: nt(language, "notify_commerce_payment_done_title"),
    body: nt(language, "notify_commerce_payment_done_body", { store: label, orderNo }),
    link_url: BUYER_STORE_ORDERS_NOTIFICATION_HREF,
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
  const language = await loadUserLanguage(sb, ownerId);
  const name = (opts.storeName ?? (store.store_name as string) ?? "").trim();
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);
  const amt = formatMoneyPhp(opts.paymentAmount);

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: oid,
    title: nt(language, "notify_commerce_owner_payment_done_title"),
    body: name
      ? nt(language, "notify_commerce_owner_payment_done_body_named", {
          store: name,
          orderNo,
          amount: amt,
        })
      : nt(language, "notify_commerce_owner_payment_done_body", {
          orderNo,
          amount: amt,
        }),
    link_url: buildStoreOrdersHref({
      storeId: sid,
      orderId: oid,
      ackOwnerNotifications: true,
    }),
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
  const language = await loadUserLanguage(sb, ownerId);
  const name = (opts.storeName ?? (store.store_name as string) ?? "").trim();
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: oid,
    title: nt(language, "notify_commerce_buyer_cancelled_title"),
    body: name
      ? nt(language, "notify_commerce_buyer_cancelled_body_named", { store: name, orderNo })
      : nt(language, "notify_commerce_buyer_cancelled_body", { orderNo }),
    link_url: buildStoreOrdersHref({
      storeId: sid,
      orderId: oid,
      ackOwnerNotifications: true,
    }),
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
  const language = await loadUserLanguage(sb, ownerId);
  const name = (opts.storeName ?? (store.store_name as string) ?? "").trim();
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: oid,
    title: nt(language, "notify_commerce_refund_requested_title"),
    body: name
      ? nt(language, "notify_commerce_refund_requested_body_named", { store: name, orderNo })
      : nt(language, "notify_commerce_refund_requested_body", { orderNo }),
    link_url: buildStoreOrdersHref({
      storeId: sid,
      orderId: oid,
      tab: "refund",
      ackOwnerNotifications: true,
    }),
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
  language: AppLanguageCode,
  nextStatus: string,
  storeLabel: string,
  orderNo: string
): { title: string; body: string } | null {
  const s = storeLabel || nt(language, "notify_commerce_store_fallback");
  const no = orderNo;
  switch (nextStatus) {
    case "accepted":
      return {
        title: nt(language, "notify_commerce_owner_status_accepted_title"),
        body: nt(language, "notify_commerce_owner_status_accepted_body", { store: s, orderNo: no }),
      };
    case "preparing":
      return {
        title: nt(language, "notify_commerce_owner_status_preparing_title"),
        body: nt(language, "notify_commerce_owner_status_preparing_body", { store: s, orderNo: no }),
      };
    case "ready_for_pickup":
      return {
        title: nt(language, "notify_commerce_owner_status_ready_title"),
        body: nt(language, "notify_commerce_owner_status_ready_body", { store: s, orderNo: no }),
      };
    case "delivering":
      return {
        title: nt(language, "notify_commerce_owner_status_delivering_title"),
        body: nt(language, "notify_commerce_owner_status_delivering_body", { store: s, orderNo: no }),
      };
    case "arrived":
      return {
        title: nt(language, "notify_commerce_owner_status_arrived_title"),
        body: nt(language, "notify_commerce_owner_status_arrived_body", { store: s, orderNo: no }),
      };
    case "completed":
      return {
        title: nt(language, "notify_commerce_owner_status_completed_title"),
        body: nt(language, "notify_commerce_owner_status_completed_body", { store: s, orderNo: no }),
      };
    case "cancelled":
      return {
        title: nt(language, "notify_commerce_owner_status_cancelled_title"),
        body: nt(language, "notify_commerce_owner_status_cancelled_body", { store: s, orderNo: no }),
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

  const language = await loadUserLanguage(sb, bid);
  const storeName = await loadStoreName(sb, opts.storeId);
  const label = storeName || nt(language, "notify_commerce_store_fallback");
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);
  const copy = buyerCopyForOwnerStatus(language, opts.nextStatus, label, orderNo);
  if (!copy) return;

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    domain: "order",
    ref_id: oid,
    title: copy.title,
    body: copy.body,
    link_url: BUYER_STORE_ORDERS_NOTIFICATION_HREF,
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

  const language = await loadUserLanguage(sb, bid);
  const storeName = await loadStoreName(sb, opts.storeId);
  const label = storeName || nt(language, "notify_commerce_store_fallback");
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    domain: "order",
    ref_id: oid,
    title: nt(language, "notify_commerce_payment_failed_title"),
    body: nt(language, "notify_commerce_payment_failed_body", { store: label, orderNo }),
    link_url: BUYER_STORE_ORDERS_NOTIFICATION_HREF,
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

  const language = await loadUserLanguage(sb, bid);
  const storeName = await loadStoreName(sb, opts.storeId);
  const label = storeName || nt(language, "notify_commerce_store_fallback");
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    domain: "order",
    ref_id: oid,
    title: nt(language, "notify_commerce_refund_processed_title"),
    body: nt(language, "notify_commerce_refund_processed_body", { store: label, orderNo }),
    link_url: BUYER_STORE_ORDERS_NOTIFICATION_HREF,
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

  const language = await loadUserLanguage(sb, bid);
  const storeName = await loadStoreName(sb, opts.storeId);
  const label = storeName || nt(language, "notify_commerce_store_fallback");
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    domain: "order",
    ref_id: oid,
    title: nt(language, "notify_commerce_auto_completed_title"),
    body: nt(language, "notify_commerce_auto_completed_body", { store: label, orderNo }),
    link_url: BUYER_STORE_ORDERS_NOTIFICATION_HREF,
    meta: { kind: "store_order_auto_completed", order_id: oid, order_no: orderNo, store_id: opts.storeId },
  });
}
