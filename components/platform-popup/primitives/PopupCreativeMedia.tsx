"use client";

import type { CSSProperties } from "react";
import type { PlatformPopupPresentationCreative } from "@/lib/platform-popup/popup-presentation-types";
import type { PlatformPopupComposition } from "@/lib/platform-popup/resolve-presentation-composition";

export type PopupCreativeMediaProps = {
  composition: PlatformPopupComposition;
  creative: PlatformPopupPresentationCreative;
  ariaLabel: string;
  onCta: () => void;
  onLoad: () => void;
  onError: () => void;
};

export function PopupCreativeMedia({
  composition,
  creative,
  ariaLabel,
  onCta,
  onLoad,
  onError,
}: PopupCreativeMediaProps) {
  const isArtwork = composition === "artwork_modal";
  const style = (
    isArtwork
      ? {
          ["--platform-popup-artwork-aspect" as string]: `${creative.aspectW} / ${creative.aspectH}`,
        }
      : undefined
  ) as CSSProperties | undefined;

  return (
    <button
      type="button"
      className={[
        "dibay-promo-creative",
        isArtwork ? "dibay-promo-creative--artwork" : "dibay-promo-creative--card",
      ].join(" ")}
      style={style}
      data-platform-popup-creative="1"
      aria-label={`${ariaLabel}${creative.altText ? `: ${creative.altText}` : ""}`}
      onClick={onCta}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- popup creative; no transform CDN */}
      <img
        src={creative.imageUrl}
        alt={creative.altText || ariaLabel}
        className="dibay-promo-creative__img"
        draggable={false}
        decoding="async"
        onLoad={() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(onLoad);
          });
        }}
        onError={onError}
      />
    </button>
  );
}
