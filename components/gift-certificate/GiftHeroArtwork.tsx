"use client";

import { GiftArtwork } from "@/components/gift-certificate/GiftArtwork";
import { DibayPlatformGiftFallback } from "@/components/gift-certificate/DibayPlatformGiftFallback";
import { StoreGiftFallback } from "@/components/gift-certificate/StoreGiftFallback";
import type { GiftVisualResolved } from "@/lib/gift-certificate/resolve-gift-visual";

/** Full-bleed hero art for Gift certificate asset band — never a tiny side thumbnail. */
export function GiftHeroArtwork({
  resolved,
  issuer,
  compact = false,
}: {
  resolved: GiftVisualResolved;
  issuer: string;
  compact?: boolean;
}) {
  const fallback =
    resolved.usePlatformFallback ? (
      <DibayPlatformGiftFallback className="h-full w-full" />
    ) : (
      <StoreGiftFallback initial={resolved.storeInitial} className="h-full w-full" />
    );

  if (resolved.imageSrc) {
    return (
      <GiftArtwork
        src={resolved.imageSrc}
        alt={issuer}
        fill
        className="absolute inset-0 h-full w-full"
        imageClassName="h-full w-full object-cover"
        roundedClassName="rounded-none"
        fallbackNode={fallback}
        fetchDisplayPx={compact ? 480 : 720}
      />
    );
  }

  return <div className="absolute inset-0">{fallback}</div>;
}
