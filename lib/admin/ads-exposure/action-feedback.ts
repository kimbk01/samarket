/**
 * Mutation success / failure copy for Ads Exposure ops.
 */

import { humanBannerSlideLabel, humanPlacementLabel } from "@/lib/admin/ads-exposure/human-placement-label";

export type AdsActionFeedback = { ko: string; en: string };

export const ADS_FEEDBACK = {
  saved: { ko: "저장되었습니다.", en: "Saved." },
  updated: { ko: "변경사항을 저장했습니다.", en: "Changes saved." },
  approved: { ko: "광고를 승인했습니다.", en: "Ad approved." },
  rejected: { ko: "광고 신청을 반려했습니다.", en: "Application rejected." },
  deleted: { ko: "광고를 삭제했습니다.", en: "Ad removed." },
  deleteConfirm: {
    ko: "이 광고를 삭제하시겠습니까? 광고 신청 및 결제 이력은 보존됩니다.",
    en: "Remove this ad from operations? Application and payment history are kept.",
  },
  paused: { ko: "광고 노출을 일시중지했습니다.", en: "Ad paused." },
  resumed: { ko: "광고 노출을 다시 시작했습니다.", en: "Ad resumed." },
  ended: { ko: "광고 노출을 종료했습니다.", en: "Ad ended." },
  endBoostConfirm: {
    ko: "광고 노출을 종료합니다. 이미 사용된 광고 비용은 자동 환불되지 않습니다.",
    en: "End this ad. Used ad cost will not be refunded automatically.",
  },
  orderSaved: { ko: "배너 순서를 저장했습니다.", en: "Banner order saved." },
  applySubmitted: {
    ko: "광고 신청이 완료되었습니다. 관리자 승인 후 노출됩니다.",
    en: "Application submitted. It will go live after admin approval.",
  },
  saveFailed: { ko: "저장하지 못했습니다.", en: "Could not save." },
  imageRequired: { ko: "이미지가 필요합니다.", en: "Image is required." },
  capacityFull: {
    ko: "이 위치에는 추가할 수 있는 배너가 없습니다.",
    en: "No banner slots left for this placement.",
  },
  invalidPeriod: {
    ko: "종료일은 시작일 이후여야 합니다.",
    en: "End date must be after start date.",
  },
} as const;

export function feedbackBannerSavedAtSlide(input: {
  placementKey: string;
  slideIndex1Based: number;
  ko: boolean;
}): string {
  const where = humanBannerSlideLabel(input.placementKey, input.slideIndex1Based, input.ko);
  return input.ko ? `${where}에 저장되었습니다.` : `Saved at ${where}.`;
}

export function feedbackPopupSaved(input: { targetLabel: string; ko: boolean }): string {
  return input.ko
    ? `${input.targetLabel}으로 저장되었습니다.`
    : `Saved as ${input.targetLabel}.`;
}

export function feedbackApprovedWithStart(input: {
  startAt: string | null;
  placementKey: string | null;
  ko: boolean;
}): string {
  const place = humanPlacementLabel(input.placementKey, input.ko);
  if (input.startAt) {
    const d = new Date(input.startAt);
    const dateLabel = input.ko
      ? `${d.getMonth() + 1}월 ${d.getDate()}일`
      : d.toLocaleDateString("en-US");
    return input.ko
      ? `${dateLabel}부터 ${place}에 노출됩니다.`
      : `Goes live on ${place} from ${dateLabel}.`;
  }
  return input.ko ? ADS_FEEDBACK.approved.ko : ADS_FEEDBACK.approved.en;
}

export function feedbackScheduledStart(input: { startAt: string; ko: boolean }): string {
  const d = new Date(input.startAt);
  if (input.ko) {
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}부터 노출됩니다.`;
  }
  return `Scheduled to go live ${d.toLocaleString("en-US")}.`;
}
