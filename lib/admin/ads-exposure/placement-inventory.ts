/**
 * Admin placement inventory read model (CUT R5).
 * Capacity / occupancy from existing authorities only — no fake slots, no new writers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  feedAdPoolCapacity,
  feedAdPoolOccupiesStatus,
} from "@/lib/ads/feed-ad-pool-capacity";
import { listFeedAdCampaignsForAdmin } from "@/lib/ads/feed-ad-campaigns-db";
import type { FeedAdCampaignView, FeedAdPlacement } from "@/lib/ads/feed-ad-placement";
import {
  FEED_AD_RECOMMENDED_UPLOAD,
  feedAdStandardPixelLabel,
} from "@/lib/ads/feed-ad-geometry";
import { DELIVERY_HERO_CAPACITY } from "@/lib/admin/ads-exposure/capacity-gate";
import {
  loadHeroPlacementSlots,
  type HeroPlacementSlot,
} from "@/lib/admin/ads-exposure/hero-placement-slots";
import { adsLiveRouteHref } from "@/lib/admin/ads-exposure/live-route";
import { listPlatformPopupAdminCampaigns } from "@/lib/platform-popup/admin-campaign-loader";
import { loadPlatformPopupCandidates } from "@/lib/platform-popup/load-popup-candidates";
import {
  resolvePopupAd,
  type PlatformPopupCandidate,
} from "@/lib/platform-popup/resolve-popup-ad";
import {
  isPlatformPopupAdvertisingSurface,
  resolveDibaySurface,
} from "@/lib/platform-popup/resolve-dibay-surface";
import { DIBAY_CANONICAL_POPUP_CREATIVE_SIZE } from "@/lib/platform-popup/creative-pixel-ssot";
import {
  PLATFORM_POPUP_CONSUMER_SURFACES,
  PLATFORM_POPUP_CREATIVE_ASPECT,
  type PlatformPopupConsumerSurface,
} from "@/lib/platform-popup/types";
import { DELIVERY_AD_BANNER_PIXEL_GUIDE } from "@/lib/stores/advertising/delivery-ad-open-event-commercial";

export const ADS_PLACEMENT_OPS_HREF = "/admin/advertising/operations";

export const FEED_POOL_PLACEMENTS = [
  "COMMUNITY_HOME",
  "COMMUNITY_TOPIC",
  "TRADE_HOME",
  "TRADE_CATEGORY",
] as const satisfies readonly FeedAdPlacement[];

const SURFACE_PATHNAME: Record<PlatformPopupConsumerSurface, string> = {
  COMMUNITY: "/philife",
  TRADE: "/market",
  DELIVERY: "/stores",
  DELIVERY_OWNER: "/stores/owner",
  ADMIN: "/admin",
  MYPAGE: "/mypage",
};

export type PlacementCreativeSpec = {
  aspectLabel: string;
  pixelLabel: string;
  maxFileLabel: string | null;
};

export type FeedPoolCampaignCard = {
  id: string;
  title: string;
  thumbUrl: string | null;
  operatingStatus: string;
  exposureHint: string | null;
  periodLabel: string | null;
  previewHref: string | null;
  operationsHref: string;
};

export type FeedPoolInventory = {
  placementKey: FeedAdPlacement;
  domain: "community" | "trade";
  humanTitleKo: string;
  humanTitleEn: string;
  used: number;
  capacity: number;
  remaining: number;
  status: "available" | "full";
  createHref: string;
  createLabelKo: string;
  createLabelEn: string;
  campaigns: FeedPoolCampaignCard[];
  creativeSpec: PlacementCreativeSpec;
};

export type PopupSurfaceInventory = {
  surfaceKey: PlatformPopupConsumerSurface;
  humanTitleKo: string;
  humanTitleEn: string;
  hasCurrentWinner: boolean;
  currentWinner: {
    campaignId: string;
    title: string;
    thumbUrl: string | null;
    periodLabel: string | null;
    previewHref: string | null;
    operationsHref: string;
  } | null;
  waitingCount: number;
  waitingSummaryKo: string;
  waitingSummaryEn: string;
  createHref: string;
  creativeSpec: PlacementCreativeSpec;
};

export type PlacementInventoryModel = {
  feedPools: FeedPoolInventory[];
  hero: {
    capacity: number;
    placementKey: "STORES_HOME_HERO";
    humanTitleKo: string;
    humanTitleEn: string;
    slots: HeroPlacementSlot[];
    createBaseHref: string;
    creativeSpec: PlacementCreativeSpec;
  };
  popupSurfaces: PopupSurfaceInventory[];
};

const FEED_TITLES: Record<
  FeedAdPlacement,
  { ko: string; en: string; domain: "community" | "trade" }
> = {
  COMMUNITY_HOME: {
    ko: "Community 홈 피드",
    en: "Community home feed",
    domain: "community",
  },
  COMMUNITY_TOPIC: {
    ko: "Community 주제 피드",
    en: "Community topic feed",
    domain: "community",
  },
  TRADE_HOME: { ko: "거래 홈 피드", en: "Trade home feed", domain: "trade" },
  TRADE_CATEGORY: {
    ko: "거래 카테고리 피드",
    en: "Trade category feed",
    domain: "trade",
  },
};

const POPUP_TITLES: Record<PlatformPopupConsumerSurface, { ko: string; en: string }> = {
  COMMUNITY: { ko: "Community 팝업", en: "Community popup" },
  TRADE: { ko: "거래 팝업", en: "Trade popup" },
  DELIVERY: { ko: "배달 팝업", en: "Delivery popup" },
  DELIVERY_OWNER: { ko: "배달 오너 팝업", en: "Delivery owner popup" },
  ADMIN: { ko: "관리자 팝업", en: "Admin popup" },
  MYPAGE: { ko: "마이페이지 팝업", en: "My page popup" },
};

function feedCreativeSpec(): PlacementCreativeSpec {
  return {
    aspectLabel: FEED_AD_RECOMMENDED_UPLOAD.aspectLabel,
    pixelLabel: feedAdStandardPixelLabel().replace(/\s/g, ""),
    maxFileLabel: "2MB",
  };
}

function popupCreativeSpec(): PlacementCreativeSpec {
  const { width, height } = DIBAY_CANONICAL_POPUP_CREATIVE_SIZE;
  return {
    aspectLabel: `${PLATFORM_POPUP_CREATIVE_ASPECT.w}:${PLATFORM_POPUP_CREATIVE_ASPECT.h}`,
    pixelLabel: `${width}×${height}`,
    maxFileLabel: null,
  };
}

function asIsoSlice(v: string | Date | null | undefined): string | null {
  if (v == null) return null;
  const s = typeof v === "string" ? v : v.toISOString();
  return s.slice(0, 16);
}

function periodLabel(
  startAt: string | Date | null | undefined,
  endAt: string | Date | null | undefined
): string | null {
  const a = asIsoSlice(startAt);
  const b = asIsoSlice(endAt);
  if (!a && !b) return null;
  return `${a ?? "—"} → ${b ?? "—"}`;
}

function feedOperatingLabel(status: string): string {
  const st = status.toLowerCase();
  if (st === "active") return "active";
  if (st === "scheduled") return "scheduled";
  if (st === "paused") return "paused";
  if (st === "ended") return "ended";
  if (st === "draft") return "draft";
  return status || "—";
}

function feedExposureHint(status: string): string | null {
  const st = status.toLowerCase();
  if (st === "active") return "pool_eligible";
  if (st === "scheduled") return "scheduled";
  if (st === "paused") return "paused";
  return null;
}

/** Pure: group feed campaigns into placement pools (actual assigned placement only). */
export function projectFeedPoolInventories(
  campaigns: readonly FeedAdCampaignView[]
): FeedPoolInventory[] {
  const byPlacement = new Map<FeedAdPlacement, FeedAdCampaignView[]>();
  for (const key of FEED_POOL_PLACEMENTS) byPlacement.set(key, []);

  for (const c of campaigns) {
    if (!feedAdPoolOccupiesStatus(c.status)) continue;
    const p = c.placement as FeedAdPlacement;
    if (!byPlacement.has(p)) continue;
    byPlacement.get(p)!.push(c);
  }

  return FEED_POOL_PLACEMENTS.map((placementKey) => {
    const meta = FEED_TITLES[placementKey];
    const capacity = feedAdPoolCapacity(placementKey);
    const rows = byPlacement.get(placementKey) ?? [];
    const used = rows.length;
    const remaining = Math.max(0, capacity - used);
    const createHref =
      meta.domain === "community"
        ? "/admin/advertising/direct/community"
        : "/admin/advertising/direct/trade";

    return {
      placementKey,
      domain: meta.domain,
      humanTitleKo: meta.ko,
      humanTitleEn: meta.en,
      used,
      capacity,
      remaining,
      status: remaining > 0 ? ("available" as const) : ("full" as const),
      createHref,
      createLabelKo:
        meta.domain === "community" ? "Community 배너 등록" : "거래 배너 등록",
      createLabelEn:
        meta.domain === "community" ? "Register Community banner" : "Register Trade banner",
      campaigns: rows.map((c) => {
        const thumb = c.slides[0]?.imageUrl?.trim() || null;
        const previewHref = adsLiveRouteHref({
          productKind: "feed_banner",
          placementKey: c.placement,
          domain: c.domain,
          categoryId: c.targetCategoryId,
          topicSlug: c.targetTopicSlug,
        });
        return {
          id: c.id,
          title: c.name || c.slides[0]?.headline || c.id.slice(0, 8),
          thumbUrl: thumb,
          operatingStatus: feedOperatingLabel(c.status),
          exposureHint: feedExposureHint(c.status),
          periodLabel: periodLabel(c.startAt, c.endAt),
          previewHref,
          operationsHref: ADS_PLACEMENT_OPS_HREF,
        };
      }),
      creativeSpec: feedCreativeSpec(),
    };
  });
}

type PopupMeta = {
  id: string;
  name: string;
  thumbUrl: string | null;
  startAt: string | null;
  endAt: string | null;
};

/** Pure: one surface row from resolver winner + eligible waiting (same candidate set). */
export function projectPopupSurfaceInventory(input: {
  surface: PlatformPopupConsumerSurface;
  winnerCampaignId: string | null;
  eligibleCampaignIds: readonly string[];
  metaById: ReadonlyMap<string, PopupMeta>;
}): PopupSurfaceInventory {
  const titles = POPUP_TITLES[input.surface];
  const waitingIds = input.eligibleCampaignIds.filter((id) => id !== input.winnerCampaignId);
  const waitingCount = waitingIds.length;
  const winnerMeta = input.winnerCampaignId
    ? input.metaById.get(input.winnerCampaignId) ?? null
    : null;

  return {
    surfaceKey: input.surface,
    humanTitleKo: titles.ko,
    humanTitleEn: titles.en,
    hasCurrentWinner: Boolean(input.winnerCampaignId),
    currentWinner: input.winnerCampaignId
      ? {
          campaignId: input.winnerCampaignId,
          title: winnerMeta?.name || input.winnerCampaignId.slice(0, 8),
          thumbUrl: winnerMeta?.thumbUrl ?? null,
          periodLabel: periodLabel(winnerMeta?.startAt ?? null, winnerMeta?.endAt ?? null),
          previewHref: adsLiveRouteHref({
            productKind: "popup",
            placementKey: input.surface,
          }),
          operationsHref: ADS_PLACEMENT_OPS_HREF,
        }
      : null,
    waitingCount,
    waitingSummaryKo:
      waitingCount === 0
        ? "대기 없음"
        : `대기 ${waitingCount}건`,
    waitingSummaryEn:
      waitingCount === 0 ? "None waiting" : `${waitingCount} waiting`,
    createHref: "/admin/advertising/direct/popup",
    creativeSpec: popupCreativeSpec(),
  };
}

/**
 * Eligible campaign ids for a surface using the same resolvePopupAd path
 * (winner + non-winners that were eligible at resolve time).
 */
export function eligiblePopupIdsForSurface(input: {
  surface: PlatformPopupConsumerSurface;
  candidates: readonly PlatformPopupCandidate[];
  now: Date;
}): { winnerId: string | null; eligibleIds: string[] } {
  const pathname = SURFACE_PATHNAME[input.surface];
  const resolvedSurface = resolveDibaySurface(pathname);
  if (!isPlatformPopupAdvertisingSurface(resolvedSurface)) {
    return { winnerId: null, eligibleIds: [] };
  }

  const result = resolvePopupAd({
    pathname,
    resolvedSurface,
    now: input.now,
    candidates: input.candidates,
  });

  // Re-derive eligible set by calling resolve with filtered subsets is heavy;
  // instead count candidates that share winner's eligibility by comparing
  // resolve outcomes: when winner exists, eligible = those that match surface
  // filters used inside resolve — use candidate ids that appear in load set
  // and would be considered by resolve (status/approval already filtered in loader).
  const eligibleIds: string[] = [];
  for (const c of input.candidates) {
    const probe = resolvePopupAd({
      pathname,
      resolvedSurface,
      now: input.now,
      candidates: [c],
    });
    if (probe.ok && probe.winner) {
      eligibleIds.push(c.id);
    }
  }

  const winnerId =
    result.ok && result.winner ? result.winner.campaignId : null;
  return { winnerId, eligibleIds };
}

export async function loadPlacementInventory(
  sb: SupabaseClient
): Promise<PlacementInventoryModel> {
  const [feedCampaigns, heroSlots, popupCandidates, popupAdmin] = await Promise.all([
    listFeedAdCampaignsForAdmin(sb),
    loadHeroPlacementSlots(sb),
    loadPlatformPopupCandidates(sb, {}),
    listPlatformPopupAdminCampaigns(sb, { limit: 200 }),
  ]);

  const metaById = new Map<string, PopupMeta>();
  if (popupAdmin.ok) {
    for (const item of popupAdmin.items) {
      metaById.set(item.id, {
        id: item.id,
        name: item.name,
        thumbUrl: item.creativeThumbUrl,
        startAt: item.startAt,
        endAt: item.endAt,
      });
    }
  }
  for (const c of popupCandidates) {
    if (!metaById.has(c.id)) {
      metaById.set(c.id, {
        id: c.id,
        name: c.id.slice(0, 8),
        thumbUrl: c.creative?.assetUrl ?? null,
        startAt: asIsoSlice(c.startAt),
        endAt: asIsoSlice(c.endAt),
      });
    }
  }

  const now = new Date();
  const popupSurfaces: PopupSurfaceInventory[] = [];
  for (const surface of PLATFORM_POPUP_CONSUMER_SURFACES) {
    const { winnerId, eligibleIds } = eligiblePopupIdsForSurface({
      surface,
      candidates: popupCandidates,
      now,
    });
    popupSurfaces.push(
      projectPopupSurfaceInventory({
        surface,
        winnerCampaignId: winnerId,
        eligibleCampaignIds: eligibleIds,
        metaById,
      })
    );
  }

  const heroGuide = DELIVERY_AD_BANNER_PIXEL_GUIDE.STORES_HOME_HERO;

  return {
    feedPools: projectFeedPoolInventories(feedCampaigns),
    hero: {
      capacity: DELIVERY_HERO_CAPACITY,
      placementKey: "STORES_HOME_HERO",
      humanTitleKo: "배달 홈 상단 배너",
      humanTitleEn: "Delivery home top banner",
      slots: heroSlots,
      createBaseHref: "/admin/advertising/direct/delivery",
      creativeSpec: {
        aspectLabel: heroGuide.ratioLabel,
        pixelLabel: `${heroGuide.recommendedWidth}×${heroGuide.recommendedHeight}`,
        maxFileLabel: null,
      },
    },
    popupSurfaces,
  };
}

export function feedPoolCreateBlockedCopy(ko: boolean): { title: string; body: string } {
  return ko
    ? {
        title: "등록 불가",
        body: "현재 이 위치에 등록 가능한 캠페인 수를 모두 사용 중입니다.",
      }
    : {
        title: "Registration unavailable",
        body: "This placement has reached its campaign capacity.",
      };
}
