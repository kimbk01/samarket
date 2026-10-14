/**
 * PTR 띠 광고 — 서버 자격 후보 → 클라이언트 페이로드 (`/api/platform-popup/ptr-reveal`).
 * 클라이언트·서버 공용 타입. 이미지 URL 만 담고 원본 경로·내부 상태는 내보내지 않는다.
 */

import { resolvePlatformPopupCreativePublicUrl } from "@/lib/platform-popup/resolve-popup-creative-url";
import {
  normalizePlatformPopupFrequencyMode,
  type PlatformPopupFrequencyMode,
} from "@/lib/platform-popup/presentation-contract";
import { isPtrBandAspectValidForVariant, type PtrBandVariant } from "@/lib/platform-popup/ptr-reveal-contract";
import type {
  PlatformPopupCandidate,
  PlatformPopupPtrBandAsset,
} from "@/lib/platform-popup/resolve-popup-ad";
import { PLATFORM_POPUP_DEFAULT_TIMEZONE } from "@/lib/platform-popup/types";

export type PtrRevealBand = { creativeId: string; imageUrl: string; altText: string };

export type PtrRevealAd = {
  campaignId: string;
  surface: string;
  href: string;
  ctaLabel: string | null;
  title: string | null;
  frequencyMode: PlatformPopupFrequencyMode;
  suppressionDurationSeconds: number | null;
  timezone: string;
  bands: {
    default: PtrRevealBand;
    tablet: PtrRevealBand | null;
    logo: PtrRevealBand | null;
  };
};

function toBand(
  asset: PlatformPopupPtrBandAsset | undefined,
  variant: PtrBandVariant,
  fallbackAlt: string
): PtrRevealBand | null {
  if (!asset) return null;
  if (!isPtrBandAspectValidForVariant(asset.aspectW, asset.aspectH, variant)) return null;
  const imageUrl = resolvePlatformPopupCreativePublicUrl({
    assetUrl: asset.assetUrl,
    assetPath: asset.assetPath,
  });
  if (!imageUrl) return null;
  return { creativeId: asset.id, imageUrl, altText: asset.altText?.trim() || fallbackAlt };
}

export function buildPtrRevealAdPayload(
  candidate: PlatformPopupCandidate,
  resolved: { href: string; surface: string }
): PtrRevealAd | null {
  const fallbackAlt = candidate.title?.trim() || "Advertisement";
  const bands = candidate.ptrBands ?? {};
  const phone = toBand(bands.default, "default", fallbackAlt);
  if (!phone) return null;
  return {
    campaignId: candidate.id,
    surface: resolved.surface,
    href: resolved.href,
    ctaLabel: candidate.ctaLabel?.trim() || null,
    title: candidate.title?.trim() || null,
    frequencyMode: normalizePlatformPopupFrequencyMode(candidate.frequencyMode),
    suppressionDurationSeconds:
      candidate.suppressionDurationSeconds != null && candidate.suppressionDurationSeconds > 0
        ? candidate.suppressionDurationSeconds
        : null,
    timezone: candidate.timezone?.trim() || PLATFORM_POPUP_DEFAULT_TIMEZONE,
    bands: {
      default: phone,
      tablet: toBand(bands.tablet, "tablet", fallbackAlt),
      logo: toBand(bands.logo, "logo", fallbackAlt),
    },
  };
}
