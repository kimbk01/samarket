"use client";

import type { ReactNode } from "react";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

/** Gift product artwork — designed fallback, never raw placeholder tiles. */
export function GiftArtwork({
  src,
  alt,
  size = 96,
  fill = false,
  className = "",
  imageClassName,
  roundedClassName = "rounded-ui-rect",
  fallbackNode,
  fetchDisplayPx,
}: {
  src?: string | null;
  alt?: string;
  size?: number;
  fill?: boolean;
  className?: string;
  imageClassName?: string;
  roundedClassName?: string;
  fallbackNode?: ReactNode;
  fetchDisplayPx?: number;
}) {
  const displayPx = fetchDisplayPx ?? Math.min(512, Math.max(96, size * 2));
  return (
    <SamarketThumbnail
      src={src}
      alt={alt ?? ""}
      size={fill ? undefined : size}
      fill={fill}
      className={className}
      imageClassName={imageClassName}
      roundedClassName={roundedClassName}
      fallbackNode={fallbackNode}
      fetchDisplayPx={displayPx}
    />
  );
}
