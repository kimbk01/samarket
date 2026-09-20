"use client";

import type {
  PlatformPopupPresentationCreative,
  PlatformPopupPresentationCta,
  PlatformPopupPresentationSuppressionOption,
} from "@/lib/platform-popup/popup-presentation-types";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";
import { PopupCloseControl, PopupSuppressActions } from "@/components/platform-popup/primitives/PopupChrome";
import { PopupCreativeMedia } from "@/components/platform-popup/primitives/PopupCreativeMedia";

export type PromotionCardModalProps = {
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
  onRenderComplete: () => void;
  onImageError: () => void;
};

/**
 * TYPE B — Promotion card modal (Baemin reference #2).
 * Image + optional body slot + CTA = one visual card.
 * Floating X lives in frame gutter outside the card (never clipped by card overflow).
 * Body slot reserved for future EVENT_DETAIL / coupon blocks (no CMS yet).
 */
export function PromotionCardModalPresentation({
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
  onRenderComplete,
  onImageError,
}: PromotionCardModalProps) {
  const ctaLabel = cta.label?.trim() || null;

  return (
    <div
      className="dibay-promo-frame dibay-promo-frame--promotion-card"
      data-platform-popup-card="1"
      data-composition="promotion_card_modal"
      data-presentation="center_modal"
      data-creative-mode="card"
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
      <div className="dibay-promo-card" id={titleId}>
        <PopupCreativeMedia
          composition="promotion_card_modal"
          creative={creative}
          ariaLabel={creativeAria}
          onCta={onCta}
          onLoad={onRenderComplete}
          onError={onImageError}
        />
        {/* Body slot: EVENT_DETAIL / coupon / copy blocks mount here when content exists. */}
        {ctaLabel ? (
          <button
            type="button"
            className="dibay-promo-cta dibay-promo-cta--in-card"
            data-platform-popup-cta="1"
            onClick={onCta}
          >
            {ctaLabel}
          </button>
        ) : null}
        {suppressionOptions.length > 0 ? (
          <div className="dibay-promo-card__secondary">
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
        ) : null}
      </div>
      <span className="sr-only">
        {ctaAria}: {cta.href}
      </span>
    </div>
  );
}
