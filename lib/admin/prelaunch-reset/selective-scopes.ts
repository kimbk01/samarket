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
      "Explicit memberIds: Auth DELETE when @manual.local + EXPLICIT_SAFE_MEMBER preset; linked trade posts when trade_content selected. profiles row DELETE not in Cut H executor.",
    reasonKo: "명시 memberId · Auth/연계 콘텐츠만 (profiles 행 삭제 없음)",
    reasonEn: "Explicit memberIds · Auth/linked content only (no profiles row delete)",
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
      "Explicit storeIds: terminal delivery_ad_campaigns when delivery_ads selected; storage refs. stores row DELETE not in Cut H executor.",
    reasonKo: "명시 storeId · 연계 광고(종료분)/Storage만 (stores 행 삭제 없음)",
    reasonEn: "Explicit storeIds · linked terminal ads/Storage only (no stores row delete)",
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
    support: "NOT_SUPPORTED",
    selectAllEligible: false,
    dbOwner: "community_comments / post_comments",
    dependencies: "parent post",
    financeRisk: "none",
    storage: "none",
    auth: "none",
    protection: "n/a",
    executionSupport: "No executor path — do not fake-enable",
    reasonKo: "미지원 — executor 경로 없음",
    reasonEn: "Not supported — no executor path",
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
    support: "NOT_SUPPORTED",
    selectAllEligible: false,
    dbOwner: "community_messenger_* / order chat",
    dependencies: "order/trade evidence",
    financeRisk: "gate",
    storage: "none",
    auth: "none",
    protection: "business/order evidence — conservative",
    executionSupport: "No safe cascade — blocked from selection",
    reasonKo: "미지원 — 주문/거래 증적 위험",
    reasonEn: "Not supported — order/trade evidence risk",
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
    support: "NOT_SUPPORTED",
    selectAllEligible: false,
    dbOwner: "feed_ad_campaigns / feed_ad_requests",
    dependencies: "billing/history",
    financeRisk: "gate",
    storage: "none",
    auth: "none",
    protection: "no Cut H executor path",
    executionSupport: "Preset inventory only — no DELETE",
    reasonKo: "미지원 — executor 없음",
    reasonEn: "Not supported — no executor",
  },
  {
    key: "popup",
    group: "ads",
    labelKo: "팝업",
    labelEn: "Popup",
    support: "NOT_SUPPORTED",
    selectAllEligible: false,
    dbOwner: "platform_popup_*",
    dependencies: "owner requests",
    financeRisk: "gate",
    storage: "none",
    auth: "none",
    protection: "no Cut H executor path",
    executionSupport: "Preset inventory only — no DELETE",
    reasonKo: "미지원 — executor 없음",
    reasonEn: "Not supported — no executor",
  },
  {
    key: "coupons",
    group: "other",
    labelKo: "쿠폰",
    labelEn: "Coupons",
    support: "NOT_SUPPORTED",
    selectAllEligible: false,
    dbOwner: "store_coupons",
    dependencies: "orders",
    financeRisk: "gate",
    storage: "none",
    auth: "none",
    protection: "order-linked gate",
    executionSupport: "No DELETE path",
    reasonKo: "미지원",
    reasonEn: "Not supported",
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
    support: "NOT_SUPPORTED",
    selectAllEligible: false,
    dbOwner: "support_cases",
    dependencies: "messages",
    financeRisk: "none",
    storage: "none",
    auth: "none",
    protection: "no inbox wipe; no executor",
    executionSupport: "No DELETE path",
    reasonKo: "미지원",
    reasonEn: "Not supported",
  },
  {
    key: "notifications",
    group: "other",
    labelKo: "알림",
    labelEn: "Notifications",
    support: "NOT_SUPPORTED",
    selectAllEligible: false,
    dbOwner: "notifications / push_devices",
    dependencies: "devices",
    financeRisk: "none",
    storage: "none",
    auth: "none",
    protection: "no global device wipe",
    executionSupport: "No DELETE path",
    reasonKo: "미지원",
    reasonEn: "Not supported",
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
  if (includes.includes("COMMUNITY")) s.add("community_posts");
  if (includes.includes("ADS_DELIVERY")) s.add("delivery_ads");
  // Feed/Popup remain NOT_SUPPORTED — never auto-select
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

export function scopeAllowsDeliveryAds(scopes: readonly PrelaunchResetSelectiveScope[]): boolean {
  return scopes.includes("delivery_ads");
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
