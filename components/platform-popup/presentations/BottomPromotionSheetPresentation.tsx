"use client";

import type {
  PlatformPopupPresentationCreative,
  PlatformPopupPresentationCta,
  PlatformPopupPresentationSuppressionOption,
} from "@/lib/platform-popup/popup-presentation-types";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";
import { PopupCloseControl, PopupSuppressActions } from "@/components/platform-popup/primitives/PopupChrome";
import { PopupCreativeMedia } from "@/components/platform-popup/primitives/PopupCreativeMedia";

export type BottomPromotionSheetProps = {
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
 * TYPE C — Bottom promotion sheet.
 * Content-driven height. Floating X (no giant suppress footer).
 * Optional suppress actions only when Admin opted into explicit chrome.
 */
export function BottomPromotionSheetPresentation({
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
}: BottomPromotionSheetProps) {
  const ctaLabel = cta.label?.trim() || null;
  const hasSuppress = suppressionOptions.length > 0;

  return (
    <div
      className="dibay-promo-sheet"
      data-platform-popup-card="1"
      data-composition="bottom_promotion_sheet"
      data-presentation="bottom_sheet"
      data-creative-mode={creative.creativeMode}
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
        className="dibay-promo-close-x--sheet"
      />
      <div className="dibay-promo-sheet__content" id={titleId}>
        <PopupCreativeMedia
          composition="bottom_promotion_sheet"
          creative={creative}
          ariaLabel={creativeAria}
          onCta={onCta}
          onLoad={onMediaReady}
          onError={onImageError}
        />
        {title || body ? (
          <div className="dibay-promo-sheet__copy">
            {title ? <h2 className="dibay-promo-title">{title}</h2> : null}
            {body ? <p className="dibay-promo-body">{body}</p> : null}
          </div>
        ) : null}
        {ctaLabel ? (
          <button
            type="button"
            className="dibay-promo-cta dibay-promo-cta--in-sheet"
            data-platform-popup-cta="1"
            onClick={onCta}
          >
            {ctaLabel}
          </button>
        ) : null}
      </div>

      {hasSuppress ? (
        <div className="dibay-promo-sheet__actions" data-promo-sheet-actions="1">
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

      <span className="sr-only">
        {ctaAria}: {cta.href}
      </span>
    </div>
  );
}
