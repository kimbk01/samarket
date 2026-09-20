"use client";

import type {
  PlatformPopupPresentationCreative,
  PlatformPopupPresentationCta,
  PlatformPopupPresentationSuppressionOption,
} from "@/lib/platform-popup/popup-presentation-types";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";
import { PopupCloseControl, PopupSuppressActions } from "@/components/platform-popup/primitives/PopupChrome";
import { PopupCreativeMedia } from "@/components/platform-popup/primitives/PopupCreativeMedia";

export type BenefitDialogProps = {
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
 * TYPE D — Benefit / coupon dialog.
 * Centered card · optional creative · title/body · primary CTA · floating X.
 */
export function BenefitDialogPresentation({
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
}: BenefitDialogProps) {
  const ctaLabel = cta.label?.trim() || null;
  const alt = creative.altText?.trim() || null;
  const copy = body || (alt && alt !== "Advertisement" ? alt : null);

  return (
    <div
      className="dibay-promo-frame dibay-promo-frame--benefit-dialog"
      data-platform-popup-card="1"
      data-composition="benefit_dialog"
      data-presentation="benefit_dialog"
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
        className="dibay-promo-close-x--frame"
      />
      <div className="dibay-promo-benefit" id={titleId}>
        <PopupCreativeMedia
          composition="benefit_dialog"
          creative={creative}
          ariaLabel={creativeAria}
          onCta={onCta}
          onLoad={onMediaReady}
          onError={onImageError}
        />
        {title ? <h2 className="dibay-promo-title">{title}</h2> : null}
        {copy ? <p className="dibay-promo-benefit__copy">{copy}</p> : null}
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
      </div>
      <span className="sr-only">
        {ctaAria}: {cta.href}
      </span>
    </div>
  );
}
