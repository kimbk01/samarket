"use client";

import type { PlatformPopupPresentationSuppressionOption } from "@/lib/platform-popup/popup-presentation-types";
import type { PlatformPopupSuppressionMode } from "@/lib/platform-popup/types";

export type PopupCloseControlProps = {
  label: string;
  onClose: () => void;
  /** sheet action-row text close vs floating circle */
  variant: "floating" | "text";
  className?: string;
};

export function PopupCloseControl({ label, onClose, variant, className }: PopupCloseControlProps) {
  if (variant === "text") {
    return (
      <button
        type="button"
        className={["dibay-promo-action-close", className].filter(Boolean).join(" ")}
        data-platform-popup-dismiss="close"
        aria-label={label}
        onClick={onClose}
      >
        {label}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={["dibay-promo-close-x", className].filter(Boolean).join(" ")}
      data-platform-popup-dismiss="close"
      aria-label={label}
      onClick={onClose}
    >
      <span aria-hidden="true">×</span>
    </button>
  );
}

export type PopupSuppressActionsProps = {
  options: readonly PlatformPopupPresentationSuppressionOption[];
  todayLabel: string;
  durationLabel: string;
  campaignLabel: string;
  groupLabel: string;
  onSuppress: (mode: PlatformPopupSuppressionMode) => void;
  tone: "on-dark" | "on-light";
};

export function PopupSuppressActions({
  options,
  todayLabel,
  durationLabel,
  campaignLabel,
  groupLabel,
  onSuppress,
  tone,
}: PopupSuppressActionsProps) {
  if (!options.length) return null;

  return (
    <div
      className={`dibay-promo-suppress dibay-promo-suppress--${tone}`}
      role="group"
      aria-label={groupLabel}
      data-platform-popup-suppress-row="1"
    >
      {options.includes("TODAY") ? (
        <button
          type="button"
          className="dibay-promo-suppress__btn"
          data-platform-popup-suppress="today"
          onClick={() => onSuppress("TODAY")}
        >
          {todayLabel}
        </button>
      ) : null}
      {options.includes("DURATION") ? (
        <button
          type="button"
          className="dibay-promo-suppress__btn"
          data-platform-popup-suppress="duration"
          onClick={() => onSuppress("DURATION")}
        >
          {durationLabel}
        </button>
      ) : null}
      {options.includes("CAMPAIGN") ? (
        <button
          type="button"
          className="dibay-promo-suppress__btn"
          data-platform-popup-suppress="campaign"
          onClick={() => onSuppress("CAMPAIGN")}
        >
          {campaignLabel}
        </button>
      ) : null}
    </div>
  );
}
