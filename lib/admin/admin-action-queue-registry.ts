/**
 * ADMIN ACTION QUEUE REGISTRY — single contract per workload category.
 *
 * Bell total · Action Queue cards (CP Overview / Action Center / order-notifications) ·
 * sidebar badges · permission scoping are DERIVED from this table. Do not re-list
 * categories, hrefs, or "is it in the total" anywhere else.
 *
 * Ownership rule (dedupe): every source row belongs to exactly one category.
 *   - `reports` (trade reports, ALL target_type incl. chat_room) → `reports`
 *     (processed at /admin/reports via POST /api/admin/reports/[id]/action).
 *   - `community_messenger_reports` → `messenger_actionable` (/admin/chats/messenger).
 *
 * Total rule: includeInTotal = nextActor === "admin" && active category.
 * Owner/system workload (e.g. store_inquiry_open — owner answers) stays observable
 * as a count but never inflates the Admin Bell.
 *
 * Permission rule: requiredPermission mirrors the permission the category's admin
 * list/mutation API enforces (requireAdminPermission). null = any active admin.
 */
import type { AdminPermissionKey } from "@/lib/types/admin-staff";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

export type AdminActionQueueCategory =
  | "store_charges"
  | "cash_charges"
  | "user_charges"
  | "feed_ad_requests"
  | "delivery_ad_ops"
  | "trade_promo_pending"
  | "reports"
  | "store_reports"
  | "delivery_alerts"
  | "member_inquiry_open"
  | "support_actionable"
  | "store_inquiry_open"
  | "platform_inquiry_open"
  | "community_reports"
  | "store_applications"
  | "meeting_reports"
  | "orders_attention"
  | "settlements_actionable"
  | "coin_withdrawals"
  | "platform_popup_pending"
  | "partner_pending"
  | "messenger_actionable";

export type AdminActionQueuePriority = "P0_CRITICAL" | "P1_ACTION_REQUIRED" | "P2_INFORMATIONAL" | "P3_SILENT";

export type AdminActionQueueRtPolicy = "RT_REQUIRED" | "RT_OPTIONAL" | "POLL_SUFFICIENT";

/** Who must act next on rows in this category. */
export type AdminActionQueueNextActor = "admin" | "owner" | "system";

/** Lifecycle of the category itself (legacy categories are kept for observability only). */
export type AdminActionQueueLifecycle = "active" | "legacy_archive";

export type AdminActionQueueCategoryDef = {
  key: AdminActionQueueCategory;
  /** Source table(s) — ownership documentation; one row → one category. */
  sources: readonly string[];
  nextActor: AdminActionQueueNextActor;
  lifecycle: AdminActionQueueLifecycle;
  priority: AdminActionQueuePriority;
  rt: AdminActionQueueRtPolicy;
  soundEligible: boolean;
  requiredPermission: AdminPermissionKey | null;
  /** Admin list that shows exactly the rows counted (null = no admin surface). */
  listHref: string | null;
  /** Sidebar menu keys whose badge includes this category's count. */
  sidebarMenuKeys: readonly string[];
  titleKo: string;
  titleEn: string;
  domainKo: string;
  domainEn: string;
  ctaKo: string;
  ctaEn: string;
};

export const ADMIN_ACTION_QUEUE_REGISTRY: readonly AdminActionQueueCategoryDef[] = [
  {
    key: "delivery_alerts",
    sources: ["delivery_operation_alert_events"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P0_CRITICAL",
    rt: "RT_REQUIRED",
    soundEligible: true,
    requiredPermission: null,
    listHref: "/admin/delivery-alerts",
    sidebarMenuKeys: ["delivery-operation-alerts"],
    titleKo: "배달 운영 알림",
    titleEn: "Delivery ops alerts",
    domainKo: "배달",
    domainEn: "Delivery",
    ctaKo: "알림 큐",
    ctaEn: "Alerts queue",
  },
  {
    key: "orders_attention",
    sources: ["store_orders"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P0_CRITICAL",
    rt: "POLL_SUFFICIENT",
    soundEligible: false,
    requiredPermission: null,
    listHref: "/admin/store-orders?queue=admin_attention",
    sidebarMenuKeys: ["delivery-orders-action-queue"],
    titleKo: "주문 처리 필요 (취소요청·환불요청·운영 주의)",
    titleEn: "Orders need admin action",
    domainKo: "배달",
    domainEn: "Delivery",
    ctaKo: "주문 큐 열기",
    ctaEn: "Open order queue",
  },
  {
    key: "settlements_actionable",
    /** 매장 직접 결제 모델 — 관리자 할 일은 취소·환불 주문 수수료 검토뿐 (지급 큐 없음). */
    sources: ["store_sale_fee_obligations"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "POLL_SUFFICIENT",
    soundEligible: false,
    requiredPermission: "business",
    listHref: "/admin/store-settlements?state=review_required",
    sidebarMenuKeys: ["store-settlements-admin"],
    titleKo: "취소·환불 수수료 검토 대기",
    titleEn: "Commission reviews (cancel/refund)",
    domainKo: "재무",
    domainEn: "Finance",
    ctaKo: "수수료 검토",
    ctaEn: "Review commissions",
  },
  {
    key: "cash_charges",
    sources: ["business_cash_charge_requests"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "RT_REQUIRED",
    soundEligible: true,
    requiredPermission: "business",
    listHref: DELIVERY_AD_ADMIN_ROUTES.cashCharges,
    sidebarMenuKeys: ["store-finance-admin"],
    titleKo: "Cash 충전 승인 대기",
    titleEn: "Cash top-up pending",
    domainKo: "재무 · Cash",
    domainEn: "Finance · Cash",
    ctaKo: "Cash 대기열",
    ctaEn: "Cash queue",
  },
  {
    key: "user_charges",
    sources: ["point_charge_requests"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "RT_REQUIRED",
    soundEligible: true,
    requiredPermission: "point",
    listHref: "/admin/point-charges",
    sidebarMenuKeys: ["store-finance-admin", "points-charge"],
    titleKo: "Point 충전 승인 대기",
    titleEn: "Point top-up pending",
    domainKo: "재무 · Point",
    domainEn: "Finance · Point",
    ctaKo: "Point 대기열",
    ctaEn: "Point queue",
  },
  {
    key: "coin_withdrawals",
    sources: ["coin_withdrawal_requests"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "POLL_SUFFICIENT",
    soundEligible: false,
    requiredPermission: "business",
    listHref: "/admin/finance#coin-withdrawals",
    sidebarMenuKeys: ["finance-withdrawals"],
    titleKo: "Coin 출금 요청",
    titleEn: "Coin withdrawals",
    domainKo: "재무 · Coin",
    domainEn: "Finance · Coin",
    ctaKo: "Coin 출금 큐",
    ctaEn: "Coin withdraw queue",
  },
  {
    key: "reports",
    sources: ["reports"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "RT_REQUIRED",
    soundEligible: true,
    requiredPermission: "reports",
    listHref: "/admin/reports?domain=trade",
    sidebarMenuKeys: ["global-reports", "reports-posts"],
    titleKo: "거래 신고 (상품·회원·채팅방)",
    titleEn: "Trade reports",
    domainKo: "거래",
    domainEn: "Trade",
    ctaKo: "거래 신고 큐",
    ctaEn: "Trade reports",
  },
  {
    key: "community_reports",
    sources: ["community_reports"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "RT_REQUIRED",
    soundEligible: true,
    requiredPermission: null,
    listHref: "/admin/community/reports?status=pending",
    sidebarMenuKeys: ["global-reports", "community-feed-reports"],
    titleKo: "커뮤니티 일반 신고",
    titleEn: "Community reports",
    domainKo: "커뮤니티",
    domainEn: "Community",
    ctaKo: "신고 큐",
    ctaEn: "Reports queue",
  },
  {
    key: "meeting_reports",
    sources: ["meeting_reports"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "POLL_SUFFICIENT",
    soundEligible: false,
    requiredPermission: null,
    listHref: "/admin/philife/meeting-reports",
    sidebarMenuKeys: ["philife-meeting-reports"],
    titleKo: "모임 신고",
    titleEn: "Meeting reports",
    domainKo: "커뮤니티",
    domainEn: "Community",
    ctaKo: "모임 신고 큐",
    ctaEn: "Meeting reports",
  },
  {
    key: "store_reports",
    sources: ["store_reports"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "RT_REQUIRED",
    soundEligible: true,
    requiredPermission: null,
    listHref: "/admin/store-reports",
    sidebarMenuKeys: ["store-reports-admin"],
    titleKo: "매장 신고",
    titleEn: "Store reports",
    domainKo: "매장",
    domainEn: "Store",
    ctaKo: "매장 신고 큐",
    ctaEn: "Store reports",
  },
  {
    key: "messenger_actionable",
    sources: ["community_messenger_reports"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "POLL_SUFFICIENT",
    soundEligible: false,
    requiredPermission: null,
    listHref: "/admin/chats/messenger",
    sidebarMenuKeys: ["chat-messenger"],
    titleKo: "메신저 신고",
    titleEn: "Messenger reports",
    domainKo: "채팅",
    domainEn: "Chat",
    ctaKo: "메신저 신고 큐",
    ctaEn: "Messenger reports",
  },
  {
    key: "delivery_ad_ops",
    sources: ["delivery_ad_operations_cases"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "POLL_SUFFICIENT",
    soundEligible: false,
    requiredPermission: null,
    listHref: `${DELIVERY_AD_ADMIN_ROUTES.hub}?view=actionable`,
    sidebarMenuKeys: ["delivery-ads-control"],
    titleKo: "배달 광고 운영 대기",
    titleEn: "Delivery ads waiting",
    domainKo: "광고 · 배달",
    domainEn: "Ads · Delivery",
    ctaKo: "광고 운영 열기",
    ctaEn: "Open ads ops",
  },
  {
    key: "feed_ad_requests",
    sources: ["feed_ad_requests"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "RT_REQUIRED",
    soundEligible: true,
    requiredPermission: null,
    listHref: "/admin/ad-applications?domain=feed",
    sidebarMenuKeys: ["ads-feed-applications"],
    titleKo: "피드 광고 심사",
    titleEn: "Feed ad review",
    domainKo: "광고 · 피드",
    domainEn: "Ads · Feed",
    ctaKo: "피드 신청 열기",
    ctaEn: "Open feed requests",
  },
  {
    key: "trade_promo_pending",
    sources: ["point_promotion_orders"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "POLL_SUFFICIENT",
    soundEligible: false,
    requiredPermission: null,
    listHref: "/admin/ad-applications?domain=trade",
    sidebarMenuKeys: ["ads-applications"],
    titleKo: "거래 프로모 심사",
    titleEn: "Trade promo review",
    domainKo: "거래",
    domainEn: "Trade",
    ctaKo: "신청 열기",
    ctaEn: "Open applications",
  },
  {
    key: "platform_popup_pending",
    sources: ["platform_popup_owner_requests"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "POLL_SUFFICIENT",
    soundEligible: false,
    requiredPermission: null,
    listHref: "/admin/platform-popup",
    sidebarMenuKeys: ["promotion-popup"],
    titleKo: "팝업 승인 대기",
    titleEn: "Popup review pending",
    domainKo: "광고 · 팝업",
    domainEn: "Ads · Popup",
    ctaKo: "팝업 허브",
    ctaEn: "Popup hub",
  },
  {
    key: "partner_pending",
    sources: ["delivery_ad_partner_memberships"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "POLL_SUFFICIENT",
    soundEligible: false,
    requiredPermission: null,
    listHref: DELIVERY_AD_ADMIN_ROUTES.partnerMemberships,
    sidebarMenuKeys: [],
    titleKo: "Partner 가입 심사",
    titleEn: "Partner membership review",
    domainKo: "Partner",
    domainEn: "Partner",
    ctaKo: "Partner 관리",
    ctaEn: "Manage Partner",
  },
  {
    key: "support_actionable",
    sources: ["support_cases"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "RT_REQUIRED",
    soundEligible: true,
    requiredPermission: null,
    listHref: "/admin/support?filter=ACTIONABLE#action-required",
    sidebarMenuKeys: ["cp-support-center"],
    titleKo: "고객지원 답변 대기",
    titleEn: "Support waiting on admin",
    domainKo: "고객지원",
    domainEn: "Support",
    ctaKo: "고객센터 열기",
    ctaEn: "Open Support",
  },
  {
    key: "store_applications",
    sources: ["stores"],
    nextActor: "admin",
    lifecycle: "active",
    priority: "P1_ACTION_REQUIRED",
    rt: "RT_REQUIRED",
    soundEligible: true,
    requiredPermission: null,
    listHref: "/admin/stores?status=actionable",
    sidebarMenuKeys: ["stores-commerce"],
    titleKo: "입점 검토",
    titleEn: "Store applications",
    domainKo: "매장",
    domainEn: "Store",
    ctaKo: "입점 대기 목록",
    ctaEn: "Actionable stores",
  },
  {
    key: "store_inquiry_open",
    sources: ["store_inquiries"],
    // Buyer → store questions; the owner answers (me/stores/.../inquiries). Monitoring only.
    nextActor: "owner",
    lifecycle: "active",
    priority: "P2_INFORMATIONAL",
    rt: "POLL_SUFFICIENT",
    soundEligible: false,
    requiredPermission: null,
    listHref: "/admin/store-inquiries",
    sidebarMenuKeys: [],
    titleKo: "매장 문의 (사장님 답변 대기)",
    titleEn: "Store inquiries (owner to answer)",
    domainKo: "매장",
    domainEn: "Store",
    ctaKo: "매장 문의 보기",
    ctaEn: "View store inquiries",
  },
  {
    key: "store_charges",
    sources: ["store_point_charge_requests"],
    // AST-002 archived store-credit requests — NOT Cash. Mutations 410 (CUT E).
    nextActor: "system",
    lifecycle: "legacy_archive",
    priority: "P3_SILENT",
    rt: "POLL_SUFFICIENT",
    soundEligible: false,
    requiredPermission: "business",
    listHref: null,
    sidebarMenuKeys: [],
    titleKo: "레거시 매장 포인트 충전 (보관)",
    titleEn: "Legacy store point charges (archive)",
    domainKo: "재무",
    domainEn: "Finance",
    ctaKo: "",
    ctaEn: "",
  },
  {
    key: "member_inquiry_open",
    sources: ["member_admin_note_threads"],
    // A2-2: legacy Care removed from actionable queue (support_cases is canonical).
    nextActor: "system",
    lifecycle: "legacy_archive",
    priority: "P3_SILENT",
    rt: "POLL_SUFFICIENT",
    soundEligible: false,
    requiredPermission: null,
    listHref: null,
    sidebarMenuKeys: [],
    titleKo: "레거시 회원 문의 (보관)",
    titleEn: "Legacy member inquiries (archive)",
    domainKo: "고객지원",
    domainEn: "Support",
    ctaKo: "",
    ctaEn: "",
  },
  {
    key: "platform_inquiry_open",
    sources: ["platform_admin_inquiries"],
    // A2-2: legacy platform inbox — archive only.
    nextActor: "system",
    lifecycle: "legacy_archive",
    priority: "P3_SILENT",
    rt: "POLL_SUFFICIENT",
    soundEligible: false,
    requiredPermission: null,
    listHref: null,
    sidebarMenuKeys: [],
    titleKo: "레거시 플랫폼 문의 (보관)",
    titleEn: "Legacy platform inquiries (archive)",
    domainKo: "고객지원",
    domainEn: "Support",
    ctaKo: "",
    ctaEn: "",
  },
];

export const ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY: ReadonlyMap<
  AdminActionQueueCategory,
  AdminActionQueueCategoryDef
> = new Map(ADMIN_ACTION_QUEUE_REGISTRY.map((d) => [d.key, d]));

export function getAdminActionQueueCategoryDef(
  key: AdminActionQueueCategory
): AdminActionQueueCategoryDef {
  const def = ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY.get(key);
  if (!def) throw new Error(`unknown_admin_action_queue_category:${key}`);
  return def;
}

/** Admin Bell total membership — derived, never hand-listed. */
export function isAdminActionQueueTotalCategory(def: AdminActionQueueCategoryDef): boolean {
  return def.lifecycle === "active" && def.nextActor === "admin";
}

export const ADMIN_ACTION_QUEUE_TOTAL_CATEGORIES: readonly AdminActionQueueCategory[] =
  ADMIN_ACTION_QUEUE_REGISTRY.filter(isAdminActionQueueTotalCategory).map((d) => d.key);

/** Categories rendered as Action Queue cards (admin workload + owner monitoring). */
export const ADMIN_ACTION_QUEUE_CARD_CATEGORIES: readonly AdminActionQueueCategory[] =
  ADMIN_ACTION_QUEUE_REGISTRY.filter((d) => d.lifecycle === "active" && d.listHref).map((d) => d.key);

/** Back-compat META view (priority / rt / sound) derived from the registry. */
export const ADMIN_ACTION_QUEUE_META: Record<
  AdminActionQueueCategory,
  { priority: AdminActionQueuePriority; rt: AdminActionQueueRtPolicy; soundEligible: boolean }
> = Object.fromEntries(
  ADMIN_ACTION_QUEUE_REGISTRY.map((d) => [
    d.key,
    { priority: d.priority, rt: d.rt, soundEligible: d.soundEligible },
  ])
) as Record<
  AdminActionQueueCategory,
  { priority: AdminActionQueuePriority; rt: AdminActionQueueRtPolicy; soundEligible: boolean }
>;

/** Category status in API responses — "unavailable" / "forbidden" MUST NOT render as 0. */
export type AdminActionQueueCategoryStatus = "ok" | "unavailable" | "forbidden";

export type AdminActionQueueCategoryResult = {
  key: AdminActionQueueCategory;
  /** null when status ≠ ok */
  count: number | null;
  status: AdminActionQueueCategoryStatus;
  inTotal: boolean;
  nextActor: AdminActionQueueNextActor;
  listHref: string | null;
};

/** Sidebar badge = Σ ok counts of categories mapped to the menu key. */
export function sumAdminQueueCountsForMenuKey(
  menuKey: string,
  categories: readonly AdminActionQueueCategoryResult[]
): number {
  let n = 0;
  for (const c of categories) {
    if (c.status !== "ok" || c.count == null) continue;
    const def = ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY.get(c.key);
    if (def?.sidebarMenuKeys.includes(menuKey)) n += c.count;
  }
  return n;
}

/** True when any category mapped to the menu key could not be counted. */
export function menuKeyHasUnavailableAdminQueue(
  menuKey: string,
  categories: readonly AdminActionQueueCategoryResult[]
): boolean {
  return categories.some((c) => {
    if (c.status !== "unavailable") return false;
    return ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY.get(c.key)?.sidebarMenuKeys.includes(menuKey) ?? false;
  });
}

/** Bell digit: "99+" only when the VALID total is ≥ 100. */
export function formatAdminBellBadge(total: number): string {
  return total > 99 ? "99+" : String(total);
}
