import type { AppLanguageCode } from "@/lib/i18n/config";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  notifySafeT,
  resolveInboxNotificationDisplayText,
} from "@/lib/notifications/notify-safe-translate";
import { formatMoneyPhp } from "@/lib/utils/format";

export type CommerceNotificationMeta = {
  kind?: string;
  order_no?: string;
  order_status?: string;
  store_display_name?: string;
  estimated_prep_minutes?: number;
  payment_amount?: number;
  line_count?: number;
  payment_label?: string;
  buyer_note_preview?: string;
  reminder_bucket_sec?: number;
  balance?: number;
  required?: number;
  fee_amount?: number;
  balance_after?: number;
  point_amount?: number;
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
    case "store_point_blocked":
      return "notify_store_point_blocked_title";
    case "store_point_deducted":
      return "notify_store_point_deducted_title";
    case "store_point_low":
      return "notify_store_point_low_title";
    case "store_point_charge_approved":
      return "notify_store_point_charge_approved_title";
    case "store_point_charge_rejected":
      return "notify_store_point_charge_rejected_title";
    case "store_point_charge_on_hold":
      return "notify_store_point_charge_on_hold_title";
    case "user_point_charge_approved":
      return "notify_user_point_charge_approved_title";
    case "user_point_charge_rejected":
      return "notify_user_point_charge_rejected_title";
    case "user_point_charge_on_hold":
      return "notify_user_point_charge_on_hold_title";
    case "store_point_account_replied":
      return "notify_store_point_account_replied_title";
    default:
      return null;
  }
}

function commerceBodyKey(kind: string, orderStatus: string): MessageKey | null {
  switch (kind) {
    case "store_order_created":
      return "notify_commerce_new_order_body_named";
    case "store_order_accept_reminder_30s":
    case "store_order_accept_reminder_60s":
      return "notify_commerce_owner_accept_reminder_body_named";
    case "store_order_payment_completed_buyer":
      return "notify_commerce_payment_done_body";
    case "store_order_payment_completed":
      return "notify_commerce_owner_payment_done_body_named";
    case "store_order_buyer_cancelled":
      return "notify_commerce_buyer_cancelled_body_named";
    case "store_order_refund_requested":
      return "notify_commerce_refund_requested_body_named";
    case "store_order_owner_status":
      return ownerStatusBodyKey(orderStatus);
    case "store_order_payment_failed":
      return "notify_commerce_payment_failed_body";
    case "store_order_refund_approved":
      return "notify_commerce_refund_processed_body";
    case "store_order_auto_completed":
      return "notify_commerce_auto_completed_body";
    case "store_point_blocked":
      return "notify_store_point_blocked_body";
    case "store_point_deducted":
      return "notify_store_point_deducted_body";
    case "store_point_low":
      return "notify_store_point_low_body";
    case "store_point_charge_approved":
      return "notify_store_point_charge_approved_body";
    case "store_point_charge_rejected":
      return "notify_store_point_charge_rejected_body";
    case "store_point_charge_on_hold":
      return "notify_store_point_charge_on_hold_body";
    case "user_point_charge_approved":
      return "notify_user_point_charge_approved_body";
    case "user_point_charge_rejected":
      return "notify_user_point_charge_rejected_body";
    case "user_point_charge_on_hold":
      return "notify_user_point_charge_on_hold_body";
    case "store_point_account_replied":
      return "notify_store_point_account_replied_body";
    default:
      return null;
  }
}

function metaNumber(meta: CommerceNotificationMeta, key: keyof CommerceNotificationMeta): number {
  const n = Number(meta[key] ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function commerceBodyVars(
  lang: AppLanguageCode,
  kind: string,
  meta: CommerceNotificationMeta,
  storedBody?: string | null
): Record<string, string | number> {
  const store = metaStoreLabel(meta, lang, storedBody);
  const orderNo = metaOrderNo(meta, storedBody);
  const amount = formatMoneyPhp(metaNumber(meta, "payment_amount"));
  const lineCount = Math.max(0, Math.floor(metaNumber(meta, "line_count")));
  const paymentLabel = typeof meta.payment_label === "string" ? meta.payment_label.trim() : "";
  const note = typeof meta.buyer_note_preview === "string" ? meta.buyer_note_preview.trim() : "";
  const extras: string[] = [];
  if (paymentLabel && paymentLabel !== "—") {
    extras.push(notifySafeT(lang, "notify_commerce_payment_prefix", { vars: { payment: paymentLabel } }));
  }
  if (note) {
    extras.push(notifySafeT(lang, "notify_commerce_request_prefix", { vars: { note } }));
  }
  const fallbackSec = kind === "store_order_accept_reminder_60s" ? 60 : 30;
  const seconds = Math.max(0, Math.floor(metaNumber(meta, "reminder_bucket_sec") || fallbackSec));
  return {
    store,
    orderNo,
    amount,
    lineCount,
    extra: extras.length ? ` · ${extras.join(" · ")}` : "",
    seconds,
    balance: Math.floor(metaNumber(meta, "balance") || metaNumber(meta, "balance_after")),
    required: Math.floor(metaNumber(meta, "required")),
    fee: Math.floor(metaNumber(meta, "fee_amount")),
    points: Math.floor(metaNumber(meta, "point_amount")),
  };
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
  const body = notifySafeT(lang, key, {
    vars: { ...commerceBodyVars(lang, kind, m, storedBody), store, orderNo },
  });
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
