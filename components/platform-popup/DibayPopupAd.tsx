"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOverlayRoot } from "@/components/ui/dibay-overlay/DibayOverlayRoot";
import { ArtworkModalPresentation } from "@/components/platform-popup/presentations/ArtworkModalPresentation";
import { BottomPromotionSheetPresentation } from "@/components/platform-popup/presentations/BottomPromotionSheetPresentation";
import { PromotionCardModalPresentation } from "@/components/platform-popup/presentations/PromotionCardModalPresentation";
import type {
  PlatformPopupPresentationCreative,
  PlatformPopupPresentationCta,
  PlatformPopupPresentationSuppressionOption,
} from "@/lib/platform-popup/popup-presentation-types";
import {
  PLATFORM_POPUP_BACKDROP_RGBA,
  PLATFORM_POPUP_TABLET_MAX_WIDTH_PX,
  PLATFORM_POPUP_Z_CLASS,
} from "@/lib/platform-popup/popup-geometry-tokens";
import type { PlatformPopupInterruptivePresentation } from "@/lib/platform-popup/presentation-contract";
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
  suppressionOptions: readonly PlatformPopupPresentationSuppressionOption[];
  exposureId: string;
  presentationType?: PlatformPopupInterruptivePresentation;
  /** Admin preview / embedded — no portal/backdrop. */
  embedded?: boolean;
  onClose: () => void;
  onSuppress: (mode: PlatformPopupSuppressionMode) => void;
  onCta: () => void;
  onRenderComplete: () => void;
  onImageError: () => void;
};

/**
 * Interruptive promotion dispatcher.
 * Shared: campaign/creative/CTA/frequency/suppression/analytics hooks via props.
 * Geometry: Type A ArtworkModal | Type B PromotionCard | Type C BottomSheet.
 */
export function DibayPopupAd({
  campaignId,
  surface,
  creative,
  cta,
  suppressionOptions,
  exposureId,
  presentationType = "bottom_sheet",
  embedded = false,
  onClose,
  onSuppress,
  onCta,
  onRenderComplete,
  onImageError,
}: DibayPopupAdProps) {
  const { safeT } = useI18n();
  const titleId = useId();
  const renderCompleteRef = useRef(false);
  const [imageFailed, setImageFailed] = useState(false);

  const closeLabel = safeT("platform_popup_dismiss_close", {
    fallbackKo: "닫기",
    fallbackEn: "Close",
  });
  const todayLabel = safeT("platform_popup_suppress_today", {
    fallbackKo: "오늘 하루 보지 않기",
    fallbackEn: "Don't show today",
  });
  const durationLabel = safeT("platform_popup_suppress_duration", {
    fallbackKo: "일정 기간 보지 않기",
    fallbackEn: "Snooze for a while",
  });
  const campaignLabel = safeT("platform_popup_suppress_campaign", {
    fallbackKo: "다시 보지 않기",
    fallbackEn: "Don't show again",
  });
  const creativeAria = safeT("platform_popup_creative_ad_aria", {
    fallbackKo: "광고",
    fallbackEn: "Advertisement",
  });
  const ctaAria = safeT("platform_popup_cta_aria", {
    fallbackKo: "자세히 보기",
    fallbackEn: "View details",
  });
  const backdropAria = safeT("platform_popup_backdrop_close_aria", {
    fallbackKo: "닫기",
    fallbackEn: "Close",
  });

  const markRenderComplete = useCallback(() => {
    if (renderCompleteRef.current) return;
    renderCompleteRef.current = true;
    onRenderComplete();
  }, [onRenderComplete]);

  useEffect(() => {
    if (imageFailed) onImageError();
  }, [imageFailed, onImageError]);

  useEffect(() => {
    renderCompleteRef.current = false;
  }, [exposureId, campaignId, creative.id]);

  if (imageFailed) return null;

  const composition = resolvePlatformPopupComposition({
    presentationType,
    creativeMode: creative.creativeMode,
  });
  const isSheet = compositionIsSheet(composition);

  const shared = {
    campaignId,
    surface,
    creative,
    cta,
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
    onRenderComplete: markRenderComplete,
    onImageError: () => setImageFailed(true),
  };

  const body =
    composition === "artwork_modal" ? (
      <ArtworkModalPresentation {...shared} />
    ) : composition === "promotion_card_modal" ? (
      <PromotionCardModalPresentation {...shared} />
    ) : (
      <BottomPromotionSheetPresentation {...shared} />
    );

  const shellStyle = {
    ["--platform-popup-backdrop" as string]: PLATFORM_POPUP_BACKDROP_RGBA,
    ["--platform-popup-tablet-max-width" as string]: `${PLATFORM_POPUP_TABLET_MAX_WIDTH_PX}px`,
  };

  if (embedded) {
    return (
      <div className="dibay-promo-embedded w-full" style={shellStyle} data-composition={composition}>
        {body}
      </div>
    );
  }

  return (
    <DibayOverlayRoot
      open
      onClose={onClose}
      dismissible
      placement={isSheet ? "sheet" : "center"}
      sheetAnchor={isSheet ? "device-bottom" : undefined}
      zIndexClass={PLATFORM_POPUP_Z_CLASS}
      stageClassName={`dibay-promo-root${isSheet ? "" : " dibay-promo-root--center"}`}
      stageStyle={shellStyle}
      lockScroll
      ariaLabel={backdropAria}
      backdropVariant="dim-only"
    >
      {body}
    </DibayOverlayRoot>
  );
}
