/**
 * Trade list / hub row unread SSOT = viewer participant unread message count.
 *
 * notification_targets (trade) remain for push / routing / lifecycle only.
 * DO NOT gate row digits on target presence.
 * DO NOT use Math.max(1, …) attention padding.
 *
 * App Icon / badge-count Trade room counts also use participants
 * (`loadTradeStoreOrderUnreadRoomFactsFromParticipants`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const TRADE_UNREAD_TARGET_TYPE = "trade" as const;

/**
 * Trade RowUnread = participant unread message count for current viewer.
 * Targets are ignored for digit authority.
 */
export function resolveTradeListUnreadCount(input: {
  participantUnreadCount?: number | null;
  /** @deprecated Ignored — targets are not row unread authority. */
  domainIdentityKey?: string | null;
  /** @deprecated Ignored — targets are not row unread authority. */
  unreadTargetIdentityKeys?: ReadonlySet<string>;
}): number {
  return Math.max(0, Math.floor(Number(input.participantUnreadCount) || 0));
}

/**
 * Push / lifecycle helper — NOT list/hub unread SSOT.
 * Filters unread trade targets by domain_identity_key.
 */
export function buildTradeUnreadTargetIdentityKeys(
  rows: ReadonlyArray<{
    domain_identity_key?: string | null;
    target_type?: string | null;
    chat_domain?: string | null;
    is_unread?: boolean | null;
  }>
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const row of rows) {
    if (row.is_unread === false) continue;
    if (row.target_type && row.target_type !== TRADE_UNREAD_TARGET_TYPE) continue;
    if (row.chat_domain && row.chat_domain !== "trade") continue;
    const key = String(row.domain_identity_key ?? "").trim();
    if (key) ids.add(key);
  }
  return ids;
}

/** Push / lifecycle loader — NOT list/hub unread SSOT. */
export async function loadTradeUnreadTargetIdentityKeys(
  sb: SupabaseClient,
  viewerUserId: string
): Promise<ReadonlySet<string>> {
  const uid = viewerUserId.trim();
  if (!uid) return new Set();
  const { data, error } = await sb
    .from("notification_targets")
    .select("domain_identity_key")
    .eq("user_id", uid)
    .eq("target_type", TRADE_UNREAD_TARGET_TYPE)
    .eq("is_unread", true)
    .eq("scope", "consumer")
    .eq("chat_domain", "trade");
  if (error) {
    console.warn("[loadTradeUnreadTargetIdentityKeys]", error.message);
    return new Set();
  }
  return buildTradeUnreadTargetIdentityKeys(
    (data ?? []) as Array<{
      domain_identity_key: string | null;
      target_type?: string | null;
      chat_domain?: string | null;
      is_unread?: boolean | null;
    }>
  );
}
