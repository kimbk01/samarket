import type { MessageKey } from "@/lib/i18n/messages";
import { translateBy } from "@/lib/i18n/translate-by";
import type { AdminTerminologyConcept } from "./types";

/**
 * Canonical Admin terminology — reuses catalog keys; does not invent a parallel string system.
 * DO NOT USE AS documents semantic collisions (광고≠홍보, 삭제≠숨김, …).
 */
export type TerminologyEntry = {
  concept: AdminTerminologyConcept;
  /** 화면 이름 카탈로그 키 (언어 SSOT B4 — 대체 문구 제거, 키는 모두 카탈로그에 있음). */
  i18nKey: MessageKey;
  domain: string;
  meaning: string;
  doNotUseAs: readonly string[];
};

const TERMS: Record<AdminTerminologyConcept, TerminologyEntry> = {
  MEMBER: {
    concept: "MEMBER",
    i18nKey: "admin_management_term_member",
    domain: "SYSTEM",
    meaning: "End-user / profile identity",
    doNotUseAs: ["Owner", "매장", "업체"],
  },
  STORE: {
    concept: "STORE",
    i18nKey: "admin_management_term_store",
    domain: "DELIVERY",
    meaning: "Store business entity",
    doNotUseAs: ["회원", "Owner alone"],
  },
  OWNER: {
    concept: "OWNER",
    i18nKey: "admin_management_term_owner",
    domain: "DELIVERY",
    meaning: "Store operator actor",
    doNotUseAs: ["회원"],
  },
  PRODUCT: {
    concept: "PRODUCT",
    i18nKey: "admin_management_term_product",
    domain: "TRADE/DELIVERY",
    meaning: "Catalog / trade listing product",
    doNotUseAs: ["게시물 (community)", "메뉴"],
  },
  MENU: {
    concept: "MENU",
    i18nKey: "admin_management_term_menu",
    domain: "DELIVERY",
    meaning: "Store menu item",
    doNotUseAs: ["상품 (trade listing)"],
  },
  CATEGORY: {
    concept: "CATEGORY",
    i18nKey: "admin_posts_mgmt_th_category",
    domain: "COMMON",
    meaning: "Classification",
    doNotUseAs: [],
  },
  POST: {
    concept: "POST",
    i18nKey: "admin_management_term_post",
    domain: "COMMUNITY/TRADE",
    meaning: "Content unit",
    doNotUseAs: ["상품 (when meaning trade product SSOT)"],
  },
  COMMENT: {
    concept: "COMMENT",
    i18nKey: "admin_management_term_comment",
    domain: "COMMUNITY",
    meaning: "Comment on a post",
    doNotUseAs: [],
  },
  REPORT: {
    concept: "REPORT",
    i18nKey: "admin_management_term_report",
    domain: "COMMUNITY/TRADE",
    meaning: "Moderation report",
    doNotUseAs: ["고객지원", "Support case"],
  },
  MEETING_REPORT: {
    concept: "MEETING_REPORT",
    i18nKey: "admin_management_term_meeting_report",
    domain: "COMMUNITY",
    meaning: "Philife meeting report (separate table)",
    doNotUseAs: ["community_reports"],
  },
  SUPPORT_CASE: {
    concept: "SUPPORT_CASE",
    i18nKey: "admin_management_term_support_case",
    domain: "SUPPORT",
    meaning: "Support case SSOT",
    doNotUseAs: ["신고"],
  },
  ADVERTISEMENT: {
    concept: "ADVERTISEMENT",
    i18nKey: "admin_management_term_advertisement",
    domain: "ADS",
    meaning: "Paid ad product / inventory",
    doNotUseAs: ["홍보", "Community Point promotion"],
  },
  PROMOTION: {
    concept: "PROMOTION",
    i18nKey: "admin_management_term_promotion",
    domain: "COMMUNITY",
    meaning: "Point paid exposure (point_promotion_orders)",
    doNotUseAs: ["광고 (Delivery/Feed AdProduct)"],
  },
  EXPOSURE: {
    concept: "EXPOSURE",
    i18nKey: "admin_management_term_exposure",
    domain: "ADS",
    meaning: "Placement / visibility surface",
    doNotUseAs: ["광고 product itself"],
  },
  POINT: {
    concept: "POINT",
    i18nKey: "admin_management_term_point",
    domain: "FINANCE",
    meaning: "Member Point ledger unit",
    doNotUseAs: ["Coin", "Cash"],
  },
  COIN: {
    concept: "COIN",
    i18nKey: "admin_management_term_coin",
    domain: "FINANCE",
    meaning: "Store Coin unit",
    doNotUseAs: ["Point", "Cash"],
  },
  CASH: {
    concept: "CASH",
    i18nKey: "admin_management_term_cash",
    domain: "FINANCE",
    meaning: "Store Cash funding unit",
    doNotUseAs: ["Point", "Coin"],
  },
  SETTLEMENT: {
    concept: "SETTLEMENT",
    i18nKey: "admin_management_term_settlement",
    domain: "FINANCE/DELIVERY",
    meaning: "Store order payout settlement",
    doNotUseAs: ["출금 alone", "충전"],
  },
  WITHDRAWAL: {
    concept: "WITHDRAWAL",
    i18nKey: "admin_management_term_withdrawal",
    domain: "FINANCE",
    meaning: "Coin/cash withdraw request",
    doNotUseAs: ["정산"],
  },
  CHARGE: {
    concept: "CHARGE",
    i18nKey: "admin_management_term_charge",
    domain: "FINANCE",
    meaning: "Funding top-up",
    doNotUseAs: ["전환"],
  },
  CONVERT: {
    concept: "CONVERT",
    i18nKey: "admin_management_term_convert",
    domain: "FINANCE",
    meaning: "Coin → Cash conversion",
    doNotUseAs: ["충전"],
  },
  DELETE: {
    concept: "DELETE",
    i18nKey: "common_delete",
    domain: "COMMON",
    meaning:
      "Bare word only — do NOT use for Admin ops CTAs. Prefer SOFT_DELETE or HARD_DELETE.",
    doNotUseAs: ["숨김", "DB 영구 삭제", "삭제(상태)"],
  },
  SOFT_DELETE: {
    concept: "SOFT_DELETE",
    i18nKey: "admin_mgmt_action_soft_delete",
    domain: "COMMON",
    meaning:
      "Row remains in DB; canonical soft/status deleted flag. Not permanent wipe.",
    doNotUseAs: ["DB 영구 삭제", "숨김"],
  },
  HARD_DELETE: {
    concept: "HARD_DELETE",
    i18nKey: "admin_mgmt_action_hard_delete",
    domain: "COMMON",
    meaning: "Actual DB row (+ canonical child deps) removal. Irreversible.",
    doNotUseAs: ["삭제", "삭제(상태)", "숨김"],
  },
  HIDE: {
    concept: "HIDE",
    i18nKey: "admin_posts_mgmt_action_hide",
    domain: "COMMON",
    meaning: "Soft visibility off; recoverable",
    doNotUseAs: ["삭제", "삭제(상태)", "DB 영구 삭제"],
  },
  RESTORE: {
    concept: "RESTORE",
    i18nKey: "admin_management_term_restore",
    domain: "COMMON",
    meaning: "Undo hide / soft-delete visibility",
    doNotUseAs: ["승인"],
  },
  DEACTIVATE: {
    concept: "DEACTIVATE",
    i18nKey: "admin_management_term_deactivate",
    domain: "COMMON",
    meaning: "Disable without delete",
    doNotUseAs: ["삭제"],
  },
  RECEIVE: {
    concept: "RECEIVE",
    i18nKey: "admin_management_term_receive",
    domain: "DELIVERY",
    meaning: "Order accept step",
    doNotUseAs: ["광고 승인"],
  },
  REVIEW: {
    concept: "REVIEW",
    i18nKey: "admin_management_term_review",
    domain: "COMMON",
    meaning: "Under review",
    doNotUseAs: [],
  },
  APPROVE: {
    concept: "APPROVE",
    i18nKey: "admin_management_term_approve",
    domain: "COMMON",
    meaning: "Approval transition",
    doNotUseAs: ["접수 (orders)"],
  },
  COMPLETE: {
    concept: "COMPLETE",
    i18nKey: "admin_management_term_complete",
    domain: "COMMON",
    meaning: "Finished state",
    doNotUseAs: [],
  },
  CANCEL: {
    concept: "CANCEL",
    i18nKey: "common_cancel",
    domain: "COMMON",
    meaning: "Cancel workflow",
    doNotUseAs: [],
  },
  DETAIL: {
    concept: "DETAIL",
    i18nKey: "admin_management_term_detail",
    domain: "COMMON",
    meaning: "Open detail surface",
    doNotUseAs: ["관리 (when only navigation to detail)"],
  },
  MANAGE: {
    concept: "MANAGE",
    i18nKey: "admin_management_term_manage",
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

/** 화면 이름 — 언어 값이 "en" 이면 영어, 그 외는 한국어(원래 동작과 같음). */
export function terminologyDisplay(
  concept: AdminTerminologyConcept,
  language: string | undefined
): string {
  return translateBy(language, TERMS[concept].i18nKey, undefined, "ko");
}
