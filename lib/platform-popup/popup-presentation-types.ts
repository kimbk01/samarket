/**
 * CUT 3 / CUT 1 reopen — normalized presentation payload for DibayPopupAd.
 */

import type {
  PlatformPopupConsumerSurface,
  PlatformPopupCtaType,
  PlatformPopupSuppressionMode,
} from "@/lib/platform-popup/types";
import type {
  PlatformPopupCreativeMode,
  PlatformPopupFrequencyMode,
  PlatformPopupInterruptivePresentation,
  PlatformPopupQueueClass,
  PlatformPopupTooltipAnchor,
} from "@/lib/platform-popup/presentation-contract";

export type PlatformPopupPresentationCreative = {
  id: string;
  imageUrl: string;
  altText: string;
  aspectW: number;
  aspectH: number;
  creativeMode: PlatformPopupCreativeMode;
};

export type PlatformPopupPresentationCta = {
  type: PlatformPopupCtaType | string;
  href: string;
  label: string | null;
};

/** Suppression modes exposed in renderer UI (not CLOSE/SESSION — host/runtime). */
export type PlatformPopupPresentationSuppressionOption = Extract<
  PlatformPopupSuppressionMode,
  "TODAY" | "DURATION" | "CAMPAIGN"
>;

export type PlatformPopupPresentationWinner = {
  campaignId: string;
  creativeId: string;
  surface: PlatformPopupConsumerSurface | string;
  presentationType: PlatformPopupInterruptivePresentation;
  frequencyMode: PlatformPopupFrequencyMode;
  creative: PlatformPopupPresentationCreative;
  /** Optional title — omit empty containers when null. */
  title: string | null;
  /** Optional body/subcopy — omit empty containers when null. */
  body: string | null;
  /**
   * CUT 1 — Benefit Dialog hierarchy from linked Event benefit section only.
   * Required when presentationType === benefit_dialog. Never parsed from title/body.
   */
  benefit: { title: string; body: string | null } | null;
  cta: PlatformPopupPresentationCta;
  suppressionOptions: readonly PlatformPopupPresentationSuppressionOption[];
  timezone: string;
  suppressionDurationSeconds: number | null;
  /** D-2: 「다시 보지 않기」 기준 판(소재 + 목적지 해시) — 숨김 기록 때 앱이 그대로 보낸다 */
  revision?: string | null;
  /** 진입 감사 PO-2 — 진입 대기열 구분 · 자동 닫힘 초(null = 없음) */
  queueClass?: PlatformPopupQueueClass;
  autoDismissSeconds?: number | null;
  /** 진입 감사 PO-3 — 그림 전체형 버튼 색 */
  ctaColors?: { bg: string | null; text: string | null } | null;
  /** list_sheet: 서버가 채운 매장 목록 · 남은 시간 기준(캠페인 종료 시각) */
  listStores?: readonly PlatformPopupListStore[];
  listEndsAt?: string | null;
  /** coupon_card: 서버가 채운 이 회원의 곧 만료되는 쿠폰 */
  coupons?: readonly PlatformPopupCouponRow[];
  /** tooltip: 붙을 자리 */
  tooltipAnchor?: PlatformPopupTooltipAnchor;
};

export type PlatformPopupListStore = {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  href: string;
};

export type PlatformPopupCouponRow = {
  id: string;
  title: string;
  storeName: string | null;
  expiresAt: string | null;
  href: string;
};
