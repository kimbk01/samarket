"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOverlayRoot } from "@/components/ui/dibay-overlay/DibayOverlayRoot";
import { ArtworkModalPresentation } from "@/components/platform-popup/presentations/ArtworkModalPresentation";
import { BenefitDialogPresentation } from "@/components/platform-popup/presentations/BenefitDialogPresentation";
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
}: DibayPopupAdProps) {
  const { safeT } = useI18n();
  const titleId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const impressionSentRef = useRef(false);
  const [mediaReady, setMediaReady] = useState(false);
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

  const body =
    composition === "artwork_modal" ? (
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

  return (
    <div ref={rootRef} data-composition={composition} data-platform-popup-impression-root="1">
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
    </div>
  );
}
