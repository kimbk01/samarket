/**
 * CUT 5 — ONE Banner visibility resolver for stores_home_hero.
 * Consumers must not re-check active/window/creative.
 */

import {
  compareStoreBannerAdCampaigns,
  isStoreBannerAdCampaignActive,
  isStoreBannerAdCreativeValid,
  isStoreBannerAdSurface,
  isStoreBannerAdWindowActive,
  type StoreBannerAdCampaignRow,
  type StoreBannerAdSurface,
} from "@/lib/stores/store-banner-ad-campaign-authority";
import { STORES_DISCOVERY_BANNER_AD_ALLOWED_SURFACES } from "@/lib/stores/discovery-authority/surfaces";

export type StoreBannerAdVisibilityFactors = {
  campaignActive: boolean;
  windowActive: boolean;
  surfaceMatched: boolean;
  creativeValid: boolean;
};

export type StoreBannerAdBlockingReason = keyof StoreBannerAdVisibilityFactors;

export type StoreBannerAdVisibilityState = {
  factors: StoreBannerAdVisibilityFactors;
  visible: boolean;
  blockingReasons: StoreBannerAdBlockingReason[];
};

export type StoreBannerAdResolveInput = {
  campaign: StoreBannerAdCampaignRow;
  nowMs: number;
  targetSurface: StoreBannerAdSurface;
};

export type StoreBannerAdResolveResult = StoreBannerAdVisibilityState & {
  campaignId: string;
  surface: StoreBannerAdSurface;
  /** Canonical CTA — empty string means no link. */
  ctaHref: string;
  imageUrl: string;
};

const FACTOR_KEYS = [
  "campaignActive",
  "windowActive",
  "surfaceMatched",
  "creativeValid",
] as const satisfies readonly StoreBannerAdBlockingReason[];

export function deriveStoreBannerAdVisibilityState(
  factors: StoreBannerAdVisibilityFactors
): StoreBannerAdVisibilityState {
  const blockingReasons: StoreBannerAdBlockingReason[] = [];
  for (const key of FACTOR_KEYS) {
    if (!factors[key]) blockingReasons.push(key);
  }
  return {
    factors,
    visible: blockingReasons.length === 0,
    blockingReasons,
  };
}

export function resolveStoreBannerAdVisibility(
  input: StoreBannerAdResolveInput
): StoreBannerAdResolveResult {
  const { campaign } = input;
  const surfaceAllowed = (STORES_DISCOVERY_BANNER_AD_ALLOWED_SURFACES as readonly string[]).includes(
    input.targetSurface
  );
  const state = deriveStoreBannerAdVisibilityState({
    campaignActive: campaign.isActive === true,
    windowActive: isStoreBannerAdWindowActive(campaign, input.nowMs),
    surfaceMatched:
      surfaceAllowed &&
      isStoreBannerAdSurface(campaign.surface) &&
      campaign.surface === input.targetSurface,
    creativeValid: isStoreBannerAdCreativeValid(campaign),
  });
  return {
    ...state,
    campaignId: campaign.id,
    surface: campaign.surface,
    ctaHref: String(campaign.ctaHref ?? "").trim(),
    imageUrl: String(campaign.imageUrl ?? "").trim(),
  };
}

/** Customer-facing slide after ONE resolver — no component re-eligibility. */
export type StoresHomeHeroBannerSlide = {
  id: string;
  imageUrl: string;
  title: string | null;
  subtitle: string | null;
  ctaHref: string;
  sortOrder: number;
};

export function selectVisibleStoreBannerAdCampaigns(input: {
  campaigns: readonly StoreBannerAdCampaignRow[];
  targetSurface: StoreBannerAdSurface;
  nowMs?: number;
}): {
  visible: StoresHomeHeroBannerSlide[];
  blocked: Array<{ campaign: StoreBannerAdCampaignRow; blockingReasons: StoreBannerAdBlockingReason[] }>;
} {
  const nowMs = input.nowMs ?? Date.now();
  const visibleRows: StoreBannerAdCampaignRow[] = [];
  const blocked: Array<{
    campaign: StoreBannerAdCampaignRow;
    blockingReasons: StoreBannerAdBlockingReason[];
  }> = [];

  for (const campaign of input.campaigns) {
    const resolved = resolveStoreBannerAdVisibility({
      campaign,
      nowMs,
      targetSurface: input.targetSurface,
    });
    if (resolved.visible) {
      visibleRows.push(campaign);
    } else {
      blocked.push({ campaign, blockingReasons: resolved.blockingReasons });
    }
  }

  visibleRows.sort(compareStoreBannerAdCampaigns);
  return {
    visible: visibleRows.map((c) => ({
      id: c.id,
      imageUrl: c.imageUrl.trim(),
      title: c.title,
      subtitle: c.subtitle,
      ctaHref: String(c.ctaHref ?? "").trim(),
      sortOrder: c.sortOrder,
    })),
    blocked,
  };
}

/** Convenience — active+window+creative for a row (tests / docs). */
export function isStoreBannerAdVisibleForHomeHero(
  row: StoreBannerAdCampaignRow,
  nowMs: number = Date.now()
): boolean {
  return (
    row.surface === "stores_home_hero" &&
    isStoreBannerAdCampaignActive(row, nowMs)
  );
}
