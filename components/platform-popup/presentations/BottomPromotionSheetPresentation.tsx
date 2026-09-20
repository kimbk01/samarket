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
 * TYPE C — Bottom promotion sheet (commerce reference #3).
 * Content-driven height. Compact action row (no flex-grow, no giant white panel).
 * Close lives in the action row — not a floating X that collides with viewport clip.
 */
export function BottomPromotionSheetPresentation({
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
      <div className="dibay-promo-sheet__content" id={titleId}>
        <PopupCreativeMedia
          composition="bottom_promotion_sheet"
          creative={creative}
          ariaLabel={creativeAria}
          onCta={onCta}
          onLoad={onRenderComplete}
          onError={onImageError}
        />
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

      <div className="dibay-promo-sheet__actions" data-promo-sheet-actions="1">
        {hasSuppress ? (
          <PopupSuppressActions
            options={suppressionOptions}
            todayLabel={todayLabel}
            durationLabel={durationLabel}
            campaignLabel={campaignLabel}
            groupLabel={closeLabel}
            onSuppress={onSuppress}
            tone="on-light"
          />
        ) : null}
        <PopupCloseControl variant="text" label={closeLabel} onClose={onClose} />
      </div>

      <span className="sr-only">
        {ctaAria}: {cta.href}
      </span>
    </div>
  );
}
