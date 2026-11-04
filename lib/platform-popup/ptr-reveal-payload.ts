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
  /** Owner 결정 2: 「다시 보지 않기」 기준 소재 버전 (휴대폰 띠 + 태블릿 띠 + 로고) — 숨김 기록에 그대로 보낸다 */
  /** 비어 있으면(어드민 미리보기 등) 휴대폰 띠 id 로 대신한다 */
  revision?: string;
};

/**
 * Owner 결정 2 (2026-11-04): PTR 「다시 보지 않기」는 실제 소재가 바뀔 때만 풀린다.
 * 소재 = 띠 이미지 3종(휴대폰·태블릿·로고). 어드민 교체는 새 소재 행(새 id · 다시 검토 → 승인)을 만들므로
 * 세 id 를 이은 값이 바뀌면 새 승인 버전이다. 제목·CTA 문구만 고치면 소재 행이 그대로라 풀리지 않는다.
 */
export function ptrRevealCampaignRevision(
  bands: { default?: { id: string } | null; tablet?: { id: string } | null; logo?: { id: string } | null } | null | undefined
): string | null {
  if (!bands?.default?.id) return null;
  return [bands.default.id, bands.tablet?.id ?? "-", bands.logo?.id ?? "-"].join("+");
}

/**
 * P-3 (2026-11-04): PTR 낭독 문구 정본 = 캠페인 title 우선, 없으면 띠 대체 텍스트.
 * 어드민 미리보기(`AdminPtrRevealDetailWorkspace`)도 이 함수를 쓴다.
 */
export function ptrRevealAccessibleText(
  title: string | null | undefined,
  bandAltText: string | null | undefined,
  lastResort = "Advertisement"
): string {
  return title?.trim() || bandAltText?.trim() || lastResort;
}

function toBand(
  asset: PlatformPopupPtrBandAsset | undefined,
  variant: PtrBandVariant,
  title: string | null | undefined
): PtrRevealBand | null {
  if (!asset) return null;
  if (!isPtrBandAspectValidForVariant(asset.aspectW, asset.aspectH, variant)) return null;
  const imageUrl = resolvePlatformPopupCreativePublicUrl({
    assetUrl: asset.assetUrl,
    assetPath: asset.assetPath,
  });
  if (!imageUrl) return null;
  return { creativeId: asset.id, imageUrl, altText: ptrRevealAccessibleText(title, asset.altText) };
}

export function buildPtrRevealAdPayload(
  candidate: PlatformPopupCandidate,
  resolved: { href: string; surface: string }
): PtrRevealAd | null {
  const bands = candidate.ptrBands ?? {};
  const phone = toBand(bands.default, "default", candidate.title);
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
      tablet: toBand(bands.tablet, "tablet", candidate.title),
      logo: toBand(bands.logo, "logo", candidate.title),
    },
    // D-2: 서버 후보 revision(띠 3종 + 목적지 해시)을 그대로 — 숨김 기록 때 앱이 이 값을 보낸다
    revision: candidate.campaignRevision ?? ptrRevealCampaignRevision(bands) ?? phone.creativeId,
  };
}
