/**
 * DIBAY Support Center — FAB / entry context TRANSPORT ONLY.
 * Category semantic authority: support-category-registry.ts
 * Visibility is opt-in per screen (`enabled: true`). No pathname inference.
 */

export type { SupportAudience, SupportCategory, MemberSupportCategory, OwnerSupportCategory } from "@/lib/support/support-category-registry";
export {
  MEMBER_SUPPORT_CATEGORIES,
  OWNER_SUPPORT_CATEGORIES,
} from "@/lib/support/support-category-registry";

import type {
  SupportAudience,
  SupportCategory,
  MemberSupportCategory,
  OwnerSupportCategory,
} from "@/lib/support/support-category-registry";

export type SupportContext = {
  enabled: boolean;
  audience: SupportAudience;
  /**
   * Category candidate (may be legacy alias; server maps to canonical).
   * Empty string + needsCategorySelection → PHASE 3-B generic triage START_CATEGORY.
   */
  category: SupportCategory | "";
  sourceSurface: string;
  referenceType?: string;
  referenceId?: string;
  /** 설계 2026-11-08 ①: 관련 항목 **표시용** 제목(최대 80자) — 권한·저장은 referenceType+referenceId 만 본다 */
  referenceTitle?: string;
  storeId?: string;
  /**
   * Set only when the user explicitly picked 기타 on a generic hub gate / triage.
   * Required for generic hub + OTHER (server fail-closed otherwise).
   */
  explicitOtherSelection?: boolean;
  /** Generic START: modal shows category picker; do not invent OTHER. */
  needsCategorySelection?: boolean;
  /** 화면 표시용 세부 유형 미리 선택(접수형) — 서버는 open 요청의 issueType 만 본다 */
  issueType?: string;
  /** 주문 화면 — 「매장에 문의하기(주문 채팅)」 주소. 채팅을 열 수 없는 주문이면 비운다(표시 전용) */
  storeChatHref?: string;
};

/**
 * Disabled placeholder — category OTHER is inert while enabled=false.
 * Must never be used as an implicit open default (open path rejects disabled).
 */
export const DISABLED_SUPPORT_CONTEXT: SupportContext = {
  enabled: false,
  audience: "MEMBER",
  category: "OTHER",
  sourceSurface: "none",
};

export type MemberSupportContextInput = {
  enabled: boolean;
  category: MemberSupportCategory;
  sourceSurface: string;
  referenceType?: string;
  referenceId?: string;
  referenceTitle?: string;
  explicitOtherSelection?: boolean;
  /** 화면 표시용 세부 유형 미리 선택(접수형) */
  issueType?: string;
  /** 주문 화면 — 「매장에 문의하기(주문 채팅)」 주소(표시 전용) */
  storeChatHref?: string;
};

export type OwnerSupportContextInput = {
  enabled: boolean;
  category: OwnerSupportCategory;
  sourceSurface: string;
  storeId?: string;
  referenceType?: string;
  referenceId?: string;
  explicitOtherSelection?: boolean;
};

export function buildMemberSupportContext(input: MemberSupportContextInput): SupportContext {
  return {
    enabled: input.enabled === true,
    audience: "MEMBER",
    category: input.category,
    sourceSurface: input.sourceSurface.trim() || "unknown",
    referenceType: input.referenceType?.trim() || undefined,
    referenceId: input.referenceId?.trim() || undefined,
    ...(supportReferenceTitle(input.referenceTitle) ? { referenceTitle: supportReferenceTitle(input.referenceTitle) } : {}),
    ...(input.explicitOtherSelection === true ? { explicitOtherSelection: true } : {}),
    ...(input.issueType?.trim() ? { issueType: input.issueType.trim() } : {}),
    ...(input.storeChatHref?.trim() ? { storeChatHref: input.storeChatHref.trim() } : {}),
  };
}

/** 표시용 제목 정리 — 앞뒤 공백 제거 · 80자 자름 · 비면 undefined */
export function supportReferenceTitle(v: string | null | undefined): string | undefined {
  const t = String(v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 80) : undefined;
}

export function buildOwnerSupportContext(input: OwnerSupportContextInput): SupportContext {
  const storeId = input.storeId?.trim() || undefined;
  return {
    enabled: input.enabled === true,
    audience: "OWNER",
    category: input.category,
    sourceSurface: input.sourceSurface.trim() || "unknown",
    storeId,
    referenceType: input.referenceType?.trim() || undefined,
    referenceId: input.referenceId?.trim() || undefined,
    ...(input.explicitOtherSelection === true ? { explicitOtherSelection: true } : {}),
  };
}

/** PHASE 3-B generic hub → modal START_CATEGORY (no OTHER invent). */
export function buildGenericSupportTriageContext(input: {
  audience: SupportAudience;
  sourceSurface: string;
  storeId?: string;
}): SupportContext {
  const storeId = input.storeId?.trim() || undefined;
  return {
    enabled: true,
    audience: input.audience === "OWNER" ? "OWNER" : "MEMBER",
    category: "",
    sourceSurface: input.sourceSurface.trim() || "unknown",
    storeId,
    needsCategorySelection: true,
  };
}

export function isSupportContextEnabled(ctx: SupportContext | null | undefined): ctx is SupportContext {
  if (!ctx || ctx.enabled !== true) return false;
  if (ctx.needsCategorySelection === true) return true;
  return Boolean(String(ctx.category ?? "").trim());
}

export const SUPPORT_CONTEXT_SESSION_KEY = "dibay:support:center:pending-context";
