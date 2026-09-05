/**
 * ARO-RST-COV-001 — Coverage dependency notes (read-only documentation).
 * Authority remains buildPrelaunchResetPlan / executePrelaunchReset.
 * Financial scopes (orders/gifts/point/coin/cash/settlement) stay INTENTIONAL_SAFE_LIMIT.
 */

export const ARO_RST_COV_001_DEPENDENCY_MATRIX = [
  {
    scope: "members",
    canonicalOwner: "profiles + auth.users (via Auth scope)",
    rootTable: "profiles",
    childTables: "content / notifications / support (via other scopes)",
    financeEffect: "gate — point_charge_requests block plan when present",
    safe: "PARTIAL",
    blocker: "profiles row DELETE not in executor; Auth @manual.local + linked content only",
  },
  {
    scope: "stores",
    canonicalOwner: "stores",
    rootTable: "stores",
    childTables: "delivery_ad_campaigns (terminal) / storage refs",
    financeEffect: "gate — cash/coin/orders block plan when present",
    safe: "PARTIAL",
    blocker: "stores row DELETE not in executor; finance/order evidence preserved via gate",
  },
  {
    scope: "community_comments",
    canonicalOwner: "community_comments",
    rootTable: "community_comments",
    childTables: "community_comment_likes (CASCADE)",
    financeEffect: "none",
    safe: "SUPPORTED",
    blocker: "none — parent community_posts preserved when comments-only",
  },
  {
    scope: "chat",
    canonicalOwner: "community_messenger_rooms",
    rootTable: "community_messenger_rooms",
    childTables: "community_messenger_messages / participants (CASCADE)",
    financeEffect: "gate — trade/store_order rooms protected",
    safe: "PARTIAL",
    blocker: "only general_direct|group disposable rooms by explicit chatRoomIds",
  },
  {
    scope: "feed_ads",
    canonicalOwner: "feed_ad_campaigns / feed_ad_requests",
    rootTable: "feed_ad_campaigns | feed_ad_requests",
    childTables: "creatives; feed_ad_point_holds CASCADE from request",
    financeEffect: "preserve — point_ledger never deleted",
    safe: "SUPPORTED",
    blocker: "explicit IDs only; Point ledger preserved",
  },
  {
    scope: "popup",
    canonicalOwner: "platform_popup_campaigns / platform_popup_owner_requests",
    rootTable: "platform_popup_*",
    childTables: "creatives / surfaces / events CASCADE from campaign",
    financeEffect: "preserve — business_cash_* never deleted",
    safe: "SUPPORTED",
    blocker: "explicit IDs only; Cash ledger preserved",
  },
  {
    scope: "coupons",
    canonicalOwner: "store_coupon_campaigns",
    rootTable: "store_coupon_campaigns",
    childTables: "coupon_user_entitlements (RESTRICT); store_coupon_redemptions",
    financeEffect: "gate — campaigns with redemptions blocked",
    safe: "PARTIAL",
    blocker: "unused campaigns only (0 redemptions); Gift separate BLOCKED",
  },
  {
    scope: "support",
    canonicalOwner: "support_cases",
    rootTable: "support_cases",
    childTables: "support_messages / support_sessions CASCADE",
    financeEffect: "none",
    safe: "SUPPORTED",
    blocker: "explicit supportCaseIds and/or member/store scoped cases only — no inbox wipe",
  },
  {
    scope: "notifications",
    canonicalOwner: "notification_events",
    rootTable: "notification_events",
    childTables: "none (devices/user_devices never wiped)",
    financeEffect: "none",
    safe: "PARTIAL",
    blocker: "member-scoped notification_events only; no device / admin campaign wipe",
  },
] as const;
