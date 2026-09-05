import type { AdminTerminologyConcept } from "./types";

/**
 * Canonical Admin terminology — reuses catalog keys; does not invent a parallel string system.
 * DO NOT USE AS documents semantic collisions (광고≠홍보, 삭제≠숨김, …).
 */
export type TerminologyEntry = {
  concept: AdminTerminologyConcept;
  /** Preferred i18n catalog key when present in catalogs. */
  i18nKey: string;
  fallbackKo: string;
  fallbackEn: string;
  domain: string;
  meaning: string;
  doNotUseAs: readonly string[];
};

const TERMS: Record<AdminTerminologyConcept, TerminologyEntry> = {
  MEMBER: {
    concept: "MEMBER",
    i18nKey: "admin_menu_users",
    fallbackKo: "회원",
    fallbackEn: "Member",
    domain: "SYSTEM",
    meaning: "End-user / profile identity",
    doNotUseAs: ["Owner", "매장", "업체"],
  },
  STORE: {
    concept: "STORE",
    i18nKey: "admin_menu_stores",
    fallbackKo: "매장",
    fallbackEn: "Store",
    domain: "DELIVERY",
    meaning: "Store business entity",
    doNotUseAs: ["회원", "Owner alone"],
  },
  OWNER: {
    concept: "OWNER",
    i18nKey: "admin_common_store_owner",
    fallbackKo: "Owner",
    fallbackEn: "Owner",
    domain: "DELIVERY",
    meaning: "Store operator actor",
    doNotUseAs: ["회원"],
  },
  PRODUCT: {
    concept: "PRODUCT",
    i18nKey: "admin_posts_mgmt_product",
    fallbackKo: "상품",
    fallbackEn: "Product",
    domain: "TRADE/DELIVERY",
    meaning: "Catalog / trade listing product",
    doNotUseAs: ["게시물 (community)", "메뉴"],
  },
  MENU: {
    concept: "MENU",
    i18nKey: "admin_menu_menus",
    fallbackKo: "메뉴",
    fallbackEn: "Menu",
    domain: "DELIVERY",
    meaning: "Store menu item",
    doNotUseAs: ["상품 (trade listing)"],
  },
  CATEGORY: {
    concept: "CATEGORY",
    i18nKey: "admin_posts_mgmt_th_category",
    fallbackKo: "카테고리",
    fallbackEn: "Category",
    domain: "COMMON",
    meaning: "Classification",
    doNotUseAs: [],
  },
  POST: {
    concept: "POST",
    i18nKey: "admin_menu_community_posts",
    fallbackKo: "게시물",
    fallbackEn: "Post",
    domain: "COMMUNITY/TRADE",
    meaning: "Content unit",
    doNotUseAs: ["상품 (when meaning trade product SSOT)"],
  },
  COMMENT: {
    concept: "COMMENT",
    i18nKey: "admin_menu_community_comments",
    fallbackKo: "댓글",
    fallbackEn: "Comment",
    domain: "COMMUNITY",
    meaning: "Comment on a post",
    doNotUseAs: [],
  },
  REPORT: {
    concept: "REPORT",
    i18nKey: "admin_menu_community_reports",
    fallbackKo: "신고",
    fallbackEn: "Report",
    domain: "COMMUNITY/TRADE",
    meaning: "Moderation report",
    doNotUseAs: ["고객지원", "Support case"],
  },
  MEETING_REPORT: {
    concept: "MEETING_REPORT",
    i18nKey: "admin_menu_meeting_reports",
    fallbackKo: "모임 신고",
    fallbackEn: "Meeting report",
    domain: "COMMUNITY",
    meaning: "Philife meeting report (separate table)",
    doNotUseAs: ["community_reports"],
  },
  SUPPORT_CASE: {
    concept: "SUPPORT_CASE",
    i18nKey: "admin_menu_support",
    fallbackKo: "고객지원",
    fallbackEn: "Support case",
    domain: "SUPPORT",
    meaning: "Support case SSOT",
    doNotUseAs: ["신고"],
  },
  ADVERTISEMENT: {
    concept: "ADVERTISEMENT",
    i18nKey: "admin_menu_ads",
    fallbackKo: "광고",
    fallbackEn: "Advertisement",
    domain: "ADS",
    meaning: "Paid ad product / inventory",
    doNotUseAs: ["홍보", "Community Point promotion"],
  },
  PROMOTION: {
    concept: "PROMOTION",
    i18nKey: "admin_menu_community_promotions",
    fallbackKo: "홍보",
    fallbackEn: "Promotion",
    domain: "COMMUNITY",
    meaning: "Point paid exposure (point_promotion_orders)",
    doNotUseAs: ["광고 (Delivery/Feed AdProduct)"],
  },
  EXPOSURE: {
    concept: "EXPOSURE",
    i18nKey: "admin_menu_ads_exposure",
    fallbackKo: "노출",
    fallbackEn: "Exposure",
    domain: "ADS",
    meaning: "Placement / visibility surface",
    doNotUseAs: ["광고 product itself"],
  },
  POINT: {
    concept: "POINT",
    i18nKey: "admin_menu_point",
    fallbackKo: "Point",
    fallbackEn: "Point",
    domain: "FINANCE",
    meaning: "Member Point ledger unit",
    doNotUseAs: ["Coin", "Cash"],
  },
  COIN: {
    concept: "COIN",
    i18nKey: "admin_menu_coin",
    fallbackKo: "Coin",
    fallbackEn: "Coin",
    domain: "FINANCE",
    meaning: "Store Coin unit",
    doNotUseAs: ["Point", "Cash"],
  },
  CASH: {
    concept: "CASH",
    i18nKey: "admin_menu_cash",
    fallbackKo: "Cash",
    fallbackEn: "Cash",
    domain: "FINANCE",
    meaning: "Store Cash funding unit",
    doNotUseAs: ["Point", "Coin"],
  },
  SETTLEMENT: {
    concept: "SETTLEMENT",
    i18nKey: "admin_menu_settlements",
    fallbackKo: "정산",
    fallbackEn: "Settlement",
    domain: "FINANCE/DELIVERY",
    meaning: "Store order payout settlement",
    doNotUseAs: ["출금 alone", "충전"],
  },
  WITHDRAWAL: {
    concept: "WITHDRAWAL",
    i18nKey: "admin_menu_withdrawals",
    fallbackKo: "출금",
    fallbackEn: "Withdrawal",
    domain: "FINANCE",
    meaning: "Coin/cash withdraw request",
    doNotUseAs: ["정산"],
  },
  CHARGE: {
    concept: "CHARGE",
    i18nKey: "admin_menu_charges",
    fallbackKo: "충전",
    fallbackEn: "Charge / top-up",
    domain: "FINANCE",
    meaning: "Funding top-up",
    doNotUseAs: ["전환"],
  },
  CONVERT: {
    concept: "CONVERT",
    i18nKey: "admin_menu_convert",
    fallbackKo: "전환",
    fallbackEn: "Convert",
    domain: "FINANCE",
    meaning: "Coin → Cash conversion",
    doNotUseAs: ["충전"],
  },
  DELETE: {
    concept: "DELETE",
    i18nKey: "common_delete",
    fallbackKo: "삭제",
    fallbackEn: "Delete",
    domain: "COMMON",
    meaning: "Destructive remove (soft or hard per policy)",
    doNotUseAs: ["숨김"],
  },
  HIDE: {
    concept: "HIDE",
    i18nKey: "admin_posts_mgmt_action_hide",
    fallbackKo: "숨김",
    fallbackEn: "Hide",
    domain: "COMMON",
    meaning: "Soft visibility off",
    doNotUseAs: ["삭제"],
  },
  RESTORE: {
    concept: "RESTORE",
    i18nKey: "admin_posts_mgmt_action_unhide",
    fallbackKo: "복구",
    fallbackEn: "Restore",
    domain: "COMMON",
    meaning: "Undo hide / soft-delete visibility",
    doNotUseAs: ["승인"],
  },
  DEACTIVATE: {
    concept: "DEACTIVATE",
    i18nKey: "admin_common_deactivate",
    fallbackKo: "비활성",
    fallbackEn: "Deactivate",
    domain: "COMMON",
    meaning: "Disable without delete",
    doNotUseAs: ["삭제"],
  },
  RECEIVE: {
    concept: "RECEIVE",
    i18nKey: "store_owner_transition_accepted",
    fallbackKo: "접수",
    fallbackEn: "Accept / receive",
    domain: "DELIVERY",
    meaning: "Order accept step",
    doNotUseAs: ["광고 승인"],
  },
  REVIEW: {
    concept: "REVIEW",
    i18nKey: "admin_common_review",
    fallbackKo: "검토",
    fallbackEn: "Review",
    domain: "COMMON",
    meaning: "Under review",
    doNotUseAs: [],
  },
  APPROVE: {
    concept: "APPROVE",
    i18nKey: "admin_common_approve",
    fallbackKo: "승인",
    fallbackEn: "Approve",
    domain: "COMMON",
    meaning: "Approval transition",
    doNotUseAs: ["접수 (orders)"],
  },
  COMPLETE: {
    concept: "COMPLETE",
    i18nKey: "admin_common_complete",
    fallbackKo: "완료",
    fallbackEn: "Complete",
    domain: "COMMON",
    meaning: "Finished state",
    doNotUseAs: [],
  },
  CANCEL: {
    concept: "CANCEL",
    i18nKey: "common_cancel",
    fallbackKo: "취소",
    fallbackEn: "Cancel",
    domain: "COMMON",
    meaning: "Cancel workflow",
    doNotUseAs: [],
  },
  DETAIL: {
    concept: "DETAIL",
    i18nKey: "admin_users_action_detail",
    fallbackKo: "상세",
    fallbackEn: "Details",
    domain: "COMMON",
    meaning: "Open detail surface",
    doNotUseAs: ["관리 (when only navigation to detail)"],
  },
  MANAGE: {
    concept: "MANAGE",
    i18nKey: "admin_common_manage",
    fallbackKo: "관리",
    fallbackEn: "Manage",
    domain: "COMMON",
    meaning: "Open management detail when richer than view",
    doNotUseAs: ["상세 when action is view-only"],
  },
};

export function getTerminologyEntry(concept: AdminTerminologyConcept): TerminologyEntry {
  return TERMS[concept];
}

export function listTerminologyEntries(): readonly TerminologyEntry[] {
  return Object.values(TERMS);
}

/** Resolve display label without requiring a typed MessageKey (catalog may lag). */
export function terminologyDisplay(
  concept: AdminTerminologyConcept,
  language: string | undefined
): string {
  const e = TERMS[concept];
  return language === "en" ? e.fallbackEn : e.fallbackKo;
}
