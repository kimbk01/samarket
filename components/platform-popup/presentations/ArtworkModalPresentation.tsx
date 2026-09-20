"use client";

import type {
  PlatformPopupPresentationCreative,
  PlatformPopupPresentationCta,
  PlatformPopupPresentationSuppressionOption,
} from "@/lib/platform-popup/popup-presentation-types";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";
import { PopupCloseControl, PopupSuppressActions } from "@/components/platform-popup/primitives/PopupChrome";
import { PopupCreativeMedia } from "@/components/platform-popup/primitives/PopupCreativeMedia";

export type ArtworkModalProps = {
  campaignId: string;
  surface: string;
  creative: PlatformPopupPresentationCreative;
  cta: PlatformPopupPresentationCta;
  suppressionOptions: readonly PlatformPopupPresentationSuppressionOption[];
  exposureId: string;
  closeLabel: string;
  todayLabel: string;
  durationLabel: string;
  campaignLabel: string;
  creativeAria: string;
  ctaAria: string;
  titleId: string;
  onClose: () => void;
  onSuppress: (mode: PlatformPopupSuppressionMode) => void;
  onCta: () => void;
  onMediaReady: () => void;
  onImageError: () => void;
};

/**
 * TYPE A — Artwork modal (Baemin reference #1).
 * Floating X in reserved frame gutter (never clipped).
 * Transparent artwork may visually sit above a compact content card.
 * Default chrome: X only (no suppress footer).
 */
export function ArtworkModalPresentation({
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
  onMediaReady,
  onImageError,
}: ArtworkModalProps) {
  const ctaLabel = cta.label?.trim() || null;

  return (
    <div
      className="dibay-promo-frame dibay-promo-frame--artwork-modal"
      data-platform-popup-card="1"
      data-composition="artwork_modal"
      data-presentation="center_modal"
      data-creative-mode="artwork"
      data-campaign-id={campaignId}
      data-creative-id={creative.id}
      data-surface={surface}
      data-exposure-id={exposureId}
      aria-labelledby={titleId}
    >
      <PopupCloseControl
        variant="floating"
        label={closeLabel}
        onClose={onClose}
        className="dibay-promo-close-x--frame"
      />
      <div className="dibay-promo-artwork-stack" id={titleId}>
        <PopupCreativeMedia
          composition="artwork_modal"
          creative={creative}
          ariaLabel={creativeAria}
          onCta={onCta}
          onLoad={onMediaReady}
          onError={onImageError}
        />
        {(ctaLabel || suppressionOptions.length > 0) && (
          <div className="dibay-promo-artwork-card">
            {ctaLabel ? (
              <button
                type="button"
                className="dibay-promo-cta"
                data-platform-popup-cta="1"
                onClick={onCta}
              >
                {ctaLabel}
              </button>
            ) : null}
            <PopupSuppressActions
              options={suppressionOptions}
              todayLabel={todayLabel}
              durationLabel={durationLabel}
              campaignLabel={campaignLabel}
              groupLabel={closeLabel}
              onSuppress={onSuppress}
              tone="on-light"
            />
          </div>
        )}
      </div>
      <span className="sr-only">
        {ctaAria}: {cta.href}
      </span>
    </div>
  );
}
