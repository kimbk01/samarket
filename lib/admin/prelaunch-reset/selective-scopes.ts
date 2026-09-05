/**
 * ARO-RST-001 — Selective Reset scope matrix (Domain ↔ existing planner/executor).
 * Selection layer only — no parallel reset authority.
 *
 * Status meanings:
 * - SUPPORTED: checkbox enabled; planner/executor can act when explicit IDs present
 * - PARTIAL: selectable but limited (e.g. Auth-only for members, terminal ads for stores)
 * - BLOCKED: shown disabled; finance/safety gate — never force into select-all
 * - NOT_SUPPORTED: shown disabled; no safe executor path — never fake-enable
 */

export const PRELAUNCH_RESET_SELECTIVE_SCOPE_KEYS = [
  "members",
  "stores",
  "community_posts",
  "community_comments",
  "trade_content",
  "chat",
  "orders",
  "delivery_ads",
  "feed_ads",
  "popup",
  "coupons",
  "gifts",
  "support",
  "notifications",
  "point",
  "coin",
  "cash",
  "settlement",
  "storage",
  "auth",
] as const;

export type PrelaunchResetSelectiveScope = (typeof PRELAUNCH_RESET_SELECTIVE_SCOPE_KEYS)[number];

export type PrelaunchResetSelectiveSupport =
  | "SUPPORTED"
  | "PARTIAL"
  | "BLOCKED"
  | "NOT_SUPPORTED";

export type PrelaunchResetSelectiveMatrixRow = {
  key: PrelaunchResetSelectiveScope;
  group: "members_stores" | "content" | "commerce" | "ads" | "other" | "derived";
  labelKo: string;
  labelEn: string;
  support: PrelaunchResetSelectiveSupport;
  /** Eligible for 「전체 선택」 — SUPPORTED|PARTIAL only. */
  selectAllEligible: boolean;
  dbOwner: string;
  dependencies: string;
  financeRisk: "none" | "gate" | "block";
  storage: "derived" | "none" | "n/a";
  auth: "derived" | "none" | "n/a";
  protection: string;
  executionSupport: string;
  reasonKo: string;
  reasonEn: string;
};

export const PRELAUNCH_RESET_SELECTIVE_MATRIX: readonly PrelaunchResetSelectiveMatrixRow[] = [
  {
    key: "members",
    group: "members_stores",
    labelKo: "회원",
    labelEn: "Members",
    support: "PARTIAL",
    selectAllEligible: true,
    dbOwner: "profiles (+ linked content via memberIds)",
    dependencies: "content, notifications, support, auth, storage refs",
    financeRisk: "gate",
    storage: "derived",
    auth: "derived",
    protection: "current admin / active admin / MASTER always protected",
    executionSupport:
      "ARO-RST-COV-001: Explicit memberIds gate Auth/content/notifications/support. profiles row DELETE still not executed (finance/FK safety).",
    reasonKo: "부분 — Auth·연계 콘텐츠 가능 · profiles 행 삭제 없음(금융/FK)",
    reasonEn: "Partial — Auth/linked content OK · no profiles row delete (finance/FK)",
  },
  {
    key: "stores",
    group: "members_stores",
    labelKo: "업체 / Owner",
    labelEn: "Stores / Owner",
    support: "PARTIAL",
    selectAllEligible: true,
    dbOwner: "stores / store_owners (selector)",
    dependencies: "catalog, orders, coin/cash, ads, support, storage",
    financeRisk: "gate",
    storage: "derived",
    auth: "none",
    protection: "finance/order/gift gates; no force delete",
    executionSupport:
      "ARO-RST-COV-001: Explicit storeIds gate ads/coupons/support/storage. stores row DELETE not executed when finance/orders present.",
    reasonKo: "부분 — 연계 광고·쿠폰·Storage · stores 행 삭제 없음(주문/금융 게이트)",
    reasonEn: "Partial — linked ads/coupons/storage · no stores row delete (order/finance gate)",
  },
  {
    key: "community_posts",
    group: "content",
    labelKo: "커뮤니티 게시물",
    labelEn: "Community posts",
    support: "SUPPORTED",
    selectAllEligible: true,
    dbOwner: "community_posts",
    dependencies: "images storage; reports scoped separately",
    financeRisk: "none",
    storage: "derived",
    auth: "none",
    protection: "explicit contentIds and/or author memberIds only",
    executionSupport: "DB DELETE community_posts by id and/or user_id when scoped",
    reasonKo: "삭제 가능 (명시 ID/작성자)",
    reasonEn: "Deletable (explicit IDs / author)",
  },
  {
    key: "community_comments",
    group: "content",
    labelKo: "댓글",
    labelEn: "Comments",
    support: "SUPPORTED",
    selectAllEligible: true,
    dbOwner: "community_comments",
    dependencies: "parent post preserved when comments-only",
    financeRisk: "none",
    storage: "none",
    auth: "none",
    protection: "explicit commentIds and/or author memberIds",
    executionSupport: "ARO-RST-COV-001: DB DELETE community_comments; parent posts kept",
    reasonKo: "삭제 가능 (댓글만 · 게시글 유지)",
    reasonEn: "Deletable (comments only · posts preserved)",
  },
  {
    key: "trade_content",
    group: "content",
    labelKo: "거래 게시물",
    labelEn: "Trade posts",
    support: "SUPPORTED",
    selectAllEligible: true,
    dbOwner: "posts",
    dependencies: "images storage",
    financeRisk: "none",
    storage: "derived",
    auth: "none",
    protection: "explicit contentIds and/or author memberIds",
    executionSupport: "DB DELETE posts (Cut H)",
    reasonKo: "삭제 가능",
    reasonEn: "Deletable",
  },
  {
    key: "chat",
    group: "content",
    labelKo: "채팅 테스트 데이터",
    labelEn: "Chat test data",
    support: "PARTIAL",
    selectAllEligible: true,
    dbOwner: "community_messenger_rooms",
    dependencies: "messages/participants CASCADE; trade/order rooms protected",
    financeRisk: "gate",
    storage: "none",
    auth: "none",
    protection: "trade / store_order rooms never deleted",
    executionSupport:
      "ARO-RST-COV-001: DELETE rooms with chat_domain in (general_direct, group) by explicit chatRoomIds only",
    reasonKo: "부분 — 일반/그룹 테스트 방만 (거래·주문 채팅 보호)",
    reasonEn: "Partial — general/group test rooms only (trade/order chat protected)",
  },
  {
    key: "orders",
    group: "commerce",
    labelKo: "주문",
    labelEn: "Orders",
    support: "BLOCKED",
    selectAllEligible: false,
    dbOwner: "store_orders",
    dependencies: "payments, settlements, coin/cash",
    financeRisk: "block",
    storage: "none",
    auth: "none",
    protection: "settled/completed blocked by default",
    executionSupport: "Count gate only — never selective wipe",
    reasonKo: "차단 — 금융/정산 보호",
    reasonEn: "Blocked — finance/settlement protection",
  },
  {
    key: "delivery_ads",
    group: "ads",
    labelKo: "배달 광고",
    labelEn: "Delivery ads",
    support: "SUPPORTED",
    selectAllEligible: true,
    dbOwner: "delivery_ad_campaigns",
    dependencies: "creatives storage; inventory registry protected",
    financeRisk: "gate",
    storage: "derived",
    auth: "none",
    protection: "registry/placement never deleted",
    executionSupport: "DB DELETE campaigns by id; storeId + terminal status only",
    reasonKo: "삭제 가능 (집행 캠페인)",
    reasonEn: "Deletable (execution campaigns)",
  },
  {
    key: "feed_ads",
    group: "ads",
    labelKo: "피드 광고",
    labelEn: "Feed ads",
    support: "SUPPORTED",
    selectAllEligible: true,
    dbOwner: "feed_ad_campaigns / feed_ad_requests",
    dependencies: "creatives; holds CASCADE from request; Point ledger preserved",
    financeRisk: "gate",
    storage: "none",
    auth: "none",
    protection: "point_ledger never deleted",
    executionSupport:
      "ARO-RST-COV-001: DELETE feed campaigns/requests by explicit IDs; Point ledger preserved",
    reasonKo: "삭제 가능 (운영 row · Point 원장 보존)",
    reasonEn: "Deletable (ops rows · Point ledger preserved)",
  },
  {
    key: "popup",
    group: "ads",
    labelKo: "팝업",
    labelEn: "Popup",
    support: "SUPPORTED",
    selectAllEligible: true,
    dbOwner: "platform_popup_campaigns / platform_popup_owner_requests",
    dependencies: "creatives CASCADE; Cash ledger preserved",
    financeRisk: "gate",
    storage: "none",
    auth: "none",
    protection: "business_cash_* never deleted",
    executionSupport:
      "ARO-RST-COV-001: DELETE popup campaigns/requests by explicit IDs; Cash ledger preserved",
    reasonKo: "삭제 가능 (운영 row · Cash 원장 보존)",
    reasonEn: "Deletable (ops rows · Cash ledger preserved)",
  },
  {
    key: "coupons",
    group: "other",
    labelKo: "쿠폰",
    labelEn: "Coupons",
    support: "PARTIAL",
    selectAllEligible: true,
    dbOwner: "store_coupon_campaigns",
    dependencies: "entitlements; redemptions block campaign delete",
    financeRisk: "gate",
    storage: "none",
    auth: "none",
    protection: "campaigns with redemptions blocked; Gift ≠ Coupon",
    executionSupport:
      "ARO-RST-COV-001: DELETE unused campaigns (0 redemptions) after entitlements; Gift remains BLOCKED",
    reasonKo: "부분 — 미사용 쿠폰 캠페인만 (사용 이력 있으면 차단)",
    reasonEn: "Partial — unused coupon campaigns only (block if redeemed)",
  },
  {
    key: "gifts",
    group: "other",
    labelKo: "상품권",
    labelEn: "Gift certificates",
    support: "BLOCKED",
    selectAllEligible: false,
    dbOwner: "gift_certificate_instances",
    dependencies: "cash-like value",
    financeRisk: "block",
    storage: "none",
    auth: "none",
    protection: "gift_value_present_block",
    executionSupport: "Always BLOCK when rows present",
    reasonKo: "차단 — 유료 가치/이력",
    reasonEn: "Blocked — paid value/history",
  },
  {
    key: "support",
    group: "other",
    labelKo: "고객지원",
    labelEn: "Support",
    support: "SUPPORTED",
    selectAllEligible: true,
    dbOwner: "support_cases",
    dependencies: "support_messages CASCADE",
    financeRisk: "none",
    storage: "none",
    auth: "none",
    protection: "explicit case ids and/or member/store scoped — no global inbox wipe",
    executionSupport:
      "ARO-RST-COV-001: DELETE support_cases by supportCaseIds and/or requester/store selectors",
    reasonKo: "삭제 가능 (명시 케이스 · 전체 인박스 wipe 금지)",
    reasonEn: "Deletable (explicit cases · no inbox wipe)",
  },
  {
    key: "notifications",
    group: "other",
    labelKo: "알림",
    labelEn: "Notifications",
    support: "PARTIAL",
    selectAllEligible: true,
    dbOwner: "notification_events",
    dependencies: "member-scoped events only",
    financeRisk: "none",
    storage: "none",
    auth: "none",
    protection: "no device wipe; no admin campaign wipe",
    executionSupport:
      "ARO-RST-COV-001: DELETE notification_events for explicit memberIds only",
    reasonKo: "부분 — 회원 notification_events만 (디바이스/캠페인 보존)",
    reasonEn: "Partial — member notification_events only (devices/campaigns preserved)",
  },
  {
    key: "point",
    group: "other",
    labelKo: "Point",
    labelEn: "Point",
    support: "BLOCKED",
    selectAllEligible: false,
    dbOwner: "point_ledger / point_charge_requests",
    dependencies: "member finance",
    financeRisk: "block",
    storage: "n/a",
    auth: "n/a",
    protection: "finance_rows_present_block",
    executionSupport: "Gate only",
    reasonKo: "차단 — 원장 보호",
    reasonEn: "Blocked — ledger protection",
  },
  {
    key: "coin",
    group: "other",
    labelKo: "Coin",
    labelEn: "Coin",
    support: "BLOCKED",
    selectAllEligible: false,
    dbOwner: "business_coin_*",
    dependencies: "store finance",
    financeRisk: "block",
    storage: "n/a",
    auth: "n/a",
    protection: "finance gate",
    executionSupport: "Gate only",
    reasonKo: "차단",
    reasonEn: "Blocked",
  },
  {
    key: "cash",
    group: "other",
    labelKo: "Cash",
    labelEn: "Cash",
    support: "BLOCKED",
    selectAllEligible: false,
    dbOwner: "business_cash_*",
    dependencies: "store finance",
    financeRisk: "block",
    storage: "n/a",
    auth: "n/a",
    protection: "finance gate",
    executionSupport: "Gate only",
    reasonKo: "차단",
    reasonEn: "Blocked",
  },
  {
    key: "settlement",
    group: "other",
    labelKo: "정산",
    labelEn: "Settlement",
    support: "BLOCKED",
    selectAllEligible: false,
    dbOwner: "store_settlements",
    dependencies: "orders/payments",
    financeRisk: "block",
    storage: "n/a",
    auth: "n/a",
    protection: "settled money",
    executionSupport: "Never selective wipe",
    reasonKo: "차단",
    reasonEn: "Blocked",
  },
  {
    key: "storage",
    group: "derived",
    labelKo: "Storage (연계 객체)",
    labelEn: "Storage (linked objects)",
    support: "SUPPORTED",
    selectAllEligible: true,
    dbOwner: "storage.objects (entity-derived)",
    dependencies: "selected entity refs only",
    financeRisk: "none",
    storage: "derived",
    auth: "none",
    protection: "bucket-wide purge forbidden",
    executionSupport: "Remove planned bucket/path only",
    reasonKo: "삭제 가능 (연계 object만)",
    reasonEn: "Deletable (linked objects only)",
  },
  {
    key: "auth",
    group: "derived",
    labelKo: "Auth (테스트 회원)",
    labelEn: "Auth (test members)",
    support: "SUPPORTED",
    selectAllEligible: true,
    dbOwner: "auth.users",
    dependencies: "members scope + EXPLICIT_SAFE_MEMBER",
    financeRisk: "none",
    storage: "none",
    auth: "derived",
    protection: "protected admin always PRESERVE/BLOCKED",
    executionSupport: "@manual.local + non-protected DELETE only",
    reasonKo: "삭제 가능 (safe test member만)",
    reasonEn: "Deletable (safe test members only)",
  },
] as const;

const KEY_SET = new Set<string>(PRELAUNCH_RESET_SELECTIVE_SCOPE_KEYS);

export function isPrelaunchResetSelectiveScope(v: string): v is PrelaunchResetSelectiveScope {
  return KEY_SET.has(v);
}

export function matrixRowForScope(
  key: PrelaunchResetSelectiveScope
): PrelaunchResetSelectiveMatrixRow {
  const row = PRELAUNCH_RESET_SELECTIVE_MATRIX.find((r) => r.key === key);
  if (!row) throw new Error(`missing selective matrix row: ${key}`);
  return row;
}

/** Scopes allowed in select-all / request body (SUPPORTED + PARTIAL only). */
export function selectAllEligibleScopes(): PrelaunchResetSelectiveScope[] {
  return PRELAUNCH_RESET_SELECTIVE_MATRIX.filter((r) => r.selectAllEligible).map((r) => r.key);
}

export function normalizeSelectedScopes(
  raw: unknown,
  opts?: { allowEmpty?: boolean }
): PrelaunchResetSelectiveScope[] {
  const eligible = new Set(selectAllEligibleScopes());
  const list = Array.isArray(raw) ? raw : [];
  const out: PrelaunchResetSelectiveScope[] = [];
  for (const x of list) {
    const k = String(x ?? "").trim();
    if (!isPrelaunchResetSelectiveScope(k)) continue;
    if (!eligible.has(k)) continue; // drop BLOCKED / NOT_SUPPORTED
    if (!out.includes(k)) out.push(k);
  }
  out.sort();
  if (out.length === 0 && !opts?.allowEmpty) {
    // Legacy callers: empty scopes mean "preset-driven" (planner fills default).
    return [];
  }
  return out;
}

/**
 * When UI omits selectedScopes, infer from preset includes so existing API clients
 * keep working (CUT H/I contracts).
 */
export function defaultScopesForPreset(includes: readonly string[]): PrelaunchResetSelectiveScope[] {
  const s = new Set<PrelaunchResetSelectiveScope>();
  if (includes.includes("MEMBER")) s.add("members");
  if (includes.includes("STORE") || includes.includes("OWNER")) s.add("stores");
  if (includes.includes("TRADE")) s.add("trade_content");
  if (includes.includes("COMMUNITY")) {
    s.add("community_posts");
    s.add("community_comments");
  }
  if (includes.includes("ADS_DELIVERY")) s.add("delivery_ads");
  if (includes.includes("ADS_FEED")) s.add("feed_ads");
  if (includes.includes("POPUP")) s.add("popup");
  if (includes.includes("SUPPORT")) s.add("support");
  if (includes.includes("MESSENGER")) s.add("chat");
  if (includes.includes("COUPON")) s.add("coupons");
  if (includes.includes("NOTIFICATIONS")) s.add("notifications");
  s.add("storage");
  if (includes.includes("MEMBER")) s.add("auth");
  return [...s].sort();
}

export function scopeAllowsTradeContent(scopes: readonly PrelaunchResetSelectiveScope[]): boolean {
  return scopes.includes("trade_content");
}

export function scopeAllowsCommunityPosts(scopes: readonly PrelaunchResetSelectiveScope[]): boolean {
  return scopes.includes("community_posts");
}

export function scopeAllowsCommunityComments(
  scopes: readonly PrelaunchResetSelectiveScope[]
): boolean {
  return scopes.includes("community_comments");
}

export function scopeAllowsDeliveryAds(scopes: readonly PrelaunchResetSelectiveScope[]): boolean {
  return scopes.includes("delivery_ads");
}

export function scopeAllowsFeedAds(scopes: readonly PrelaunchResetSelectiveScope[]): boolean {
  return scopes.includes("feed_ads");
}

export function scopeAllowsPopup(scopes: readonly PrelaunchResetSelectiveScope[]): boolean {
  return scopes.includes("popup");
}

export function scopeAllowsCoupons(scopes: readonly PrelaunchResetSelectiveScope[]): boolean {
  return scopes.includes("coupons");
}

export function scopeAllowsSupport(scopes: readonly PrelaunchResetSelectiveScope[]): boolean {
  return scopes.includes("support");
}

export function scopeAllowsNotifications(scopes: readonly PrelaunchResetSelectiveScope[]): boolean {
  return scopes.includes("notifications");
}

export function scopeAllowsChat(scopes: readonly PrelaunchResetSelectiveScope[]): boolean {
  return scopes.includes("chat");
}

export function scopeAllowsMembers(scopes: readonly PrelaunchResetSelectiveScope[]): boolean {
  return scopes.includes("members");
}

export function scopeAllowsStores(scopes: readonly PrelaunchResetSelectiveScope[]): boolean {
  return scopes.includes("stores");
}

export function scopeAllowsStorage(scopes: readonly PrelaunchResetSelectiveScope[]): boolean {
  return scopes.includes("storage");
}

export function scopeAllowsAuth(scopes: readonly PrelaunchResetSelectiveScope[]): boolean {
  return scopes.includes("auth");
}
