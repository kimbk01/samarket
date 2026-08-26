"use client";

import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";

/** Gift product artwork — Admin image_url or DIBAY product fallback (no external demos). */
export function GiftArtwork({
  src,
  alt,
  size = 96,
  className = "",
  roundedClassName = "rounded-ui-rect",
}: {
  src?: string | null;
  alt?: string;
  size?: number;
  className?: string;
  roundedClassName?: string;
}) {
  return (
    <SamarketThumbnail
      src={src}
      alt={alt ?? ""}
      size={size}
      className={className}
      roundedClassName={roundedClassName}
      fetchDisplayPx={Math.min(512, Math.max(96, size * 2))}
    />
  );
}
