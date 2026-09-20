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
  title: string | null;
  body: string | null;
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
 * TYPE B — Promotion card modal (Baemin reference #2).
 * Image + optional body slot + CTA = one visual card.
 * Floating X in frame gutter. Default chrome: X only.
 */
export function PromotionCardModalPresentation({
  campaignId,
  surface,
  creative,
  cta,
  title,
  body,
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
          onLoad={onMediaReady}
          onError={onImageError}
        />
        {title || body ? (
          <div className="dibay-promo-card__copy">
            {title ? <h2 className="dibay-promo-title">{title}</h2> : null}
            {body ? <p className="dibay-promo-body">{body}</p> : null}
          </div>
        ) : null}
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
