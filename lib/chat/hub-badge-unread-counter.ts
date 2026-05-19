import type { SupabaseClient } from "@supabase/supabase-js";
import type { UserChatUnreadParts } from "@/lib/chat/user-chat-unread-parts";

export const HUB_BADGE_UNREAD_COUNTERS_TABLE = "hub_badge_user_unread_counters";

/** Hub badge route TTL(5s)와 맞춤 — 정확도 우선 */
export function hubBadgeUnreadCounterTtlMs(): number {
  const raw = process.env.HUB_BADGE_UNREAD_COUNTER_TTL_MS?.trim();
  const n = raw ? Number(raw) : 5_000;
  if (!Number.isFinite(n) || n < 1_000) return 5_000;
  return Math.min(60_000, Math.max(1_000, Math.floor(n)));
}

export function isHubBadgeUnreadCounterAuditEnabled(): boolean {
  const v =
    process.env.HUB_BADGE_UNREAD_COUNTER_AUDIT?.trim() ||
    process.env.NEXT_PUBLIC_HUB_BADGE_UNREAD_COUNTER_AUDIT?.trim();
  return v === "1" || v === "true";
}

type CounterRow = {
  user_id: string;
  store_order_participant_unread: number;
  item_trade_participant_unread: number;
  community_participant_unread: number;
  product_chat_unread_deduped: number;
  updated_at: string;
};

export function userChatUnreadPartsFromCounterRow(row: CounterRow): UserChatUnreadParts {
  return {
    storeOrderParticipantUnread: Math.max(0, Math.floor(row.store_order_participant_unread) || 0),
    itemTradeParticipantUnread: Math.max(0, Math.floor(row.item_trade_participant_unread) || 0),
    communityParticipantUnread: Math.max(0, Math.floor(row.community_participant_unread) || 0),
    productChatUnreadDeduped: Math.max(0, Math.floor(row.product_chat_unread_deduped) || 0),
  };
}

export function counterRowFromUserChatUnreadParts(
  userId: string,
  parts: UserChatUnreadParts
): Omit<CounterRow, "updated_at"> & { updated_at: string } {
  return {
    user_id: userId,
    store_order_participant_unread: parts.storeOrderParticipantUnread,
    item_trade_participant_unread: parts.itemTradeParticipantUnread,
    community_participant_unread: parts.communityParticipantUnread,
    product_chat_unread_deduped: parts.productChatUnreadDeduped,
    updated_at: new Date().toISOString(),
  };
}

export type HubBadgeUnreadCounterRead =
  | { hit: false; reason: "missing" | "stale" | "bypass" | "error" | "no_table" }
  | { hit: true; parts: UserChatUnreadParts; ageMs: number };

export async function readHubBadgeUnreadCounter(
  sbAny: SupabaseClient<any>,
  userId: string,
  opts?: { bypass?: boolean }
): Promise<HubBadgeUnreadCounterRead> {
  if (opts?.bypass) return { hit: false, reason: "bypass" };

  const { data, error } = await sbAny
    .from(HUB_BADGE_UNREAD_COUNTERS_TABLE)
    .select(
      "user_id, store_order_participant_unread, item_trade_participant_unread, community_participant_unread, product_chat_unread_deduped, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    const msg = error.message ?? "";
    if (msg.includes("does not exist") || error.code === "42P01") {
      return { hit: false, reason: "no_table" };
    }
    return { hit: false, reason: "error" };
  }
  if (!data?.updated_at) return { hit: false, reason: "missing" };

  const ageMs = Math.max(0, Date.now() - new Date(data.updated_at).getTime());
  if (ageMs > hubBadgeUnreadCounterTtlMs()) {
    return { hit: false, reason: "stale" };
  }

  return {
    hit: true,
    parts: userChatUnreadPartsFromCounterRow(data as CounterRow),
    ageMs,
  };
}

export async function upsertHubBadgeUnreadCounter(
  sbAny: SupabaseClient<any>,
  userId: string,
  parts: UserChatUnreadParts
): Promise<void> {
  const row = counterRowFromUserChatUnreadParts(userId, parts);
  const { error } = await sbAny.from(HUB_BADGE_UNREAD_COUNTERS_TABLE).upsert(row, {
    onConflict: "user_id",
  });
  if (error && process.env.NODE_ENV === "development") {
    // eslint-disable-next-line no-console -- counter upsert probe
    console.warn("[hub-badge-unread-counter-upsert]", error.message);
  }
}

export function unreadPartsEqual(a: UserChatUnreadParts, b: UserChatUnreadParts): boolean {
  return (
    a.storeOrderParticipantUnread === b.storeOrderParticipantUnread &&
    a.itemTradeParticipantUnread === b.itemTradeParticipantUnread &&
    a.communityParticipantUnread === b.communityParticipantUnread &&
    a.productChatUnreadDeduped === b.productChatUnreadDeduped
  );
}
