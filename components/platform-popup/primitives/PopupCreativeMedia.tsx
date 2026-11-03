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
  const isBenefit = composition === "benefit_dialog";
  const isSheet = composition === "bottom_promotion_sheet";
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
        isArtwork
          ? "dibay-promo-creative--artwork"
          : isBenefit
            ? "dibay-promo-creative--benefit"
            : isSheet
              ? "dibay-promo-creative--sheet"
              : "dibay-promo-creative--card",
      ].join(" ")}
      style={style}
      data-platform-popup-creative="1"
      data-media-policy={isArtwork ? "contain-alpha" : isBenefit ? "contain" : "cover-36-25"}
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
        onLoad={onLoad}
        onError={onError}
      />
      {/*
       * 광고 감사 G-12: 화면에 보이는 「광고」 표기 — Apple 2.5.18(전면 광고는 광고임을 분명히 표시),
       * 피드·배달·PTR 광고와 같은 표기. 낭독은 버튼 aria-label 이 이미 「광고」로 시작하므로 중복 낭독하지 않는다.
       */}
      <span
        aria-hidden="true"
        data-platform-popup-ad-label="1"
        className="pointer-events-none absolute left-2 top-2 z-[1] rounded-[4px] bg-black/55 px-1 py-px text-[10px] font-semibold leading-[14px] text-white"
      >
        {ariaLabel}
      </span>
    </button>
  );
}
