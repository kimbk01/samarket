/**
 * Phase 1 — Admin ownership visibility + list semantics (UI labels only).
 * No new writers. No DB columns. Composition ≠ raw presentation_type.
 */

import {
  resolvePlatformPopupComposition,
  type PlatformPopupComposition,
} from "@/lib/platform-popup/resolve-presentation-composition";
import {
  eventBannerPlacementLabel,
  eventBannerPresentationLabel,
  normalizeEventBannerPresentation,
  type EventBannerPlacement,
  type EventBannerPresentation,
} from "@/lib/platform-promotion-distribution/banner-presentation";
import type { PromotionDistributionRow } from "@/lib/platform-promotion-distribution/types";
import { isBenefitDialogEligibleForEventSections } from "@/lib/platform-popup/event-benefit-authority";

export type OwnershipLabelLang = "ko" | "en";

/** Ads workspace purpose — operator-facing. */
export function adsWorkspacePurposeCopy(lang: OwnershipLabelLang): string {
  return lang === "en"
    ? "Manage paid ads and ad placement inventory / exposure."
    : "유료 광고와 광고 노출 위치/재고를 관리합니다.";
}

/** Promotion workspace purpose — operator-facing. */
export function promotionWorkspacePurposeCopy(lang: OwnershipLabelLang): string {
  return lang === "en"
    ? "Manage event content and popup, banner, push, and in-app notification exposure."
    : "이벤트 콘텐츠와 팝업·배너·Push·앱 알림 노출을 관리합니다.";
}

export function placementInventoryPurposeCopy(lang: OwnershipLabelLang): string {
  return lang === "en"
    ? "Inspect placements and current usage for paid ads and inline promotions."
    : "광고와 인라인 프로모션이 실제로 사용하는 노출 위치와 현재 사용 현황을 확인합니다.";
}

export function eventIsContentDestinationCopy(lang: OwnershipLabelLang): string {
  return lang === "en"
    ? "An Event is the content and destination. Popup, Banner, Push, and Bell are exposure channels."
    : "이벤트는 콘텐츠와 목적지입니다. 팝업·배너·Push·앱 알림은 노출 채널입니다.";
}

export function bannerListPurposeCopy(lang: OwnershipLabelLang): string {
  return lang === "en"
    ? "Event banners shown inside Community and Trade screens. Edit exposure on the Event page."
    : "커뮤니티·거래 화면에 노출되는 이벤트 배너를 관리합니다. 수정은 이벤트 노출 설정에서 합니다.";
}

export function inlineSharesPlacementCopy(lang: OwnershipLabelLang): string {
  return lang === "en"
    ? "Inline banners share existing ad placement inventory and also appear on Placement status."
    : "인라인 배너는 기존 광고 노출 위치를 함께 사용하며, 노출 위치 현황에서도 확인할 수 있습니다.";
}

export type PlacementSourceKind = "paid" | "admin_direct" | "event_promotion";

export function placementSourceBadgeLabel(
  kind: PlacementSourceKind,
  lang: OwnershipLabelLang
): string {
  if (kind === "event_promotion") {
    return lang === "en" ? "Event promotion" : "이벤트 프로모션";
  }
  if (kind === "admin_direct") {
    return lang === "en" ? "Admin direct ad" : "관리자 직접 광고";
  }
  return lang === "en" ? "Paid ad" : "유료 광고";
}

export function popupCompositionOperatorLabel(
  composition: PlatformPopupComposition,
  lang: OwnershipLabelLang
): string {
  switch (composition) {
    case "artwork_modal":
      return lang === "en" ? "Artwork popup" : "아트워크 팝업";
    case "promotion_card_modal":
      return lang === "en" ? "Promotion card" : "프로모션 카드";
    case "bottom_promotion_sheet":
      return lang === "en" ? "Bottom promotion sheet" : "하단 프로모션 시트";
    case "benefit_dialog":
      return lang === "en" ? "Benefit / coupon dialog" : "혜택/쿠폰 다이얼로그";
  }
}

/**
 * Operator-visible popup form — NEVER raw center_modal.
 * Artwork vs Card distinguished via creativeMode.
 */
export function resolvePopupListCompositionLabel(input: {
  presentationType?: string | null;
  creativeMode?: string | null;
  lang: OwnershipLabelLang;
}): string {
  const composition = resolvePlatformPopupComposition({
    presentationType: input.presentationType,
    creativeMode: input.creativeMode,
  });
  return popupCompositionOperatorLabel(composition, input.lang);
}

export type PopupBenefitOperationalHint = "none" | "benefit_info_needed" | "event_link_needed";

export function resolvePopupBenefitOperationalHint(input: {
  presentationType?: string | null;
  creativeMode?: string | null;
  linkedEventId?: string | null;
  linkedEventHasBenefit?: boolean | null;
}): PopupBenefitOperationalHint {
  const composition = resolvePlatformPopupComposition({
    presentationType: input.presentationType,
    creativeMode: input.creativeMode,
  });
  if (composition !== "benefit_dialog") return "none";
  if (!input.linkedEventId) return "event_link_needed";
  if (input.linkedEventHasBenefit === false) return "benefit_info_needed";
  if (input.linkedEventHasBenefit == null) return "benefit_info_needed";
  return "none";
}

export function popupBenefitHintLabel(
  hint: PopupBenefitOperationalHint,
  lang: OwnershipLabelLang
): string | null {
  if (hint === "benefit_info_needed") {
    return lang === "en" ? "Benefit info required" : "혜택 정보 필요";
  }
  if (hint === "event_link_needed") {
    return lang === "en" ? "Link an Event with benefit" : "혜택이 있는 이벤트 연결 필요";
  }
  return null;
}

export function popupApprovalStatusLabel(
  approvalStatus: string | null | undefined,
  lang: OwnershipLabelLang
): string {
  const s = String(approvalStatus ?? "").trim().toLowerCase();
  const ko: Record<string, string> = {
    not_submitted: "작성 중",
    pending_review: "승인 대기",
    approved: "승인 완료",
    rejected: "반려",
  };
  const en: Record<string, string> = {
    not_submitted: "In progress",
    pending_review: "Pending approval",
    approved: "Approved",
    rejected: "Rejected",
  };
  return (lang === "en" ? en[s] : ko[s]) ?? (approvalStatus || "—");
}

export function popupFrequencyOperatorLabel(
  frequencyMode: string | null | undefined,
  lang: OwnershipLabelLang
): string {
  const s = String(frequencyMode ?? "").trim().toLowerCase();
  const ko: Record<string, string> = {
    close_only: "닫기만 (레거시)",
    once_per_session: "세션당 1회",
    once_per_day: "하루 1회",
    once_campaign: "캠페인당 1회",
    always: "방문마다",
  };
  const en: Record<string, string> = {
    close_only: "Close only (legacy)",
    once_per_session: "Once per session",
    once_per_day: "Once per day",
    once_campaign: "Once per campaign",
    always: "Every visit",
  };
  return (lang === "en" ? en[s] : ko[s]) ?? (frequencyMode || "—");
}

/**
 * Event Distribution materialize ≠ live Popup.
 * Dist ON + channel ref still needs Popup approval/exposure management.
 */
export function distributionPopupLifecycleNotice(input: {
  enabled: boolean;
  channelRefId?: string | null;
  distributionStatus?: string | null;
  lang: OwnershipLabelLang;
}): { kind: "off" | "draft_needs_ops" | "linked"; message: string; manageHref: string | null } {
  if (!input.enabled) {
    return {
      kind: "off",
      message:
        input.lang === "en"
          ? "Popup OFF — save will not activate the popup engine."
          : "팝업 꺼짐 — 저장해도 팝업 엔진이 활성화되지 않습니다.",
      manageHref: null,
    };
  }
  const ref = String(input.channelRefId ?? "").trim();
  if (!ref) {
    return {
      kind: "draft_needs_ops",
      message:
        input.lang === "en"
          ? "Popup draft will be created on save — approval and exposure still required."
          : "저장 시 팝업 초안이 생성됩니다 — 승인/노출 설정이 별도로 필요합니다.",
      manageHref: null,
    };
  }
  return {
    kind: "linked",
    message:
      input.lang === "en"
        ? "Popup draft linked — approval/exposure still managed in Popup editor (Distribution does not auto-activate)."
        : "팝업 초안 연결됨 — 승인/노출은 팝업 편집에서 설정합니다 (배포 저장만으로 노출되지 않음).",
    manageHref: popupEditHref(ref),
  };
}

/** Event linkage contract per operator composition (code evidence helper). */
export function popupCompositionEventRequirement(
  composition: PlatformPopupComposition
): "optional" | "required" {
  return composition === "benefit_dialog" ? "required" : "optional";
}

export function popupSurfaceOperatorLabel(
  surface: string,
  lang: OwnershipLabelLang
): string {
  const s = String(surface ?? "").trim().toUpperCase();
  const ko: Record<string, string> = {
    GLOBAL: "전역",
    COMMUNITY: "커뮤니티",
    TRADE: "거래",
    DELIVERY: "배달",
    DELIVERY_OWNER: "배달 오너",
    ADMIN: "관리자",
    MYPAGE: "마이페이지",
  };
  const en: Record<string, string> = {
    GLOBAL: "Global",
    COMMUNITY: "Community",
    TRADE: "Trade",
    DELIVERY: "Delivery",
    DELIVERY_OWNER: "Delivery owner",
    ADMIN: "Admin",
    MYPAGE: "My page",
  };
  return (lang === "en" ? en[s] : ko[s]) ?? surface;
}

export function popupDestinationSummary(input: {
  ctaType: string;
  ctaTarget?: string | null;
  externalUrl?: string | null;
  lang: OwnershipLabelLang;
}): string {
  const t = String(input.ctaType ?? "").trim();
  if (t === "event_detail") {
    const id = String(input.ctaTarget ?? "").trim();
    return input.lang === "en"
      ? `Event${id ? ` · ${id.slice(0, 8)}` : ""}`
      : `이벤트${id ? ` · ${id.slice(0, 8)}` : ""}`;
  }
  if (t === "external_url") {
    return String(input.externalUrl ?? "").trim() || (input.lang === "en" ? "External URL" : "외부 URL");
  }
  if (t === "internal_page") {
    return String(input.ctaTarget ?? "").trim() || (input.lang === "en" ? "Internal page" : "앱 내 페이지");
  }
  return t || "—";
}

/**
 * Richer Event list channel summary: Popup · Inline/Hero · Push · Bell.
 * Uses Dist rows when available (read-only).
 */
export function channelSummaryFromDistributionRows(
  rows: readonly PromotionDistributionRow[],
  lang: OwnershipLabelLang = "ko"
): string {
  const parts: string[] = [];
  for (const row of rows) {
    if (!row.enabled) continue;
    if (row.channel === "popup") {
      parts.push(lang === "en" ? "Popup" : "팝업");
      continue;
    }
    if (row.channel === "banner") {
      const presentation = normalizeEventBannerPresentation(
        String((row.config as { presentation?: string } | null)?.presentation ?? "")
      );
      parts.push(eventBannerPresentationLabel(presentation, lang));
      continue;
    }
    if (row.channel === "push") {
      parts.push("Push");
      continue;
    }
    if (row.channel === "bell") {
      parts.push(lang === "en" ? "Bell" : "앱 알림");
    }
  }
  if (parts.length === 0) return lang === "en" ? "No channels" : "채널 없음";
  return parts.join(" · ");
}

export function bannerDestinationSummary(
  href: string | null | undefined,
  lang: OwnershipLabelLang
): string {
  if (href) {
    return lang === "en" ? "Event detail" : "이벤트 상세";
  }
  return lang === "en" ? "—" : "—";
}

export function eventBannerRowMeta(input: {
  presentation: EventBannerPresentation;
  placement: EventBannerPlacement;
  lang: OwnershipLabelLang;
}): { presentationLabel: string; placementLabel: string } {
  return {
    presentationLabel: eventBannerPresentationLabel(input.presentation, input.lang),
    placementLabel: eventBannerPlacementLabel(input.placement, input.lang),
  };
}

/** Pure helper for tests — Benefit eligibility from sections jsonb. */
export function eventSectionsHaveBenefit(sections: unknown): boolean {
  return isBenefitDialogEligibleForEventSections(sections);
}

export const PLACEMENTS_INVENTORY_HREF = "/admin/advertising/placements";
export const ADS_WORKSPACE_HREF = "/admin/advertising";
export const NOTIFICATIONS_SEND_HREF = "/admin/notifications";

export function eventDistributionHref(eventId: string): string {
  return `/admin/platform-events/${encodeURIComponent(eventId)}#distribution`;
}

export function eventEditHref(eventId: string): string {
  return `/admin/platform-events/${encodeURIComponent(eventId)}`;
}

export function eventPreviewHref(eventId: string): string {
  return `/admin/platform-events/${encodeURIComponent(eventId)}#preview`;
}

export function popupEditHref(campaignId: string): string {
  return `/admin/platform-popup/${encodeURIComponent(campaignId)}`;
}
