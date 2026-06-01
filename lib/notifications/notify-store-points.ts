import type { SupabaseClient } from "@supabase/supabase-js";
import { appendUserNotification } from "@/lib/notifications/append-user-notification";
import { DEFAULT_APP_LANGUAGE, normalizeAppLanguage, type AppLanguageCode } from "@/lib/i18n/config";
import { notifySafeT } from "@/lib/notifications/notify-safe-translate";
import { OwnerRoutes } from "@/lib/business/owner-routes";

async function loadUserLanguage(sb: SupabaseClient, userId: string): Promise<AppLanguageCode> {
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

export async function notifyStoreOwnerPointBlocked(
  sb: SupabaseClient,
  opts: {
    storeId: string;
    ownerUserId: string;
    balance: number;
    required: number;
  }
): Promise<void> {
  const ownerId = opts.ownerUserId.trim();
  const sid = opts.storeId.trim();
  if (!ownerId || !sid) return;
  const language = await loadUserLanguage(sb, ownerId);
  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: sid,
    dedupe_key: `store_point_blocked:${sid}`,
    title: nt(language, "notify_store_point_blocked_title"),
    body: nt(language, "notify_store_point_blocked_body", {
      balance: opts.balance,
      required: opts.required,
    }),
    link_url: OwnerRoutes.points(sid),
    meta: { kind: "store_point_blocked", store_id: sid, balance: opts.balance, required: opts.required },
  });
}

export async function notifyStoreOwnerPointDeducted(
  sb: SupabaseClient,
  opts: {
    storeId: string;
    ownerUserId: string;
    orderId: string;
    feeAmount: number;
    balanceAfter: number;
  }
): Promise<void> {
  const ownerId = opts.ownerUserId.trim();
  if (!ownerId) return;
  const language = await loadUserLanguage(sb, ownerId);
  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: opts.orderId,
    dedupe_key: `store_point_deduct:${opts.orderId}`,
    title: nt(language, "notify_store_point_deducted_title"),
    body: nt(language, "notify_store_point_deducted_body", {
      fee: opts.feeAmount,
      balance: opts.balanceAfter,
    }),
    link_url: OwnerRoutes.orders(opts.storeId),
    meta: {
      kind: "store_point_deducted",
      store_id: opts.storeId,
      order_id: opts.orderId,
      fee_amount: opts.feeAmount,
      balance_after: opts.balanceAfter,
    },
  });
}

export async function notifyStoreOwnerPointLowWarning(
  sb: SupabaseClient,
  opts: { storeId: string; ownerUserId: string; balance: number }
): Promise<void> {
  const ownerId = opts.ownerUserId.trim();
  const sid = opts.storeId.trim();
  if (!ownerId || !sid) return;
  const language = await loadUserLanguage(sb, ownerId);
  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: sid,
    dedupe_key: `store_point_low:${sid}`,
    title: nt(language, "notify_store_point_low_title"),
    body: nt(language, "notify_store_point_low_body", { balance: opts.balance }),
    link_url: OwnerRoutes.points(sid),
    meta: { kind: "store_point_low", store_id: sid, balance: opts.balance },
  });
}

export async function notifyStoreOwnerPointChargeApproved(
  sb: SupabaseClient,
  opts: { storeId: string; ownerUserId: string; pointAmount: number; balanceAfter: number; requestId: string }
): Promise<void> {
  const ownerId = opts.ownerUserId.trim();
  if (!ownerId) return;
  const language = await loadUserLanguage(sb, ownerId);
  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: opts.requestId,
    dedupe_key: `store_point_charge_ok:${opts.requestId}`,
    title: nt(language, "notify_store_point_charge_approved_title"),
    body: nt(language, "notify_store_point_charge_approved_body", {
      points: opts.pointAmount,
      balance: opts.balanceAfter,
    }),
    link_url: OwnerRoutes.points(opts.storeId),
    meta: {
      kind: "store_point_charge_approved",
      store_id: opts.storeId,
      point_amount: opts.pointAmount,
      balance_after: opts.balanceAfter,
    },
  });
}

export async function notifyStoreOwnerPointChargeRejected(
  sb: SupabaseClient,
  opts: { storeId: string; ownerUserId: string; requestId: string }
): Promise<void> {
  const ownerId = opts.ownerUserId.trim();
  if (!ownerId) return;
  const language = await loadUserLanguage(sb, ownerId);
  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: opts.requestId,
    dedupe_key: `store_point_charge_reject:${opts.requestId}`,
    title: nt(language, "notify_store_point_charge_rejected_title"),
    body: nt(language, "notify_store_point_charge_rejected_body"),
    link_url: OwnerRoutes.points(opts.storeId),
    meta: { kind: "store_point_charge_rejected", store_id: opts.storeId, request_id: opts.requestId },
  });
}

export async function notifyStoreOwnerPointAccountReplied(
  sb: SupabaseClient,
  opts: { storeId: string; ownerUserId: string; inquiryId: string }
): Promise<void> {
  const ownerId = opts.ownerUserId.trim();
  const sid = opts.storeId.trim();
  if (!ownerId || !sid) return;
  const language = await loadUserLanguage(sb, ownerId);
  await appendUserNotification(sb, {
    user_id: ownerId,
    notification_type: "commerce",
    domain: "store",
    ref_id: opts.inquiryId,
    dedupe_key: `store_point_account_replied:${opts.inquiryId}`,
    title: nt(language, "notify_store_point_account_replied_title"),
    body: nt(language, "notify_store_point_account_replied_body"),
    link_url: OwnerRoutes.points(sid),
    meta: {
      kind: "store_point_account_replied",
      store_id: sid,
      inquiry_id: opts.inquiryId,
    },
  });
}
