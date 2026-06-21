import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { buildOwnerStoreOrderNotificationHref } from "@/lib/business/owner-store-order-notification-href";
import { DEFAULT_APP_LANGUAGE, normalizeAppLanguage, type AppLanguageCode } from "@/lib/i18n/config";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { invalidateNotificationUnreadCountCache } from "@/lib/notifications/notification-unread-count-cache";
import { markOrderNotificationsRead } from "@/lib/notifications/pipeline/notify-read-service";
import { formatMoneyPhp } from "@/lib/utils/format";

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

  await markOrderNotificationsRead(sb, uid, oid);

  // Legacy notifications 호환 보조: badge/read truth 는 notification_events 이다.
  const { error } = await sb
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", uid)
    .eq("notification_type", "commerce")
    .eq("is_read", false)
    .eq("meta->>kind", BUYER_ORDER_STATUS_META_KIND)
    .or(`ref_id.eq.${oid},meta->>order_id.eq.${oid}`);

  if (error && !/does not exist|schema cache/i.test(String(error.message ?? ""))) {
    console.warn("[markPriorBuyerOrderStatusNotificationsRead]", error.message);
    return;
  }
  invalidateNotificationUnreadCountCache(uid);
}

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
  const storeName = await loadStoreName(sb, opts.storeId);
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
    title: nt(language, "notify_commerce_payment_done_title"),
    body: nt(language, "notify_commerce_payment_done_body", { store: label, orderNo }),
    link_url: BUYER_STORE_ORDERS_NOTIFICATION_HREF,
    meta: {
      kind: "store_order_payment_completed_buyer",
      order_id: oid,
      order_no: orderNo,
      store_id: opts.storeId.trim(),
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

/** 구매자 환불 요청 시 매장 오너에게 인앱 알림 */
export async function notifyStoreOwnerRefundRequested(
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
  const dedupe = `commerce:owner:refund_req:${oid}`;

  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: oid,
    ...(evTrim ? { store_order_event_id: evTrim } : {}),
    dedupe_key: dedupe,
    title: nt(language, "notify_commerce_refund_requested_title"),
    body: name
      ? nt(language, "notify_commerce_refund_requested_body_named", { store: name, orderNo })
      : nt(language, "notify_commerce_refund_requested_body", { orderNo }),
    link_url: buildOwnerStoreOrderNotificationHref({
      storeId: sid,
      orderId: oid,
      kind: "store_order_refund_requested",
      ackOwnerNotifications: true,
    }),
    meta: {
      kind: "store_order_refund_requested",
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
    estimatedPrepMinutes?: number | null;
    storeOrderEventId?: string | null;
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
    link_url: BUYER_STORE_ORDERS_NOTIFICATION_HREF,
    meta: {
      kind: BUYER_ORDER_STATUS_META_KIND,
      order_id: oid,
      order_no: orderNo,
      store_id: opts.storeId.trim(),
      order_status: opts.nextStatus,
      ...(opts.estimatedPrepMinutes != null
        ? { estimated_prep_minutes: Math.floor(Number(opts.estimatedPrepMinutes)) }
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
  const storeName = await loadStoreName(sb, opts.storeId);
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
    link_url: BUYER_STORE_ORDERS_NOTIFICATION_HREF,
    meta: {
      kind: "store_order_payment_failed",
      order_id: oid,
      order_no: orderNo,
      store_id: opts.storeId,
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
  const storeName = await loadStoreName(sb, opts.storeId);
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
    link_url: BUYER_STORE_ORDERS_NOTIFICATION_HREF,
    meta: {
      kind: "store_order_refund_approved",
      order_id: oid,
      order_no: orderNo,
      store_id: opts.storeId,
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
  const storeName = await loadStoreName(sb, opts.storeId);
  const label = storeName || nt(language, "notify_commerce_store_fallback");
  const orderNo = opts.orderNo.trim() || oid.slice(0, 8);

  const evTrim = (opts.storeOrderEventId ?? "").trim();
  const dedupe = `commerce:buyer:auto_complete:${oid}`;

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
    link_url: BUYER_STORE_ORDERS_NOTIFICATION_HREF,
    meta: {
      kind: "store_order_auto_completed",
      order_id: oid,
      order_no: orderNo,
      store_id: opts.storeId,
      ...(evTrim ? { store_order_event_id: evTrim } : {}),
    },
  });
}
