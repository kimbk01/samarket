"use client";

import { StoreProductThumbnail } from "@/components/stores/common/StoreProductThumbnail";

type ThumbPreset = "list" | "menu" | "cart" | "upsell";

const presetPx: Record<ThumbPreset, number> = {
  list: 92,
  menu: 96,
  cart: 72,
  upsell: 56,
};

export function DeliveryThumbnail({
  src,
  alt = "",
  preset = "menu",
  className = "",
}: {
  src?: string | null;
  alt?: string;
  preset?: ThumbPreset;
  className?: string;
}) {
  const size = presetPx[preset];
  return (
    <StoreProductThumbnail
      src={src}
      alt={alt}
      size={size}
      roundedClassName="rounded-[8px]"
      className={`shrink-0 ${className}`.trim()}
    />
  );
}
