import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  notifySafeT,
  resolveInboxNotificationDisplayText,
} from "@/lib/notifications/notify-safe-translate";

export type CommerceNotificationMeta = {
  kind?: string;
  order_no?: string;
  order_status?: string;
  store_display_name?: string;
  estimated_prep_minutes?: number;
};

function metaStoreLabel(
  meta: CommerceNotificationMeta,
  lang: AppLanguageCode,
  storedBody?: string | null
): string {
  const name = typeof meta.store_display_name === "string" ? meta.store_display_name.trim() : "";
  if (name) return name;
  const raw = (storedBody ?? "").trim();
  const fromBody = raw.match(/「([^」]+)」/);
  if (fromBody?.[1]?.trim()) return fromBody[1].trim();
  const fromAscii = raw.match(/"([^"]+)"/);
  if (fromAscii?.[1]?.trim()) return fromAscii[1].trim();
  return notifySafeT(lang, "notify_commerce_store_fallback");
}

function metaOrderNo(meta: CommerceNotificationMeta, storedBody?: string | null): string {
  const fromMeta = typeof meta.order_no === "string" ? meta.order_no.trim() : "";
  if (fromMeta) return fromMeta;
  const raw = (storedBody ?? "").trim();
  const m = raw.match(/\b(SO[0-9a-f]+)\b/i);
  return m?.[1] ?? "";
}

function ownerStatusTitleKey(status: string): MessageKey | null {
  switch (status) {
    case "accepted":
      return "notify_commerce_owner_status_accepted_title";
    case "preparing":
      return "notify_commerce_owner_status_preparing_title";
    case "ready_for_pickup":
      return "notify_commerce_owner_status_ready_title";
    case "delivering":
      return "notify_commerce_owner_status_delivering_title";
    case "arrived":
      return "notify_commerce_owner_status_arrived_title";
    case "completed":
      return "notify_commerce_owner_status_completed_title";
    case "cancelled":
      return "notify_commerce_owner_status_cancelled_title";
    default:
      return null;
  }
}

function ownerStatusBodyKey(status: string): MessageKey | null {
  switch (status) {
    case "accepted":
      return "notify_commerce_owner_status_accepted_body";
    case "preparing":
      return "notify_commerce_owner_status_preparing_body";
    case "ready_for_pickup":
      return "notify_commerce_owner_status_ready_body";
    case "delivering":
      return "notify_commerce_owner_status_delivering_body";
    case "arrived":
      return "notify_commerce_owner_status_arrived_body";
    case "completed":
      return "notify_commerce_owner_status_completed_body";
    case "cancelled":
      return "notify_commerce_owner_status_cancelled_body";
    default:
      return null;
  }
}

function commerceTitleKey(kind: string, orderStatus: string): MessageKey | null {
  switch (kind) {
    case "store_order_created":
    case "store_order_accept_reminder_30s":
    case "store_order_accept_reminder_60s":
      return "notify_commerce_new_order_title";
    case "store_order_payment_completed_buyer":
      return "notify_commerce_payment_done_title";
    case "store_order_payment_completed":
      return "notify_commerce_owner_payment_done_title";
    case "store_order_buyer_cancelled":
      return "notify_commerce_buyer_cancelled_title";
    case "store_order_refund_requested":
      return "notify_commerce_refund_requested_title";
    case "store_order_owner_status":
      return ownerStatusTitleKey(orderStatus);
    case "store_order_payment_failed":
      return "notify_commerce_payment_failed_title";
    case "store_order_refund_approved":
      return "notify_commerce_refund_processed_title";
    case "store_order_auto_completed":
      return "notify_commerce_auto_completed_title";
    default:
      return null;
  }
}

function commerceBodyKey(kind: string, orderStatus: string): MessageKey | null {
  switch (kind) {
    case "store_order_payment_completed_buyer":
      return "notify_commerce_payment_done_body";
    case "store_order_owner_status":
      return ownerStatusBodyKey(orderStatus);
    case "store_order_payment_failed":
      return "notify_commerce_payment_failed_body";
    case "store_order_refund_approved":
      return "notify_commerce_refund_processed_body";
    case "store_order_auto_completed":
      return "notify_commerce_auto_completed_body";
    default:
      return null;
  }
}

function acceptedEtaSuffix(lang: AppLanguageCode, meta: CommerceNotificationMeta): string {
  if (meta.order_status !== "accepted") return "";
  const mins = Math.floor(Number(meta.estimated_prep_minutes ?? 0));
  if (!Number.isFinite(mins) || mins <= 0) return "";
  return notifySafeT(lang, "notify_commerce_eta_suffix", { vars: { minutes: mins } });
}

/** DB 저장 문장 대신 meta.kind 기준 UI 언어로 재번역 (commerce 알림) */
export function resolveCommerceNotificationInboxTitle(
  lang: AppLanguageCode,
  meta: Record<string, unknown> | null,
  storedTitle: string,
  storedBody?: string | null
): string {
  const m = (meta ?? {}) as CommerceNotificationMeta;
  const kind = typeof m.kind === "string" ? m.kind : "";
  const key = commerceTitleKey(kind, String(m.order_status ?? ""));
  if (!key) return resolveInboxNotificationDisplayText(lang, storedTitle);

  const store = metaStoreLabel(m, lang, storedBody);
  const orderNo = metaOrderNo(m, storedBody);
  return notifySafeT(lang, key, { vars: { store, orderNo } });
}

export function resolveCommerceNotificationInboxBody(
  lang: AppLanguageCode,
  meta: Record<string, unknown> | null,
  storedBody: string | null
): string | null {
  const raw = (storedBody ?? "").trim();
  const m = (meta ?? {}) as CommerceNotificationMeta;
  const kind = typeof m.kind === "string" ? m.kind : "";
  const key = commerceBodyKey(kind, String(m.order_status ?? ""));

  if (!key) {
    if (!raw) return null;
    return resolveInboxNotificationDisplayText(lang, raw);
  }

  const store = metaStoreLabel(m, lang, storedBody);
  const orderNo = metaOrderNo(m, storedBody);
  const body = notifySafeT(lang, key, { vars: { store, orderNo } });
  if (kind === "store_order_owner_status") {
    return `${body}${acceptedEtaSuffix(lang, m)}`;
  }
  return body;
}

export function resolveNotificationInboxTitle(
  lang: AppLanguageCode,
  row: {
    notification_type: string;
    title: string;
    body?: string | null;
    meta?: Record<string, unknown> | null;
  }
): string {
  if (row.notification_type === "commerce") {
    return resolveCommerceNotificationInboxTitle(
      lang,
      row.meta ?? null,
      row.title,
      row.body ?? null
    );
  }
  return resolveInboxNotificationDisplayText(lang, row.title);
}

export function resolveNotificationInboxBody(
  lang: AppLanguageCode,
  row: {
    notification_type: string;
    body: string | null;
    meta?: Record<string, unknown> | null;
  }
): string | null {
  if (row.notification_type === "commerce") {
    return resolveCommerceNotificationInboxBody(lang, row.meta ?? null, row.body);
  }
  const raw = (row.body ?? "").trim();
  if (!raw) return null;
  return resolveInboxNotificationDisplayText(lang, raw);
}
