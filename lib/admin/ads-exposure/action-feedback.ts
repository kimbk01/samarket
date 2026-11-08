/**
 * Mutation success / failure copy for Ads Exposure ops.
 */

import { humanBannerSlideLabel, humanPlacementLabel } from "@/lib/admin/ads-exposure/human-placement-label";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { catalogPair } from "@/lib/i18n/catalog-pair";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

/** 설계 v4 §6 — 노출 시작 안내도 기기 시간대가 아니라 PHT 달력·시각으로. */
function manilaFeedbackParts(iso: string): { date: string; month: number; day: number; time: string } {
  const [date = "", time = ""] = formatAdminManilaDateTime(iso).split(" ");
  const [, m, d] = date.split("-");
  return { date, month: Number(m) || 0, day: Number(d) || 0, time };
}

export type AdsActionFeedback = { ko: string; en: string };

export const ADS_FEEDBACK = {
  saved: catalogPair("admin_store_banner_ads_save_ok"),
  updated: catalogPair("admin_changes_saved"),
  approved: catalogPair("admin_ad_approved_2"),
  rejected: catalogPair("admin_application_rejected"),
  deleted: catalogPair("admin_ad_removed"),
  deleteConfirm: catalogPair("admin_remove_this_ad_from_operations_application"),
  paused: catalogPair("admin_ad_paused"),
  resumed: catalogPair("admin_ad_resumed"),
  ended: catalogPair("admin_ad_ended"),
  endBoostConfirm: catalogPair("admin_end_this_ad_used_ad_cost"),
  /** Internal key may stay `extend`; never expose developer jargon in UI. */
  extend: catalogPair("admin_period_extended"),
  orderSaved: catalogPair("admin_banner_order_changed"),
  applySubmitted: catalogPair("admin_application_submitted_it_will_go_live"),
  saveFailed: catalogPair("admin_del_err_save_failed"),
  imageRequired: catalogPair("admin_image_is_required"),
  capacityFull: catalogPair("admin_reservations_for_this_ad_placement_are"),
  invalidPeriod: catalogPair("admin_end_date_must_be_after_start"),
} as const;

export function feedbackBannerSavedAtSlide(input: {
  placementKey: string;
  slideIndex1Based: number;
  ko: boolean;
}): string {
  const where = humanBannerSlideLabel(input.placementKey, input.slideIndex1Based, input.ko);
  return tx(input.ko, "admin_ads_exposure_saved_at", { where: String(where) });
}

export function feedbackPopupSaved(input: { targetLabel: string; ko: boolean }): string {
  return tx(input.ko, "admin_ads_exposure_saved_as", { targetLabel: String(input.targetLabel) });
}

export function feedbackApprovedWithStart(input: {
  startAt: string | null;
  placementKey: string | null;
  ko: boolean;
}): string {
  const place = humanPlacementLabel(input.placementKey, input.ko);
  if (input.startAt) {
    const p = manilaFeedbackParts(input.startAt);
    const dateLabel = input.ko
      ? tx(true, "admin_ads_exposure_month_day", { month: String(p.month), day: String(p.day) })
      : p.date;
    return tx(input.ko, "admin_ads_exposure_goes_live_on_from", { dateLabel: String(dateLabel), place: String(place) });
  }
  return input.ko ? ADS_FEEDBACK.approved.ko : ADS_FEEDBACK.approved.en;
}

export function feedbackScheduledStart(input: { startAt: string; ko: boolean }): string {
  const p = manilaFeedbackParts(input.startAt);
  if (input.ko) {
    return `${p.month}월 ${p.day}일 ${p.time}부터 노출됩니다.`;
  }
  return `Scheduled to go live ${p.date} ${p.time} PHT.`;
}
