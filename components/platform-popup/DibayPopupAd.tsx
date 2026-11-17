"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOverlayRoot } from "@/components/ui/dibay-overlay/DibayOverlayRoot";
import { ArtworkModalPresentation } from "@/components/platform-popup/presentations/ArtworkModalPresentation";
import { BenefitDialogPresentation } from "@/components/platform-popup/presentations/BenefitDialogPresentation";
import { BottomPromotionSheetPresentation } from "@/components/platform-popup/presentations/BottomPromotionSheetPresentation";
import { PromotionCardModalPresentation } from "@/components/platform-popup/presentations/PromotionCardModalPresentation";
import {
  ArtworkFullPresentation,
  CouponCardPresentation,
  ListSheetPresentation,
  TooltipPresentation,
} from "@/components/platform-popup/presentations/EntryPresentations";
import type {
  PlatformPopupCouponRow,
  PlatformPopupListStore,
  PlatformPopupPresentationCreative,
  PlatformPopupPresentationCta,
  PlatformPopupPresentationSuppressionOption,
} from "@/lib/platform-popup/popup-presentation-types";
import {
  PLATFORM_POPUP_BACKDROP_RGBA,
  PLATFORM_POPUP_TABLET_MAX_WIDTH_PX,
  PLATFORM_POPUP_Z_CLASS,
} from "@/lib/platform-popup/popup-geometry-tokens";
import type {
  PlatformPopupInterruptivePresentation,
  PlatformPopupTooltipAnchor,
} from "@/lib/platform-popup/presentation-contract";
import {
  compositionIsSheet,
  resolvePlatformPopupComposition,
} from "@/lib/platform-popup/resolve-presentation-composition";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";

export type DibayPopupAdProps = {
  campaignId: string;
  surface: string;
  creative: PlatformPopupPresentationCreative;
  cta: PlatformPopupPresentationCta;
  title?: string | null;
  body?: string | null;
  /** Event benefit section — required for benefit_dialog. */
  benefit?: { title: string; body: string | null } | null;
  suppressionOptions: readonly PlatformPopupPresentationSuppressionOption[];
  exposureId: string;
  presentationType?: PlatformPopupInterruptivePresentation;
  /** Admin preview / embedded — no portal/backdrop. */
  embedded?: boolean;
  onClose: () => void;
  onSuppress: (mode: PlatformPopupSuppressionMode) => void;
  onCta: () => void;
  /** Stable visible presentation — IMPRESSION only (never suppress). */
  onImpression: () => void;
  onImageError: () => void;
  /** 진입 감사 PO-3 — 새 형태 4종 데이터(서버가 채움) */
  ctaColors?: { bg: string | null; text: string | null } | null;
  listStores?: readonly PlatformPopupListStore[];
  listEndsAt?: string | null;
  coupons?: readonly PlatformPopupCouponRow[];
  tooltipAnchor?: PlatformPopupTooltipAnchor;
  /** 목록 칸(매장) 눌림 — 같은 CTA 기록·숨김 경로로 그 주소를 연다 */
  onCtaHref?: (href: string) => void;
  /** 말풍선이 붙을 자리가 이 화면에 없음 — 이번 실행 건너뜀(숨김 기록 없음) */
  onUnavailable?: () => void;
};

/**
 * Interruptive promotion dispatcher.
 * Shared: campaign/creative/CTA/frequency/suppression/analytics hooks via props.
 * Geometry: A Artwork | B Card | C Sheet | D Benefit Dialog.
 */
export function DibayPopupAd({
  campaignId,
  surface,
  creative,
  cta,
  title = null,
  body: copyBody = null,
  benefit = null,
  suppressionOptions,
  exposureId,
  presentationType = "bottom_sheet",
  embedded = false,
  onClose,
  onSuppress,
  onCta,
  onImpression,
  onImageError,
  ctaColors = null,
  listStores = [],
  listEndsAt = null,
  coupons = [],
  tooltipAnchor = "region",
  onCtaHref,
  onUnavailable,
}: DibayPopupAdProps) {
  const { safeT } = useI18n();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const impressionSentRef = useRef(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const closeLabel = safeT("platform_popup_dismiss_close");
  const todayLabel = safeT("platform_popup_suppress_today");
  const durationLabel = safeT("platform_popup_suppress_duration");
  const campaignLabel = safeT("platform_popup_suppress_campaign");
  const creativeAria = safeT("platform_popup_creative_ad_aria");
  const ctaAria = safeT("platform_popup_cta_aria");
  const backdropAria = safeT("platform_popup_backdrop_close_aria");

  const earlyComposition = resolvePlatformPopupComposition({ presentationType, creativeMode: creative.creativeMode });
  const dataMissing =
    (earlyComposition === "list_sheet" && listStores.length === 0) ||
    (earlyComposition === "coupon_card" && coupons.length === 0);
  useEffect(() => {
    if (dataMissing && !embedded) (onUnavailable ?? onImageError)();
  }, [dataMissing, embedded, onUnavailable, onImageError]);

  const markMediaReady = useCallback(() => {
    setMediaReady(true);
  }, []);

  useEffect(() => {
    if (imageFailed) onImageError();
  }, [imageFailed, onImageError]);

  useEffect(() => {
    impressionSentRef.current = false;
    setMediaReady(false);
    setImageFailed(false);
  }, [exposureId, campaignId, creative.id]);

  /**
   * IMPRESSION authority:
   * Host mounts only in VISIBLE. Media-ready is a gate (not suppress trigger).
   * Two paint frames after media (+ document visible) → IMPRESSION only.
   */
  useEffect(() => {
    if (!mediaReady || imageFailed || impressionSentRef.current) return;

    let raf1 = 0;
    let raf2 = 0;
    let cancelled = false;

    const fire = () => {
      if (cancelled || impressionSentRef.current) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      impressionSentRef.current = true;
      onImpression();
    };

    const schedulePaint = () => {
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(fire);
      });
    };

    const onVis = () => {
      if (document.visibilityState === "visible") schedulePaint();
    };

    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      document.addEventListener("visibilitychange", onVis);
      return () => {
        cancelled = true;
        document.removeEventListener("visibilitychange", onVis);
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }

    schedulePaint();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [mediaReady, imageFailed, onImpression, exposureId]);

  if (imageFailed) return null;
  // 진입 감사 PO-3: 목록·쿠폰 데이터가 비면 빈 틀을 그리지 않는다 — 재감사: 호스트에 알려 다음 칸으로
  if (dataMissing) return null;

  const composition = resolvePlatformPopupComposition({
    presentationType,
    creativeMode: creative.creativeMode,
  });
  const isSheet = compositionIsSheet(composition);

  if (composition === "benefit_dialog" && !benefit?.title?.trim()) {
    return null;
  }

  const shared = {
    campaignId,
    surface,
    creative,
    cta,
    title: title?.trim() || null,
    body: copyBody?.trim() || null,
    suppressionOptions,
    exposureId,
    closeLabel,
    todayLabel,
    durationLabel,
    campaignLabel,
    creativeAria,
    ctaAria,
    titleId,
    onClose,
    onSuppress,
    onCta,
    onMediaReady: markMediaReady,
    onImageError: () => setImageFailed(true),
  };

  const entryShared = { ...shared, ctaColors, onCtaHref };
  const body =
    composition === "artwork_full" ? (
      <ArtworkFullPresentation {...entryShared} />
    ) : composition === "coupon_card" ? (
      <CouponCardPresentation {...entryShared} coupons={coupons} />
    ) : composition === "list_sheet" ? (
      <ListSheetPresentation {...entryShared} stores={listStores} endsAt={listEndsAt} />
    ) : composition === "tooltip" ? (
      <TooltipPresentation
        {...entryShared}
        anchor={tooltipAnchor}
        onAnchorMissing={onUnavailable ?? onImageError}
      />
    ) : composition === "artwork_modal" ? (
      <ArtworkModalPresentation {...shared} />
    ) : composition === "promotion_card_modal" ? (
      <PromotionCardModalPresentation {...shared} />
    ) : composition === "benefit_dialog" ? (
      <BenefitDialogPresentation
        {...shared}
        benefitTitle={benefit!.title}
        benefitBody={benefit?.body ?? null}
      />
    ) : (
      <BottomPromotionSheetPresentation {...shared} />
    );

  const shellStyle = {
    ["--platform-popup-backdrop" as string]: PLATFORM_POPUP_BACKDROP_RGBA,
    ["--platform-popup-tablet-max-width" as string]: `${PLATFORM_POPUP_TABLET_MAX_WIDTH_PX}px`,
  };

  if (embedded) {
    return (
      <div
        ref={rootRef}
        className="dibay-promo-embedded w-full"
        style={shellStyle}
        data-composition={composition}
      >
        {body}
      </div>
    );
  }

  // 말풍선 = 화면을 막지 않는다(배경·스크롤 잠금 없음) — 본문이 직접 body 로 portal
  if (composition === "tooltip") {
    return (
      <div ref={rootRef} data-composition={composition} data-platform-popup-impression-root="1" style={shellStyle}>
        {body}
      </div>
    );
  }

  return (
    <div ref={rootRef} data-composition={composition} data-platform-popup-impression-root="1">
      <DibayOverlayRoot
        open
        adLayer
        onClose={onClose}
        dismissible
        placement={isSheet ? "sheet" : "center"}
        zIndexClass={PLATFORM_POPUP_Z_CLASS}
        stageClassName={`dibay-promo-root${isSheet ? "" : " dibay-promo-root--center"}`}
        stageStyle={shellStyle}
        lockScroll
        ariaLabel={backdropAria}
        backdropVariant="dim-only"
      >
        {body}
      </DibayOverlayRoot>
    </div>
  );
}
