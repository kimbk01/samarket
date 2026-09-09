/**
 * DIBAY DATA RESET — Friend domain Reset SSOT (B5).
 * Write SSOT remains user_social_relations (lib/community-messenger/social-relations).
 * This module is Reset boundary only — no delete engine yet.
 */

export const FRIEND_WRITE_SSOT_TABLE = "user_social_relations" as const;

export const FRIEND_RELATION_TYPES = ["friend", "blocked"] as const;
export type FriendRelationType = (typeof FRIEND_RELATION_TYPES)[number];

/**
 * Directional graph: owner_user_id → target_user_id.
 * Friend contacts are often mirrored as A→B and B→A rows (migration backfill).
 * User reset MUST remove both owner=user and target=user rows for relation_type in scope.
 */
export type FriendResetScope = "friend:user" | "friend:all";

export type FriendLegacyTablePolicy = {
  table: string;
  runtimeWriter: boolean;
  resetAction: "DELETE" | "PRESERVE" | "IGNORE";
  notes: string;
};

export const FRIEND_LEGACY_TABLE_POLICY: readonly FriendLegacyTablePolicy[] = [
  {
    table: "community_messenger_friendships",
    runtimeWriter: false,
    resetAction: "IGNORE",
    notes: "archive/compat readers only — not Friend write SSOT",
  },
  {
    table: "community_friend_requests",
    runtimeWriter: false,
    resetAction: "IGNORE",
    notes: "DEPRECATED archive — do not insert from app",
  },
  {
    table: "community_friend_favorites",
    runtimeWriter: false,
    resetAction: "IGNORE",
    notes: "favorites optional; not Reset SSOT root",
  },
] as const;

export type FriendResetPlanSpec = {
  scope: FriendResetScope;
  /** Canonical delete target */
  table: typeof FRIEND_WRITE_SSOT_TABLE;
  relationTypes: readonly FriendRelationType[];
  /**
   * For friend:user — match owner_user_id = user OR target_user_id = user
   * (never owner-only; bidirectional pair integrity).
   */
  matchMode: "either_endpoint" | "all_rows";
  preserve: readonly string[];
};

export const FRIEND_RESET_PLAN: Record<FriendResetScope, FriendResetPlanSpec> = {
  "friend:user": {
    scope: "friend:user",
    table: FRIEND_WRITE_SSOT_TABLE,
    relationTypes: FRIEND_RELATION_TYPES,
    matchMode: "either_endpoint",
    preserve: [
      "profiles",
      "auth.users",
      "community_messenger_rooms",
      "community_messenger_messages",
      "community_posts",
      "posts",
      "store_orders",
      "point_ledger",
      "business_cash_ledger",
      "gift_certificate_instances",
    ],
  },
  "friend:all": {
    scope: "friend:all",
    table: FRIEND_WRITE_SSOT_TABLE,
    relationTypes: FRIEND_RELATION_TYPES,
    matchMode: "all_rows",
    preserve: [
      "profiles",
      "auth.users",
      "community_messenger_rooms",
      "community_messenger_messages",
      "community_posts",
      "posts",
      "store_orders",
    ],
  },
};

export const FRIEND_RESET_EXECUTE_IMPLEMENTED = true as const;
