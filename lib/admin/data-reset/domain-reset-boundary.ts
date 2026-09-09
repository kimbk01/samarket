/**
 * DIBAY DATA RESET — Domain boundary contract (policy only; no delete engine).
 * Closes Audit blockers B1/B2/B4/B5 at SSOT layer before Admin Reset UI CUT.
 */

export type DomainResetDeleteMode =
  | "DELETE"
  | "ARCHIVE"
  | "RESET_STATE"
  | "RESEED"
  | "PRESERVE"
  | "SOFT"
  | "DETACH"
  | "FORBIDDEN";

export type DomainResetBoundary = {
  domain:
    | "COMMUNITY"
    | "MARKET"
    | "DELIVERY"
    | "CHAT"
    | "FRIEND"
    | "MEMBER"
    | "FINANCE";
  root: string;
  owned: readonly string[];
  referenced: readonly string[];
  preserve: readonly string[];
  deleteMode: DomainResetDeleteMode;
  notes: string;
};

export const DOMAIN_RESET_BOUNDARY = {
  COMMUNITY: {
    domain: "COMMUNITY",
    root: "community_posts",
    owned: [
      "community_comments",
      "community_post_likes",
      "community_post_saves",
      "community_post_images",
      "community_reports",
    ],
    referenced: ["profiles", "notification_events"],
    preserve: ["profiles", "posts", "community_messenger_rooms", "user_social_relations"],
    deleteMode: "DELETE",
    notes: "Philife shares community_posts physical root",
  },
  MARKET: {
    domain: "MARKET",
    root: "posts",
    owned: ["favorites", "price_offers"],
    referenced: ["community_messenger_rooms(chat_domain=trade)", "profiles"],
    preserve: ["community_messenger_rooms", "profiles", "point_ledger"],
    deleteMode: "DELETE",
    notes: "Listing delete ≠ trade room delete (DETACH bridge)",
  },
  DELIVERY: {
    domain: "DELIVERY",
    root: "stores",
    owned: ["store_products", "store_menus", "operating catalog"],
    referenced: ["store_orders", "community_messenger_rooms(store_order)"],
    preserve: [
      "store_orders",
      "store_settlements",
      "gift_certificate_*",
      "business_cash_*",
      "store_economic_point_*",
      "store_cash_*",
      "sale_fee_obligations",
    ],
    deleteMode: "ARCHIVE",
    notes:
      "STORE ROW DELETE FORBIDDEN when finance/gift/orders present (B1 RESTRICT). Operating data may DELETE separately.",
  },
  CHAT: {
    domain: "CHAT",
    root: "community_messenger_rooms",
    owned: [
      "community_messenger_messages",
      "community_messenger_participants",
      "community_messenger_call_sessions",
    ],
    referenced: ["posts", "store_orders", "user_social_relations"],
    preserve: ["profiles", "posts", "stores", "store_orders", "user_social_relations"],
    deleteMode: "SOFT",
    notes: "See chat-reset-policy.ts — hard-reset-only is future HIGH-RISK",
  },
  FRIEND: {
    domain: "FRIEND",
    root: "user_social_relations",
    owned: ["user_social_relations.friend", "user_social_relations.blocked"],
    referenced: ["profiles"],
    preserve: [
      "profiles",
      "community_messenger_rooms",
      "community_messenger_messages",
      "community_posts",
      "posts",
      "store_orders",
      "finance ledgers",
    ],
    deleteMode: "DELETE",
    notes: "friend:user matches either endpoint; execute deferred (FRIEND_RESET_EXECUTE_IMPLEMENTED=false)",
  },
  MEMBER: {
    domain: "MEMBER",
    root: "profiles / auth.users",
    owned: ["user_devices", "notification prefs"],
    referenced: ["all domains"],
    preserve: ["admin_memberships", "audit_logs", "finance ledgers until Hard Reset"],
    deleteMode: "FORBIDDEN",
    notes: "Auth purge / full member wipe = later CUT — not this blocker close",
  },
  FINANCE: {
    domain: "FINANCE",
    root: "ledgers (point / coin / cash / gift / settlement)",
    owned: [
      "point_ledger",
      "store_economic_point_ledger",
      "business_cash_ledger",
      "store_cash_ledger",
      "gift_certificate_*",
      "store_settlements",
      "sale_fee_obligations",
    ],
    referenced: ["stores", "store_orders", "auth.users"],
    preserve: ["all of owned by default"],
    deleteMode: "PRESERVE",
    notes: "Financial Hard Reset = separate highest-risk CUT; immutable triggers stay",
  },
} as const satisfies Record<string, DomainResetBoundary>;

export type DeliveryLayerReset = {
  identity: DomainResetDeleteMode;
  operating: DomainResetDeleteMode;
  historical: DomainResetDeleteMode;
  finance: DomainResetDeleteMode;
  gift: DomainResetDeleteMode;
};

export const DELIVERY_LAYER_RESET_POLICY: DeliveryLayerReset = {
  identity: "ARCHIVE",
  operating: "DELETE",
  historical: "PRESERVE",
  finance: "PRESERVE",
  gift: "PRESERVE",
};
