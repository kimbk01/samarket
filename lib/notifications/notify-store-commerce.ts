import { loadNotificationUserLanguage } from "@/lib/notifications/notification-user-language";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { buildOwnerStoreOrderNotificationHref } from "@/lib/business/owner-store-order-notification-href";
import { buyerStoreOrderDetailPath } from "@/lib/delivery/customer/navigate-to-buyer-store-order-detail";
import { OwnerRoutes } from "@/lib/business/owner-routes";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { invalidateNotificationUnreadCountCache } from "@/lib/notifications/notification-unread-count-cache";
import { markOrderNotificationsRead } from "@/lib/notifications/pipeline/notify-read-service";
import { formatMoneyPhp } from "@/lib/utils/format";
import { STORE_ORDER_ACCEPT_TIMEOUT_MINUTES } from "@/lib/stores/store-order-lifecycle-automation";
import type { StoreOrderSystemPurpose } from "@/lib/stores/order-status-transitions";

const BUYER_COMMERCE_PUSH_KIND = "delivery" as const;
const BUYER_ORDER_STATUS_META_KIND = "store_order_owner_status";

/** 새 주문 상태 알림 전 — 동일 주문의 이전 미읽음 status 알림을 읽음 처리 */
export async function markPriorBuyerOrderStatusNotificationsRead(
  sb: SupabaseClient,
  userId: string,
  orderId: string
): Promise<void> {
  const uid = userId.trim();
  const oid = orderId.trim();
  if (!uid || !oid) return;

  // Gate 3 Step 10 — Canonical-only. Do not dual-write legacy `notifications`.
  await markOrderNotificationsRead(sb, uid, oid);
  invalidateNotificationUnreadCountCache(uid);
}

/** 구매자 알림 — 매장명 + 알림 사진(알림 표시 SSOT `store_image_url`, https 만) */
async function loadStoreIdentity(
  sb: SupabaseClient,
  storeId: string
): Promise<{ name: string; imageUrl: string | null }> {
  const { data } = await sb
    .from("stores")
    .select("store_name, profile_image_url")
    .eq("id", storeId.trim())
    .maybeSingle();
  const image = String((data?.profile_image_url as string) ?? "").trim();
  return {
    name: String((data?.store_name as string) ?? "").trim(),
    imageUrl: image.startsWith("https://") ? image : null,
  };
}

/**
 * FLW-06 — 이 주문의 취소가 「구매자 취소 요청 승인」인지 (문구 선택 전용 읽기).
 * 오너 직접 취소는 원장에 requested_role='owner' 로 남으므로 구매자 요청 승인과 구분된다.
 * 조회 실패 시 false → 기존 문구 그대로 (발송·내구성 경로는 바꾸지 않음).
 */
async function loadBuyerCancelRequestApproved(sb: SupabaseClient, orderId: string): Promise<boolean> {
  const { data, error } = await sb
    .from("store_order_cancel_requests")
    .select("id")
    .eq("order_id", orderId)
    .eq("requested_role", "buyer")
    .eq("status", "approved")
    .limit(1)
    .maybeSingle();
  if (error) return false;
  return Boolean((data as { id?: unknown } | null)?.id);
}

/** B-21 — 받는 사람 알림 언어는 공용 로더 하나로 판정(user_settings 우선 · profiles 폴백). */
const loadUserLanguage = loadNotificationUserLanguage;

function nt(
  language: AppLanguageCode,
  key: Parameters<typeof notifySafeT>[1],
  vars?: Record<string, string | number>
): string {
  return notifySafeT(language, key, { vars });
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
    /** 방금 삽입된 store_order_events 행 — 알림 인박스 DB 중복 방지 */
    storeOrderEventId?: string | null;
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

  const evTrim = (opts.storeOrderEventId ?? "").trim();
  const dedupe = `commerce:owner:new_order:${oid}`;

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: oid,
    ...(evTrim ? { store_order_event_id: evTrim } : {}),
    dedupe_key: dedupe,
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
    link_url: buildOwnerStoreOrderNotificationHref({
      storeId: sid,
      orderId: oid,
      kind: "store_order_created",
      ackOwnerNotifications: true,
    }),
    meta: {
      kind: "store_order_created",
      store_id: sid,
      order_id: oid,
      order_status: "pending",
      order_no: orderNo,
      payment_amount: Math.round(opts.paymentAmount),
      line_count: lines,
      ...(pay && pay !== "—" ? { payment_label: pay } : {}),
      ...(note ? { buyer_note_preview: note } : {}),
      ...(evTrim ? { store_order_event_id: evTrim } : {}),
    },
  });
}

/** 주문 재고 차감으로 상품이 품절 처리될 때 매장 오너에게 인앱 알림 */
export async function notifyStoreOwnerProductSoldOutFromOrder(
  sb: SupabaseClient,
  opts: {
    storeId: string;
    orderId: string;
    orderNo: string;
    productId: string;
    productTitle?: string;
    ownerUserId: string;
    storeName?: string;
  }
): Promise<void> {
  const sid = opts.storeId.trim();
  const oid = opts.orderId.trim();
  const pid = opts.productId.trim();
  const ownerId = opts.ownerUserId.trim();
  if (!sid || !oid || !pid || !ownerId) return;

  const language = await loadUserLanguage(sb, ownerId);
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);
  const productTitle =
    (opts.productTitle ?? "").trim() || nt(language, "notify_commerce_store_fallback");
  const storeName = (opts.storeName ?? "").trim();
  const dedupe = `commerce:owner:sold_out:${oid}:${pid}`;

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: oid,
    dedupe_key: dedupe,
    title: nt(language, "notify_commerce_owner_sold_out_title"),
    body: storeName
      ? nt(language, "notify_commerce_owner_sold_out_body_named", {
          store: storeName,
          productTitle,
          orderNo,
        })
      : nt(language, "notify_commerce_owner_sold_out_body", {
          productTitle,
          orderNo,
        }),
    link_url: OwnerRoutes.products(sid),
    meta: {
      kind: "store_order_sold_out",
      store_id: sid,
      order_id: oid,
      order_no: orderNo,
      product_id: pid,
      product_title: productTitle,
    },
  });
}

/** 미접수 주문 서버 리마인드 (30s/60s bucket). */
export async function notifyStoreOwnerAcceptReminder(
  sb: SupabaseClient,
  opts: {
    storeId: string;
    orderId: string;
    orderNo: string;
    paymentAmount: number;
    lineCount: number;
    reminderBucketSec: 30 | 60;
    storeName?: string;
    storeOrderEventId?: string | null;
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
  const bucketSec = opts.reminderBucketSec;
  const evTrim = (opts.storeOrderEventId ?? "").trim();
  const kind =
    bucketSec === 30 ? "store_order_accept_reminder_30s" : "store_order_accept_reminder_60s";
  const dedupe = `commerce:owner:accept_reminder:${oid}:${bucketSec}s`;

  const title = nt(language, "notify_commerce_owner_accept_reminder_title");
  const bodyNamed = nt(language, "notify_commerce_owner_accept_reminder_body_named", {
    store: name,
    orderNo,
    amount: amt,
    lineCount: lines,
    seconds: bucketSec,
  });
  const body = nt(language, "notify_commerce_owner_accept_reminder_body", {
    orderNo,
    amount: amt,
    lineCount: lines,
    seconds: bucketSec,
  });

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: oid,
    ...(evTrim ? { store_order_event_id: evTrim } : {}),
    dedupe_key: dedupe,
    title,
    body: name ? bodyNamed : body,
    link_url: buildOwnerStoreOrderNotificationHref({
      storeId: sid,
      orderId: oid,
      kind,
      ackOwnerNotifications: true,
    }),
    meta: {
      kind,
      store_id: sid,
      order_id: oid,
      order_status: "pending",
      order_no: orderNo,
      payment_amount: Math.round(opts.paymentAmount),
      line_count: lines,
      reminder_bucket_sec: bucketSec,
      ...(evTrim ? { store_order_event_id: evTrim } : {}),
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
    storeOrderEventId?: string | null;
  }
): Promise<void> {
  const bid = opts.buyerUserId.trim();
  const oid = opts.orderId.trim();
  if (!bid || !oid) return;

  const language = await loadUserLanguage(sb, bid);
  const { name: storeName, imageUrl: storeImageUrl } = await loadStoreIdentity(sb, opts.storeId);
  const label = storeName || nt(language, "notify_commerce_store_fallback");
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  const evTrim = (opts.storeOrderEventId ?? "").trim();
  const dedupe = `commerce:buyer:payment_ok:${oid}`;

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    domain: "order",
    ref_id: oid,
    push_kind: BUYER_COMMERCE_PUSH_KIND,
    ...(evTrim ? { store_order_event_id: evTrim } : {}),
    dedupe_key: dedupe,
    title: nt(language, "notify_commerce_payment_done_title", { store: label }),
    body: nt(language, "notify_commerce_payment_done_body", { store: label, orderNo }),
    link_url: buyerStoreOrderDetailPath(oid),
    meta: {
      kind: "store_order_payment_completed_buyer",
      order_id: oid,
      order_no: orderNo,
      // 알림센터 재표시용 — 제목에 매장명이 들어간다 (4절 문구)
      store_display_name: label,
      store_id: opts.storeId.trim(),
      ...(storeImageUrl ? { store_image_url: storeImageUrl } : {}),
      ...(evTrim ? { store_order_event_id: evTrim } : {}),
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
    storeOrderEventId?: string | null;
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

  const evTrim = (opts.storeOrderEventId ?? "").trim();
  const dedupe = `commerce:owner:payment_ok:${oid}`;

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: oid,
    ...(evTrim ? { store_order_event_id: evTrim } : {}),
    dedupe_key: dedupe,
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
    link_url: buildOwnerStoreOrderNotificationHref({
      storeId: sid,
      orderId: oid,
      kind: "store_order_payment_completed",
      ackOwnerNotifications: true,
    }),
    meta: {
      kind: "store_order_payment_completed",
      store_id: sid,
      order_id: oid,
      order_no: orderNo,
      ...(evTrim ? { store_order_event_id: evTrim } : {}),
    },
  });
}

/** 구매자가 접수 전 취소 시 오너 */
/** 미접수 자동 취소(SYSTEM accept_timeout) — 매장 오너 */
export async function notifyStoreOwnerAcceptTimeoutCancelled(
  sb: SupabaseClient,
  opts: {
    storeId: string;
    orderId: string;
    orderNo: string;
    storeOrderEventId?: string | null;
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
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);
  const evTrim = (opts.storeOrderEventId ?? "").trim();
  const kind = "store_order_accept_timeout_cancelled";

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: oid,
    ...(evTrim ? { store_order_event_id: evTrim } : {}),
    dedupe_key: `commerce:owner:accept_timeout:${oid}`,
    title: nt(language, "notify_commerce_owner_accept_timeout_title"),
    body: nt(language, "notify_commerce_owner_accept_timeout_body", {
      orderNo,
      minutes: STORE_ORDER_ACCEPT_TIMEOUT_MINUTES,
    }),
    link_url: buildOwnerStoreOrderNotificationHref({
      storeId: sid,
      orderId: oid,
      kind,
      ackOwnerNotifications: true,
    }),
    meta: {
      kind,
      store_id: sid,
      order_id: oid,
      order_status: "cancelled",
      order_no: orderNo,
      ...(evTrim ? { store_order_event_id: evTrim } : {}),
    },
  });
}

export async function notifyStoreOwnerBuyerCancelled(
  sb: SupabaseClient,
  opts: {
    storeId: string;
    orderId: string;
    orderNo: string;
    storeName?: string;
    storeOrderEventId?: string | null;
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

  const evTrim = (opts.storeOrderEventId ?? "").trim();
  const dedupe = `commerce:owner:buyer_cancel:${oid}`;

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: oid,
    ...(evTrim ? { store_order_event_id: evTrim } : {}),
    dedupe_key: dedupe,
    title: nt(language, "notify_commerce_buyer_cancelled_title"),
    body: name
      ? nt(language, "notify_commerce_buyer_cancelled_body_named", { store: name, orderNo })
      : nt(language, "notify_commerce_buyer_cancelled_body", { orderNo }),
    link_url: buildOwnerStoreOrderNotificationHref({
      storeId: sid,
      orderId: oid,
      kind: "store_order_buyer_cancelled",
      ackOwnerNotifications: true,
    }),
    meta: {
      kind: "store_order_buyer_cancelled",
      store_id: sid,
      order_id: oid,
      order_no: orderNo,
      ...(evTrim ? { store_order_event_id: evTrim } : {}),
    },
  });
}

/**
 * 매장 결정이 필요한 고객 요청(환불 요청 · 진행 중 취소 요청) — 매장 오너 인앱 알림.
 * `request: "cancel"` 은 같은 알림 종류(`store_order_refund_requested`)에 취소 요청 문구와
 * `meta.request_type` 을 싣는다 (배지·소리·링크 계약 재사용).
 */
export async function notifyStoreOwnerRefundRequested(
  sb: SupabaseClient,
  opts: {
    storeId: string;
    orderId: string;
    orderNo: string;
    storeName?: string;
    storeOrderEventId?: string | null;
    request?: "refund" | "cancel";
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

  const evTrim = (opts.storeOrderEventId ?? "").trim();
  const cancel = opts.request === "cancel";
  // A rejected request may be sent again — one notification per request event.
  const dedupe = cancel
    ? `commerce:owner:cancel_req:${oid}:${evTrim || "x"}`
    : `commerce:owner:refund_req:${oid}`;

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: oid,
    ...(evTrim ? { store_order_event_id: evTrim } : {}),
    dedupe_key: dedupe,
    title: nt(language, cancel ? "notify_commerce_cancel_requested_title" : "notify_commerce_refund_requested_title"),
    body: name
      ? nt(language, cancel ? "notify_commerce_cancel_requested_body_named" : "notify_commerce_refund_requested_body_named", {
          store: name,
          orderNo,
        })
      : nt(language, cancel ? "notify_commerce_cancel_requested_body" : "notify_commerce_refund_requested_body", { orderNo }),
    link_url: buildOwnerStoreOrderNotificationHref({
      storeId: sid,
      orderId: oid,
      kind: "store_order_refund_requested",
      ackOwnerNotifications: true,
    }),
    meta: {
      kind: "store_order_refund_requested",
      request_type: cancel ? "cancel" : "refund",
      store_id: sid,
      order_id: oid,
      order_no: orderNo,
      ...(evTrim ? { store_order_event_id: evTrim } : {}),
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
        title: nt(language, "notify_commerce_owner_status_accepted_title", { store: s }),
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
    estimatedPrepMinutes?: number | null;
    storeOrderEventId?: string | null;
    /** ADMIN 이면 「매장이 처리」가 아닌 관리자 처리 문구 (DEF-72) */
    actor?: "ADMIN" | "OWNER" | "CUSTOMER" | "SYSTEM";
    /** SYSTEM accept_timeout 취소는 「매장이 취소」가 아닌 미접수 자동 취소 문구 · delivery_sync 는 배달 완료 문구 */
    systemPurpose?: StoreOrderSystemPurpose;
    /** 매장 직접 취소 사유 — 구매자에게 원문 그대로(최대 500자) 전달 (ORD-09 · D-22) */
    cancelReason?: string | null;
  }
): Promise<void> {
  const bid = opts.buyerUserId.trim();
  const oid = opts.orderId.trim();
  if (!bid || !oid) return;
  if (!OWNER_STATUS_NOTIFY.has(opts.nextStatus)) return;

  const language = await loadUserLanguage(sb, bid);
  const { name: storeName, imageUrl: storeImageUrl } = await loadStoreIdentity(sb, opts.storeId);
  const label = storeName || nt(language, "notify_commerce_store_fallback");
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);
  const cancelReason =
    opts.nextStatus === "cancelled" && opts.actor === "OWNER" ? truncateNote(opts.cancelReason, 500) : "";
  /** FLW-06 — 매장(또는 재조정 경로)의 「구매자 취소 요청 승인」은 「매장에 의해 취소」가 아닌 승인 문구 */
  const buyerRequestApproved =
    opts.nextStatus === "cancelled" &&
    !cancelReason &&
    opts.actor !== "ADMIN" &&
    opts.actor !== "SYSTEM" &&
    (await loadBuyerCancelRequestApproved(sb, oid));
  const copy =
    buyerRequestApproved
      ? {
          title: nt(language, "notify_commerce_owner_status_cancelled_title"),
          body: nt(language, "notify_commerce_cancel_request_approved_body", { store: label, orderNo }),
        }
      : cancelReason
      ? {
          title: nt(language, "notify_commerce_owner_status_cancelled_title"),
          body: nt(language, "notify_commerce_owner_status_cancelled_body_reason", {
            store: label,
            orderNo,
            reason: cancelReason,
          }),
        }
      : opts.actor === "SYSTEM" && opts.systemPurpose === "delivery_sync" && opts.nextStatus === "arrived"
        ? {
            title: nt(language, "notify_commerce_delivery_sync_arrived_title"),
            body: nt(language, "notify_commerce_delivery_sync_arrived_body", { store: label, orderNo }),
          }
        : opts.actor === "ADMIN" && opts.nextStatus === "cancelled"
      ? {
          title: nt(language, "notify_commerce_owner_status_cancelled_title"),
          body: nt(language, "notify_commerce_admin_cancelled_body", { store: label, orderNo }),
        }
      : opts.actor === "SYSTEM" &&
          opts.systemPurpose === "accept_timeout" &&
          opts.nextStatus === "cancelled"
        ? {
            title: nt(language, "notify_commerce_owner_status_cancelled_title"),
            body: nt(language, "notify_commerce_accept_timeout_cancelled_body", {
              store: label,
              orderNo,
              minutes: STORE_ORDER_ACCEPT_TIMEOUT_MINUTES,
            }),
          }
        : buyerCopyForOwnerStatus(language, opts.nextStatus, label, orderNo);
  if (!copy) return;
  const etaSuffix =
    opts.nextStatus === "accepted" &&
    opts.estimatedPrepMinutes != null &&
    Number.isFinite(Number(opts.estimatedPrepMinutes)) &&
    Number(opts.estimatedPrepMinutes) > 0
      ? nt(language, "notify_commerce_eta_suffix", {
          minutes: Math.floor(Number(opts.estimatedPrepMinutes)),
        })
      : "";

  const evTrim = (opts.storeOrderEventId ?? "").trim();
  const dedupe = `commerce:buyer:owner_status:${oid}:${opts.nextStatus}`;

  await markPriorBuyerOrderStatusNotificationsRead(sb, bid, oid);

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    domain: "order",
    ref_id: oid,
    push_kind: BUYER_COMMERCE_PUSH_KIND,
    ...(evTrim ? { store_order_event_id: evTrim } : {}),
    dedupe_key: dedupe,
    title: copy.title,
    body: `${copy.body}${etaSuffix}`,
    link_url: buyerStoreOrderDetailPath(oid),
    meta: {
      kind: BUYER_ORDER_STATUS_META_KIND,
      order_id: oid,
      order_no: orderNo,
      store_id: opts.storeId.trim(),
      ...(storeImageUrl ? { store_image_url: storeImageUrl } : {}),
      order_status: opts.nextStatus,
      ...(opts.estimatedPrepMinutes != null
        ? { estimated_prep_minutes: Math.floor(Number(opts.estimatedPrepMinutes)) }
        : {}),
      ...(cancelReason ? { cancel_reason: cancelReason } : {}),
      /** 알림함 재번역용 — 취소 주체·시스템 문구 (NTF-02 · ORD-09 · J-1) */
      ...(opts.nextStatus === "cancelled"
        ? {
            cancel_by: buyerRequestApproved
              ? "buyer_request"
              : cancelReason
              ? "owner"
              : opts.actor === "ADMIN"
                ? "admin"
                : opts.actor === "SYSTEM" && opts.systemPurpose === "accept_timeout"
                  ? "accept_timeout"
                  : "owner",
            ...(opts.actor === "SYSTEM" && opts.systemPurpose === "accept_timeout"
              ? { timeout_minutes: STORE_ORDER_ACCEPT_TIMEOUT_MINUTES }
              : {}),
          }
        : {}),
      ...(opts.actor === "SYSTEM" && opts.systemPurpose === "delivery_sync" && opts.nextStatus === "arrived"
        ? { system_purpose: "delivery_sync" }
        : {}),
      store_display_name: label,
      ...(evTrim ? { store_order_event_id: evTrim } : {}),
    },
  });
}

/** 결제 실패(pending→failed) 시 구매자 */
export async function notifyBuyerStorePaymentFailed(
  sb: SupabaseClient,
  opts: {
    buyerUserId: string;
    orderId: string;
    orderNo: string;
    storeId: string;
    storeOrderEventId?: string | null;
  }
): Promise<void> {
  const bid = opts.buyerUserId.trim();
  const oid = opts.orderId.trim();
  if (!bid || !oid) return;

  const language = await loadUserLanguage(sb, bid);
  const { name: storeName, imageUrl: storeImageUrl } = await loadStoreIdentity(sb, opts.storeId);
  const label = storeName || nt(language, "notify_commerce_store_fallback");
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  const evTrim = (opts.storeOrderEventId ?? "").trim();
  const dedupe = `commerce:buyer:payment_failed:${oid}`;

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    domain: "order",
    ref_id: oid,
    push_kind: BUYER_COMMERCE_PUSH_KIND,
    ...(evTrim ? { store_order_event_id: evTrim } : {}),
    dedupe_key: dedupe,
    title: nt(language, "notify_commerce_payment_failed_title"),
    body: nt(language, "notify_commerce_payment_failed_body", { store: label, orderNo }),
    link_url: buyerStoreOrderDetailPath(oid),
    meta: {
      kind: "store_order_payment_failed",
      order_id: oid,
      order_no: orderNo,
      store_id: opts.storeId,
      ...(storeImageUrl ? { store_image_url: storeImageUrl } : {}),
      ...(evTrim ? { store_order_event_id: evTrim } : {}),
    },
  });
}

/** 관리자 환불 승인 후 구매자 */
export async function notifyBuyerStoreRefundApproved(
  sb: SupabaseClient,
  opts: {
    buyerUserId: string;
    orderId: string;
    orderNo: string;
    storeId: string;
    storeOrderEventId?: string | null;
  }
): Promise<void> {
  const bid = opts.buyerUserId.trim();
  const oid = opts.orderId.trim();
  if (!bid || !oid) return;

  const language = await loadUserLanguage(sb, bid);
  const { name: storeName, imageUrl: storeImageUrl } = await loadStoreIdentity(sb, opts.storeId);
  const label = storeName || nt(language, "notify_commerce_store_fallback");
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  const evTrim = (opts.storeOrderEventId ?? "").trim();
  const dedupe = `commerce:buyer:refund_ok:${oid}`;

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    domain: "order",
    ref_id: oid,
    push_kind: BUYER_COMMERCE_PUSH_KIND,
    ...(evTrim ? { store_order_event_id: evTrim } : {}),
    dedupe_key: dedupe,
    title: nt(language, "notify_commerce_refund_processed_title"),
    body: nt(language, "notify_commerce_refund_processed_body", { store: label, orderNo }),
    link_url: buyerStoreOrderDetailPath(oid),
    meta: {
      kind: "store_order_refund_approved",
      order_id: oid,
      order_no: orderNo,
      store_id: opts.storeId,
      ...(storeImageUrl ? { store_image_url: storeImageUrl } : {}),
      ...(evTrim ? { store_order_event_id: evTrim } : {}),
    },
  });
}

/** 환불 요청 · 취소 요청 반려(매장 또는 관리자) 후 구매자 — 금액/재고/상품권 복구 없음 */
export async function notifyBuyerStoreRefundRejected(
  sb: SupabaseClient,
  opts: {
    buyerUserId: string;
    orderId: string;
    orderNo: string;
    storeId: string;
    reason?: string | null;
    storeOrderEventId?: string | null;
    request?: "refund" | "cancel";
  }
): Promise<void> {
  const bid = opts.buyerUserId.trim();
  const oid = opts.orderId.trim();
  if (!bid || !oid) return;

  const language = await loadUserLanguage(sb, bid);
  const { name: storeName, imageUrl: storeImageUrl } = await loadStoreIdentity(sb, opts.storeId);
  const label = storeName || nt(language, "notify_commerce_store_fallback");
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);
  const reason = truncateNote(opts.reason, 120);

  const evTrim = (opts.storeOrderEventId ?? "").trim();
  const cancel = opts.request === "cancel";
  const dedupe = cancel
    ? `commerce:buyer:cancel_rejected:${oid}:${evTrim || "x"}`
    : `commerce:buyer:refund_rejected:${oid}`;

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    domain: "order",
    ref_id: oid,
    push_kind: BUYER_COMMERCE_PUSH_KIND,
    ...(evTrim ? { store_order_event_id: evTrim } : {}),
    dedupe_key: dedupe,
    title: nt(language, cancel ? "notify_commerce_cancel_rejected_title" : "notify_commerce_refund_rejected_title"),
    body: reason
      ? nt(language, cancel ? "notify_commerce_cancel_rejected_body_reason" : "notify_commerce_refund_rejected_body_reason", {
          store: label,
          orderNo,
          reason,
        })
      : nt(language, cancel ? "notify_commerce_cancel_rejected_body" : "notify_commerce_refund_rejected_body", {
          store: label,
          orderNo,
        }),
    link_url: buyerStoreOrderDetailPath(oid),
    meta: {
      kind: "store_order_refund_rejected",
      request_type: cancel ? "cancel" : "refund",
      order_id: oid,
      order_no: orderNo,
      store_id: opts.storeId,
      ...(storeImageUrl ? { store_image_url: storeImageUrl } : {}),
      ...(reason ? { rejected_reason: reason } : {}),
      ...(evTrim ? { store_order_event_id: evTrim } : {}),
    },
  });
}

/** 크론 자동 구매확정 시 구매자 */
export async function notifyBuyerStoreOrderAutoCompleted(
  sb: SupabaseClient,
  opts: {
    buyerUserId: string;
    orderId: string;
    orderNo: string;
    storeId: string;
    storeOrderEventId?: string | null;
  }
): Promise<void> {
  const bid = opts.buyerUserId.trim();
  const oid = opts.orderId.trim();
  if (!bid || !oid) return;

  const language = await loadUserLanguage(sb, bid);
  const { name: storeName, imageUrl: storeImageUrl } = await loadStoreIdentity(sb, opts.storeId);
  const label = storeName || nt(language, "notify_commerce_store_fallback");
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  const evTrim = (opts.storeOrderEventId ?? "").trim();
  const dedupe = `commerce:buyer:auto_complete:${oid}`;

  // N-09 — 주문당 구매자 미읽음 1건 (status-event-read-lifecycle): 배달완료 등 이전 상태 알림 읽음
  await markPriorBuyerOrderStatusNotificationsRead(sb, bid, oid);

  await appendUserNotification(sb, {
    user_id: bid,
    notification_type: "commerce",
    domain: "order",
    ref_id: oid,
    push_kind: BUYER_COMMERCE_PUSH_KIND,
    ...(evTrim ? { store_order_event_id: evTrim } : {}),
    dedupe_key: dedupe,
    title: nt(language, "notify_commerce_auto_completed_title"),
    body: nt(language, "notify_commerce_auto_completed_body", { store: label, orderNo }),
    link_url: buyerStoreOrderDetailPath(oid),
    meta: {
      kind: "store_order_auto_completed",
      order_id: oid,
      order_no: orderNo,
      store_id: opts.storeId,
      ...(storeImageUrl ? { store_image_url: storeImageUrl } : {}),
      ...(evTrim ? { store_order_event_id: evTrim } : {}),
    },
  });
}
