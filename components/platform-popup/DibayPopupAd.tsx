"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayOverlayRoot } from "@/components/ui/dibay-overlay/DibayOverlayRoot";
import type {
  PlatformPopupPresentationCreative,
  PlatformPopupPresentationCta,
  PlatformPopupPresentationSuppressionOption,
} from "@/lib/platform-popup/popup-presentation-types";
import {
  PLATFORM_POPUP_BACKDROP_RGBA,
  PLATFORM_POPUP_RADIUS_CLAMP,
  PLATFORM_POPUP_TABLET_MAX_WIDTH_PX,
  PLATFORM_POPUP_Z_CLASS,
} from "@/lib/platform-popup/popup-geometry-tokens";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";

export type DibayPopupAdProps = {
  campaignId: string;
  surface: string;
  creative: PlatformPopupPresentationCreative;
  cta: PlatformPopupPresentationCta;
  suppressionOptions: readonly PlatformPopupPresentationSuppressionOption[];
  exposureId: string;
  /** Admin preview / embedded — no portal/backdrop. */
  embedded?: boolean;
  onClose: () => void;
  onSuppress: (mode: PlatformPopupSuppressionMode) => void;
  onCta: () => void;
  onRenderComplete: () => void;
  onImageError: () => void;
};

/**
 * CUT 3 — production Platform Popup renderer (one renderer for phone + tablet).
 * Presentation + interaction only — no DB/ranking/surface policy.
 */
export function DibayPopupAd({
  campaignId,
  surface,
  creative,
  cta,
  suppressionOptions,
  exposureId,
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
    fallbackKo: "오늘 그만 보기",
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
    fallbackKo: "광고 자세히 보기",
    fallbackEn: "View advertisement details",
  });
  const backdropAria = safeT("platform_popup_backdrop_close_aria", {
    fallbackKo: "광고 닫기",
    fallbackEn: "Close advertisement",
  });

  const markRenderComplete = useCallback(() => {
    if (renderCompleteRef.current) return;
    renderCompleteRef.current = true;
    onRenderComplete();
  }, [onRenderComplete]);

  useEffect(() => {
    if (imageFailed) {
      onImageError();
    }
  }, [imageFailed, onImageError]);

  useEffect(() => {
    renderCompleteRef.current = false;
  }, [exposureId, campaignId, creative.id]);

  if (imageFailed) {
    return null;
  }

  const cardStyle = {
    ["--platform-popup-backdrop" as string]: PLATFORM_POPUP_BACKDROP_RGBA,
    ["--platform-popup-tablet-max-width" as string]: `${PLATFORM_POPUP_TABLET_MAX_WIDTH_PX}px`,
    ["--platform-popup-radius" as string]: PLATFORM_POPUP_RADIUS_CLAMP,
  } as CSSProperties;

  const card = (
    <div
      className="dibay-platform-popup-card"
      style={cardStyle}
      data-platform-popup-card="1"
      data-campaign-id={campaignId}
      data-creative-id={creative.id}
      data-surface={surface}
      data-exposure-id={exposureId}
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="dibay-platform-popup-creative"
        data-platform-popup-creative="1"
        aria-label={`${creativeAria}${creative.altText ? `: ${creative.altText}` : ""}`}
        onClick={onCta}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- popup creative full-bleed; no transform CDN */}
        <img
          src={creative.imageUrl}
          alt={creative.altText || creativeAria}
          className="dibay-platform-popup-creative__img"
          draggable={false}
          decoding="async"
          onLoad={() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(markRenderComplete);
            });
          }}
          onError={() => setImageFailed(true)}
        />
      </button>
      <div className="dibay-platform-popup-dismiss" data-platform-popup-dismiss-row="1">
        <div className="dibay-platform-popup-dismiss__actions">
          <button
            type="button"
            id={titleId}
            className="dibay-platform-popup-dismiss__close"
            data-platform-popup-dismiss="close"
            onClick={onClose}
          >
            {closeLabel}
          </button>
          {suppressionOptions.length > 0 ? (
            <div className="dibay-platform-popup-suppress-row" role="group" aria-label={closeLabel}>
              {suppressionOptions.includes("TODAY") ? (
                <button
                  type="button"
                  className="dibay-platform-popup-suppress-btn"
                  data-platform-popup-suppress="today"
                  onClick={() => onSuppress("TODAY")}
                >
                  {todayLabel}
                </button>
              ) : null}
              {suppressionOptions.includes("DURATION") ? (
                <button
                  type="button"
                  className="dibay-platform-popup-suppress-btn"
                  data-platform-popup-suppress="duration"
                  onClick={() => onSuppress("DURATION")}
                >
                  {durationLabel}
                </button>
              ) : null}
              {suppressionOptions.includes("CAMPAIGN") ? (
                <button
                  type="button"
                  className="dibay-platform-popup-suppress-btn"
                  data-platform-popup-suppress="campaign"
                  onClick={() => onSuppress("CAMPAIGN")}
                >
                  {campaignLabel}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <span className="sr-only" aria-hidden={false}>
        {ctaAria}: {cta.href}
      </span>
    </div>
  );

  if (embedded) {
    return <div className="dibay-platform-popup-embedded w-full">{card}</div>;
  }

  return (
    <DibayOverlayRoot
      open
      onClose={onClose}
      dismissible
      placement="sheet"
      sheetAnchor="device-bottom"
      zIndexClass={PLATFORM_POPUP_Z_CLASS}
      stageClassName="dibay-platform-popup-root"
      lockScroll
      ariaLabel={backdropAria}
    >
      {card}
    </DibayOverlayRoot>
  );
}
