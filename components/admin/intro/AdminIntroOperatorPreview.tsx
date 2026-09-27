"use client";

import { computeContainedCreativeRect } from "@/lib/startup/product-intro-geometry";
import type { ProductIntroSizePreset } from "@/lib/startup/product-intro";

export type IntroPreviewViewport = "phone" | "tablet" | "wide";

export const INTRO_OPERATOR_PREVIEW_VIEWPORTS: Record<
  IntroPreviewViewport,
  { labelKo: string; labelEn: string; width: number; height: number }
> = {
  phone: { labelKo: "Phone", labelEn: "Phone", width: 390, height: 844 },
  tablet: { labelKo: "Tablet", labelEn: "Tablet", width: 768, height: 1024 },
  wide: { labelKo: "Wide", labelEn: "Wide", width: 1280, height: 800 },
};

export function AdminIntroOperatorPreview(props: {
  viewport: IntroPreviewViewport;
  imageUrl: string | null;
  imageWidth: number;
  imageHeight: number;
  backgroundColor: string;
  sizePreset: ProductIntroSizePreset;
  showLogo: boolean;
  ctaLabel: string | null;
  skipEnabled: boolean;
}) {
  const frame = INTRO_OPERATOR_PREVIEW_VIEWPORTS[props.viewport];
  const scale = props.viewport === "wide" ? 0.32 : props.viewport === "tablet" ? 0.36 : 0.42;
  const rect = computeContainedCreativeRect({
    viewportWidth: frame.width,
    viewportHeight: frame.height,
    imageWidth: props.imageWidth,
    imageHeight: props.imageHeight,
    sizePreset: props.sizePreset,
  });
  return (
    <div
      className="relative overflow-hidden rounded-ui-rect border border-sam-border"
      style={{
        width: Math.round(frame.width * scale),
        height: Math.round(frame.height * scale),
        background: props.backgroundColor,
      }}
      data-intro-preview={props.viewport}
    >
      {props.imageUrl ? (
        <div
          className="absolute bg-contain bg-center bg-no-repeat"
          style={{
            left: rect.left * scale,
            top: rect.top * scale,
            width: rect.width * scale,
            height: rect.height * scale,
            backgroundImage: `url(${props.imageUrl})`,
          }}
        />
      ) : null}
      {props.showLogo ? (
        <div className="absolute left-1/2 top-[12%] h-8 w-8 -translate-x-1/2 rounded-full bg-white/80" />
      ) : null}
      {props.skipEnabled ? (
        <div className="absolute right-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-white">
          Skip
        </div>
      ) : null}
      {props.ctaLabel ? (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-sam-brand px-3 py-1 text-[10px] text-white">
          {props.ctaLabel}
        </div>
      ) : null}
    </div>
  );
}
