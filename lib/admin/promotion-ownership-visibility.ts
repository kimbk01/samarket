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
import { isPlatformEventPubliclyAvailable } from "@/lib/platform-events/publication";
import { translateBy } from "@/lib/i18n/translate-by";
import { catalogPair } from "@/lib/i18n/catalog-pair";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

export type OwnershipLabelLang = "ko" | "en";

/** Ads workspace purpose — operator-facing. */
export function adsWorkspacePurposeCopy(lang: OwnershipLabelLang): string {
  return translateBy(lang, "admin_manage_paid_ads_and_ad_placement");
}

/** Promotion workspace purpose — operator-facing. */
export function promotionWorkspacePurposeCopy(lang: OwnershipLabelLang): string {
  return translateBy(lang, "admin_promotion_landing_desc");
}

export function placementInventoryPurposeCopy(lang: OwnershipLabelLang): string {
  return translateBy(lang, "admin_inspect_placements_and_current_usage_for");
}

export function eventIsContentDestinationCopy(lang: OwnershipLabelLang): string {
  return translateBy(lang, "admin_platform_events_list_desc");
}

export function bannerListPurposeCopy(lang: OwnershipLabelLang): string {
  return translateBy(lang, "admin_promotion_banner_list_desc");
}

export function inlineSharesPlacementCopy(lang: OwnershipLabelLang): string {
  return translateBy(lang, "admin_promotion_banner_inline_placement_note");
}

export type PlacementSourceKind = "paid" | "admin_direct" | "event_promotion";

export function placementSourceBadgeLabel(
  kind: PlacementSourceKind,
  lang: OwnershipLabelLang
): string {
  if (kind === "event_promotion") {
    return translateBy(lang, "admin_event_promotion");
  }
  if (kind === "admin_direct") {
    return translateBy(lang, "admin_admin_direct_ad");
  }
  return translateBy(lang, "admin_paid_ad");
}

export function popupCompositionOperatorLabel(
  composition: PlatformPopupComposition,
  lang: OwnershipLabelLang
): string {
  switch (composition) {
    case "artwork_modal":
      return translateBy(lang, "admin_artwork_popup");
    case "promotion_card_modal":
      return translateBy(lang, "admin_promotion_card");
    case "bottom_promotion_sheet":
      return translateBy(lang, "admin_bottom_promotion_sheet");
    case "benefit_dialog":
      return translateBy(lang, "admin_benefit_coupon_dialog");
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
    return translateBy(lang, "admin_benefit_info_required");
  }
  if (hint === "event_link_needed") {
    return translateBy(lang, "admin_link_an_event_with_benefit");
  }
  return null;
}

export function popupApprovalStatusLabel(
  approvalStatus: string | null | undefined,
  lang: OwnershipLabelLang
): string {
  const s = String(approvalStatus ?? "").trim().toLowerCase();
  const keys: Record<string, MessageKey> = {
    not_submitted: "admin_ownership_popup_approval_not_submitted",
    pending_review: "admin_ownership_popup_approval_pending_review",
    approved: "admin_ownership_popup_approval_approved",
    rejected: "admin_ownership_popup_approval_rejected",
  };
  const key = keys[s];
  return key ? translateBy(lang, key, undefined, "ko") : (approvalStatus || "—");
}

/**
 * 광고 표면 연동 F-3·P-7·CX-08·CX-09 (2026-11-04): 빈도 이름 정본 — 팝업·PTR·이벤트 배포 패널 모든 어드민 화면이
 * 이 함수만 쓴다. 선택지는 `PLATFORM_POPUP_FREQUENCY_MODES` 4개뿐(「방문마다」always 없음).
 */
const POPUP_FREQUENCY_LABEL: Record<string, { ko: string; en: string }> = {
  once_per_session: catalogPair("admin_once_per_app_launch"),
  once_per_day: catalogPair("admin_once_per_day"),
  once_campaign: catalogPair("admin_once_per_campaign"),
  close_only: catalogPair("admin_close_only_no_record"),
};

export function popupFrequencyOperatorLabel(
  frequencyMode: string | null | undefined,
  lang: OwnershipLabelLang
): string {
  const s = String(frequencyMode ?? "").trim().toLowerCase();
  const row = POPUP_FREQUENCY_LABEL[s];
  if (row) return lang === "en" ? row.en : row.ko;
  // 정본 4개 밖의 값(예전 저장값)은 코드값을 보이지 않는다
  return translateBy(lang, "admin_trade_label_unknown");
}

/** 빈도별 안내문 정본 — 닫거나 버튼을 눌렀을 때 언제까지 안 나오는지. `kind` 는 close_only 만 팝업·PTR 이 다르다. */
export function popupFrequencyOperatorDescription(
  frequencyMode: string | null | undefined,
  lang: OwnershipLabelLang,
  kind: "popup" | "ptr" = "popup"
): string {
  const s = String(frequencyMode ?? "").trim().toLowerCase();
  const en = lang === "en";
  switch (s) {
    case "once_per_session":
      return tx(!en, "admin_promotion_dismiss_session");
    case "once_per_day":
      return tx(!en, "admin_promotion_dismiss_day");
    case "once_campaign":
      return tx(!en, "admin_promotion_dismiss_version");
    case "close_only":
      return kind === "ptr"
        ? tx(!en, "admin_promotion_no_record_screen")
        : tx(!en, "admin_promotion_no_record_session");
    default:
      return "";
  }
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
        translateBy(input.lang, "admin_platform_events_popup_off"),
      manageHref: null,
    };
  }
  const ref = String(input.channelRefId ?? "").trim();
  if (!ref) {
    return {
      kind: "draft_needs_ops",
      message:
        translateBy(input.lang, "admin_popup_draft_will_be_created_on"),
      manageHref: null,
    };
  }
  return {
    kind: "linked",
    message:
      translateBy(input.lang, "admin_popup_draft_linked_approval_exposure_still"),
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
  const keys: Record<string, MessageKey> = {
    GLOBAL: "admin_ownership_popup_surface_global",
    COMMUNITY: "admin_ownership_popup_surface_community",
    TRADE: "admin_ownership_popup_surface_trade",
    DELIVERY: "admin_ownership_popup_surface_delivery",
    DELIVERY_OWNER: "admin_ownership_popup_surface_delivery_owner",
    ADMIN: "admin_ownership_popup_surface_admin",
    MYPAGE: "admin_ownership_popup_surface_mypage",
  };
  const key = keys[s];
  return key ? translateBy(lang, key, undefined, "ko") : surface;
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
    return translateBy(input.lang, "admin_event_v1", { v1: id ? ` · ${id.slice(0, 8)}` : "" });
  }
  if (t === "external_url") {
    return String(input.externalUrl ?? "").trim() || (translateBy(input.lang, "admin_platform_events_field_cta_external_url"));
  }
  if (t === "internal_page") {
    return String(input.ctaTarget ?? "").trim() || (translateBy(input.lang, "admin_internal_page_2"));
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
      parts.push(translateBy(lang, "admin_ad_kind_popup_campaign"));
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
      parts.push(translateBy(lang, "admin_bell_inbox"));
    }
  }
  if (parts.length === 0) return translateBy(lang, "admin_no_channels");
  return parts.join(" · ");
}

export function bannerDestinationSummary(
  href: string | null | undefined,
  lang: OwnershipLabelLang
): string {
  if (href) {
    return translateBy(lang, "admin_event_detail");
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

/** Platform Promotion workspace hub — deep-link only (no writer merge). */
export const PROMOTION_WORKSPACE_HREF = "/admin/platform-promotion";
export const NOTIFICATIONS_SEND_HREF = "/admin/notifications";
export const NOTIFICATIONS_CREATE_HREF = "/admin/notifications/create";
export const PROMOTION_NOTIFICATIONS_HUB_HREF = "/admin/platform-promotion/notifications";

/** Canonical notification campaign detail (Push send / Bell register owner). */
export function notificationCampaignManageHref(campaignId: string): string {
  return `/admin/notifications/${encodeURIComponent(campaignId)}`;
}

/**
 * Event Dist Push/Bell are optional orchestration.
 * Standalone campaigns can be created at /admin/notifications without an Event.
 */
export function notificationChannelEventRequirement(
  channel: "push" | "bell"
): "optional" {
  void channel;
  return "optional";
}

export function notificationCampaignStatusOperatorLabel(
  status: string | null | undefined,
  lang: OwnershipLabelLang
): string {
  const s = String(status ?? "").trim().toLowerCase();
  const keys: Record<string, MessageKey> = {
    draft: "admin_ownership_notification_status_draft",
    scheduled: "admin_ownership_notification_status_scheduled",
    sending: "admin_ownership_notification_status_sending",
    sent: "admin_ownership_notification_status_sent",
    partially_failed: "admin_ownership_notification_status_partially_failed",
    failed: "admin_ownership_notification_status_failed",
    cancelled: "admin_ownership_notification_status_cancelled",
    configured: "admin_ownership_notification_status_configured",
    disabled: "admin_ownership_notification_status_disabled",
    active: "admin_ownership_notification_status_active",
  };
  const key = keys[s];
  return key ? translateBy(lang, key, undefined, "ko") : (status || "—");
}

export function notificationAudienceOperatorLabel(
  targetType: string | null | undefined,
  lang: OwnershipLabelLang
): string {
  const s = String(targetType ?? "").trim().toLowerCase();
  const keys: Record<string, MessageKey> = {
    all: "admin_ownership_notification_audience_all",
    selected_users: "admin_ownership_notification_audience_selected_users",
    marketing_opt_in: "admin_ownership_notification_audience_marketing_opt_in",
    active_users: "admin_ownership_notification_audience_active_users",
    region: "admin_ownership_notification_audience_region",
  };
  const key = keys[s];
  return key ? translateBy(lang, key, undefined, "ko") : (targetType || "—");
}

/**
 * Dist Push lifecycle — configure/materialize ≠ dispatch.
 * Published Platform Event + canonical destination + platform_event_id is a
 * marketing SOURCE. SEND still uses the notification campaign engine.
 */
export function distributionPushLifecycleNotice(input: {
  enabled: boolean;
  channelRefId?: string | null;
  distributionStatus?: string | null;
  eventPublication?: { status?: string | null; startsAt?: string | null; endsAt?: string | null };
  lang: OwnershipLabelLang;
}): {
  kind: "off" | "will_draft" | "draft_linked";
  message: string;
  manageHref: string | null;
  saveDoesNotSend: string;
  campaignSourceNote: string;
} {
  const saveDoesNotSend =
    translateBy(input.lang, "admin_saving_alone_does_not_send_push");
  const eventPublic = isPlatformEventPubliclyAvailable(input.eventPublication ?? null);
  const campaignSourceNote = eventPublic
    ? translateBy(input.lang, "admin_published_event_is_an_approved_push")
    : translateBy(input.lang, "admin_platform_events_push_publish_required");

  if (!input.enabled) {
    return {
      kind: "off",
      message:
        translateBy(input.lang, "admin_push_off_save_will_not_create"),
      manageHref: null,
      saveDoesNotSend,
      campaignSourceNote,
    };
  }
  const ref = String(input.channelRefId ?? "").trim();
  if (!ref) {
    return {
      kind: "will_draft",
      message:
        translateBy(input.lang, "admin_push_draft_will_be_created_on"),
      manageHref: null,
      saveDoesNotSend,
      campaignSourceNote,
    };
  }
  return {
    kind: "draft_linked",
    message:
      translateBy(input.lang, "admin_push_draft_linked_open_the_campaign"),
    manageHref: notificationCampaignManageHref(ref),
    saveDoesNotSend,
    campaignSourceNote,
  };
}

/**
 * Dist Bell lifecycle — materialize draft campaign only.
 * Member inbox rows (notification_events) are created on campaign SEND, not Dist save.
 */
export function distributionBellLifecycleNotice(input: {
  enabled: boolean;
  channelRefId?: string | null;
  distributionStatus?: string | null;
  lang: OwnershipLabelLang;
}): {
  kind: "off" | "will_draft" | "draft_linked";
  message: string;
  manageHref: string | null;
  saveDoesNotCreateInbox: string;
} {
  const saveDoesNotCreateInbox =
    translateBy(input.lang, "admin_dist_save_does_not_create_member");

  if (!input.enabled) {
    return {
      kind: "off",
      message:
        translateBy(input.lang, "admin_bell_off_save_will_not_create"),
      manageHref: null,
      saveDoesNotCreateInbox,
    };
  }
  const ref = String(input.channelRefId ?? "").trim();
  if (!ref) {
    return {
      kind: "will_draft",
      message:
        translateBy(input.lang, "admin_bell_campaign_draft_will_be_created"),
      manageHref: null,
      saveDoesNotCreateInbox,
    };
  }
  return {
    kind: "draft_linked",
    message:
      translateBy(input.lang, "admin_bell_campaign_draft_linked_register_send"),
    manageHref: notificationCampaignManageHref(ref),
    saveDoesNotCreateInbox,
  };
}

/** Admin Action Queue is ops workload — not Push/Bell delivery. */
export function adminActionQueueIsNotNotificationDeliveryCopy(lang: OwnershipLabelLang): string {
  return translateBy(lang, "admin_admin_action_queue_is_ops_pending");
}

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
