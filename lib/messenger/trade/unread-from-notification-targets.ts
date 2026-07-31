/**
 * Trade list binary presence = derived `notification_targets` (target_type=trade)
 * matched by domain_identity_key — healed from participant unread Facts.
 *
 * App Icon / Trade Hub room counts = `loadTradeStoreOrderUnreadRoomFactsFromParticipants`
 * (participants.unread_count, non-phantom). Targets are projection only.
 *
 * NOT target_id for list match: target_id is buildTradeTargetId(postId, sellerId, buyerId)
 * (no `trade:` prefix), while the room's domain_identity_key is
 * `trade:{itemId}:{sellerId}:{counterpartyId}`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const TRADE_UNREAD_TARGET_TYPE = "trade" as const;

/** Binary presence from targets; when present keep message magnitude from participant. */
export function resolveTradeListUnreadCount(input: {
  domainIdentityKey: string;
  unreadTargetIdentityKeys: ReadonlySet<string>;
  participantUnreadCount?: number | null;
}): number {
  const key = input.domainIdentityKey.trim();
  if (!key || !input.unreadTargetIdentityKeys.has(key)) return 0;
  const n = Math.max(0, Math.floor(Number(input.participantUnreadCount) || 0));
  return Math.max(1, n);
}

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

export async function loadTradeUnreadTargetIdentityKeys(
  sb: SupabaseClient,
  viewerUserId: string
): Promise<ReadonlySet<string>> {
  const uid = viewerUserId.trim();
  if (!uid) return new Set();
  const { data, error } = await sb
    .from("notification_targets")
    .select("domain_identity_key, target_type, chat_domain, is_unread")
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
      target_type: string | null;
      chat_domain: string | null;
      is_unread: boolean | null;
    }>
  );
}
