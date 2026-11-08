/**
 * Admin placement inventory read model (CUT R5).
 * Capacity / occupancy from existing authorities only — no fake slots, no new writers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { bannerPlacementDefaultCapacity } from "@/lib/ads/banner-placement-capacity-ssot";
import {
  countFeedAdPoolOccupancy,
  feedAdPoolCapacity,
  feedAdPoolKey,
  feedAdPoolOccupiesCampaign,
  feedAdPoolTargetKey,
} from "@/lib/ads/feed-ad-pool-capacity";
import { translate } from "@/lib/i18n/messages";
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
import { humanPlacementLabel } from "@/lib/admin/ads-exposure/human-placement-label";
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

export type FeedPoolCampaignOwnershipKind = "paid" | "admin_direct" | "event_promotion";

export type FeedPoolCampaignCard = {
  id: string;
  title: string;
  thumbUrl: string | null;
  operatingStatus: string;
  exposureHint: string | null;
  periodLabel: string | null;
  previewHref: string | null;
  /** Paid / Admin Direct ops page — Event promotion rows use manageHref instead. */
  operationsHref: string;
  ownershipKind: FeedPoolCampaignOwnershipKind;
  /** Canonical Event Dist editor when ownershipKind=event_promotion (ID-based). */
  manageHref: string | null;
  eventId: string | null;
};

/** FB-A11: 업종(거래 카테고리)·주제(커뮤니티) 별 자리 — 풀 키 = 위치 + 대상 (DB 트리거·등록 화면과 같은 함수) */
export type FeedPoolTargetInventory = {
  /** 업종 id · 주제 slug (홈은 "") */
  targetKey: string;
  used: number;
  capacity: number;
  remaining: number;
  status: "available" | "full";
  campaignIds: string[];
};

export type FeedPoolInventory = {
  placementKey: FeedAdPlacement;
  /**
   * FB-A11: 대상별 줄. 홈 = 1줄(targetKey ""). 업종/주제 위치 = 광고가 있는 대상마다 1줄.
   * 위치 합계(used·capacity·remaining)는 이 줄들의 합이다(대상 줄이 없으면 빈 대상 1개 = 0/3).
   */
  targetPools: FeedPoolTargetInventory[];
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

/** 재감사 R3 (A-5): 카드 제목도 지면 이름 단일 정의(`human-placement-label`)를 쓴다 */
const FEED_DOMAIN: Record<FeedAdPlacement, "community" | "trade"> = {
  COMMUNITY_HOME: "community",
  COMMUNITY_TOPIC: "community",
  TRADE_HOME: "trade",
  TRADE_CATEGORY: "trade",
};
function feedTitles(key: FeedAdPlacement) {
  return { ko: humanPlacementLabel(key, true), en: humanPlacementLabel(key, false), domain: FEED_DOMAIN[key] };
}
function popupTitles(surface: PlatformPopupConsumerSurface) {
  return { ko: humanPlacementLabel(surface, true), en: humanPlacementLabel(surface, false) };
}

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
  campaigns: readonly FeedAdCampaignView[],
  eventPromoByCampaignId?: ReadonlyMap<string, { eventId: string }>,
  nowMs: number = Date.now()
): FeedPoolInventory[] {
  const byPlacement = new Map<FeedAdPlacement, FeedAdCampaignView[]>();
  for (const key of FEED_POOL_PLACEMENTS) byPlacement.set(key, []);

  for (const c of campaigns) {
    // N-01: active 여도 종료 시각이 지난 캠페인은 점유·「운영 중」으로 보이지 않는다 (표시 규칙, DB 무변경).
    if (!feedAdPoolOccupiesCampaign(c, nowMs)) continue;
    const p = c.placement as FeedAdPlacement;
    if (!byPlacement.has(p)) continue;
    byPlacement.get(p)!.push(c);
  }

  // FB-A11: 세는 규칙 = countFeedAdPoolOccupancy (등록 화면·서버 신청/승인 검사와 같은 함수)
  const occupancy = countFeedAdPoolOccupancy(campaigns, nowMs);

  return FEED_POOL_PLACEMENTS.map((placementKey) => {
    const meta = feedTitles(placementKey);
    const perTargetCapacity = feedAdPoolCapacity(placementKey);
    const rows = byPlacement.get(placementKey) ?? [];
    const targetKeys = [...new Set(rows.map((c) => feedAdPoolTargetKey(placementKey, c)))].sort();
    if (targetKeys.length === 0) targetKeys.push("");
    const targetPools: FeedPoolTargetInventory[] = targetKeys.map((targetKey) => {
      const poolKey = feedAdPoolKey(placementKey, {
        targetCategoryId: placementKey === "TRADE_CATEGORY" ? targetKey : null,
        targetTopicSlug: placementKey === "COMMUNITY_TOPIC" ? targetKey : null,
      });
      const tUsed = occupancy.get(poolKey) ?? 0;
      const tRemaining = Math.max(0, perTargetCapacity - tUsed);
      return {
        targetKey,
        used: tUsed,
        capacity: perTargetCapacity,
        remaining: tRemaining,
        status: tRemaining > 0 ? ("available" as const) : ("full" as const),
        campaignIds: rows.filter((c) => feedAdPoolTargetKey(placementKey, c) === targetKey).map((c) => c.id),
      };
    });
    const used = targetPools.reduce((n, t) => n + t.used, 0);
    const capacity = targetPools.reduce((n, t) => n + t.capacity, 0);
    const remaining = targetPools.reduce((n, t) => n + t.remaining, 0);
    const createHref =
      meta.domain === "community"
        ? "/admin/advertising/direct/community"
        : "/admin/advertising/direct/trade";

    return {
      placementKey,
      targetPools,
      domain: meta.domain,
      humanTitleKo: meta.ko,
      humanTitleEn: meta.en,
      used,
      capacity,
      remaining,
      status: remaining > 0 ? ("available" as const) : ("full" as const),
      createHref,
      createLabelKo: translate(
        "ko",
        meta.domain === "community" ? "admin_ads_placement_register_community_banner" : "admin_ads_placement_register_trade_banner"
      ),
      createLabelEn: translate(
        "en",
        meta.domain === "community" ? "admin_ads_placement_register_community_banner" : "admin_ads_placement_register_trade_banner"
      ),
      campaigns: rows.map((c) => {
        const thumb = c.slides[0]?.imageUrl?.trim() || null;
        const previewHref = adsLiveRouteHref({
          productKind: "feed_banner",
          placementKey: c.placement,
          domain: c.domain,
          categoryId: c.targetCategoryId,
          topicSlug: c.targetTopicSlug,
        });
        const promo = eventPromoByCampaignId?.get(c.id);
        let ownershipKind: FeedPoolCampaignOwnershipKind;
        let manageHref: string | null = null;
        let eventId: string | null = null;
        if (promo?.eventId) {
          ownershipKind = "event_promotion";
          eventId = promo.eventId;
          manageHref = `/admin/platform-events/${encodeURIComponent(promo.eventId)}#distribution`;
        } else if (c.source === "MEMBER_REQUESTED") {
          ownershipKind = "paid";
        } else {
          ownershipKind = "admin_direct";
        }
        return {
          id: c.id,
          title: c.name || c.slides[0]?.headline || c.id.slice(0, 8),
          thumbUrl: thumb,
          operatingStatus: feedOperatingLabel(c.status),
          exposureHint: feedExposureHint(c.status),
          periodLabel: periodLabel(c.startAt, c.endAt),
          previewHref,
          operationsHref: ADS_PLACEMENT_OPS_HREF,
          ownershipKind,
          manageHref,
          eventId,
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
  const titles = popupTitles(input.surface);
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
        ? translate("ko", "admin_ads_placement_none_waiting")
        : translate("ko", "admin_ads_placement_n_waiting", { n: waitingCount }),
    waitingSummaryEn:
      waitingCount === 0
        ? translate("en", "admin_ads_placement_none_waiting")
        : translate("en", "admin_ads_placement_n_waiting", { n: waitingCount }),
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

  /** ID-based: Dist channel_ref_id → Event (INLINE Event banners only). */
  const eventPromoByCampaignId = new Map<string, { eventId: string }>();
  const feedIds = feedCampaigns.map((c) => c.id).filter(Boolean);
  if (feedIds.length > 0) {
    const { data: distRows } = await sb
      .from("platform_promotion_distributions")
      .select("content_id, channel_ref_id")
      .eq("channel", "banner")
      .eq("content_type", "platform_event")
      .in("channel_ref_id", feedIds);
    for (const row of distRows ?? []) {
      const ref = String((row as { channel_ref_id?: string | null }).channel_ref_id ?? "").trim();
      const eventId = String((row as { content_id?: string }).content_id ?? "").trim();
      if (ref && eventId) eventPromoByCampaignId.set(ref, { eventId });
    }
  }

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
    feedPools: projectFeedPoolInventories(feedCampaigns, eventPromoByCampaignId),
    hero: {
      capacity: DELIVERY_HERO_CAPACITY,
      placementKey: "STORES_HOME_HERO",
      humanTitleKo: humanPlacementLabel("STORES_HOME_HERO", true),
      humanTitleEn: humanPlacementLabel("STORES_HOME_HERO", false),
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
  const lang = ko ? "ko" : "en";
  return {
    title: translate(lang, "admin_ads_placement_register_blocked_title"),
    body: translate(lang, "admin_ads_placement_register_blocked_body"),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 위치 지도 = 지면 전체 (설계 ads-admin-ssot-design-2026-11-07 §5 · 2026-11-07)
// 칸마다 수용량 · 노출 중 · 예약 · 비어 있음 → 누르면 원장(`/admin/advertising?location=`)이 그 위치로 걸러진다.
// 수 = 원장 함수 `admin_ads_ledger_page.location_counts` (원장 행과 같은 원천). 수용량 = 기존 정의만
// (banner-placement-capacity-ssot · feed-ad-pool-capacity · 상위노출 위쪽 1자리 · 팝업 화면당 1개) — 정의가 없으면 null.
// ─────────────────────────────────────────────────────────────────────────────

export type LedgerSurfaceGroup = "delivery" | "feed" | "boost" | "popup" | "ptr" | "mypage" | "intro" | "event";

export type LedgerSurfaceCell = {
  group: LedgerSurfaceGroup;
  locationKey: string;
  /** 업종 slug · 카테고리 id · 주제 slug · 팝업/PTR 화면 · 이벤트 화면 (null = 그 지면 전체) */
  locationTarget: string | null;
  locationTargetName: string | null;
  capacity: number | null;
  live: number;
  scheduled: number;
  waiting: number;
  /** 수용량이 있을 때만 — 수용량 − (노출 중 + 대기) · 대상별로 나뉘는 지면의 합계 칸은 null(비어 있는지는 대상 칸에서만 본다) */
  vacant: number | null;
  /**
   * 실기 v6 FAIL 3 (2026-11-07): 대상별로 나뉘는 지면(업종 상단·카테고리·주제)의 「전체」 합계 칸 — `capacity` 는 **대상 1곳당** 수용량이다.
   * 합계 노출 수와 1곳 수용량을 나란히 두면 초과처럼 보였다(업종 8곳 × 1 → 「수용 1 · 노출 중 8」).
   */
  capacityPerTarget: boolean;
  /** 합계 칸만 — 노출 중인 대상(업종·카테고리·주제) 수 */
  liveTargets: number | null;
  /** 원장 거름 주소 */
  ledgerHref: string;
};

/** §5 지면 목록 (대상 없는 기본 칸) — 원장 위치 키와 같은 값 */
export const LEDGER_SURFACE_BASE: ReadonlyArray<{ group: LedgerSurfaceGroup; locationKey: string; locationTarget?: string }> = [
  { group: "delivery", locationKey: "STORES_HOME_HERO" },
  { group: "delivery", locationKey: "STORES_HOME_INLINE_1" },
  { group: "delivery", locationKey: "STORES_CATEGORY_TOP" },
  { group: "delivery", locationKey: "STORES_SEARCH_TOP" },
  { group: "delivery", locationKey: "STORES_HOME_FEED" },
  { group: "delivery", locationKey: "STORES_CATEGORY_FEED" },
  { group: "feed", locationKey: "TRADE_HOME" },
  { group: "feed", locationKey: "TRADE_CATEGORY" },
  { group: "feed", locationKey: "COMMUNITY_HOME" },
  { group: "feed", locationKey: "COMMUNITY_TOPIC" },
  { group: "boost", locationKey: "TRADE_BOOST_TOP" },
  { group: "boost", locationKey: "COMMUNITY_BOOST_TOP" },
  { group: "popup", locationKey: "POPUP", locationTarget: "COMMUNITY" },
  { group: "popup", locationKey: "POPUP", locationTarget: "TRADE" },
  { group: "popup", locationKey: "POPUP", locationTarget: "DELIVERY" },
  { group: "popup", locationKey: "POPUP", locationTarget: "MYPAGE" },
  { group: "popup", locationKey: "POPUP", locationTarget: "GLOBAL" },
  { group: "ptr", locationKey: "PTR", locationTarget: "COMMUNITY" },
  { group: "ptr", locationKey: "PTR", locationTarget: "TRADE" },
  { group: "ptr", locationKey: "PTR", locationTarget: "DELIVERY" },
  { group: "ptr", locationKey: "PTR", locationTarget: "GLOBAL" },
  { group: "mypage", locationKey: "MYPAGE_TOP" },
  { group: "intro", locationKey: "APP_INTRO" },
  { group: "event", locationKey: "EVENT_HERO" },
];

/** 대상별로 칸을 더 나누는 지면 (업종 상단·업종 목록·카테고리·주제) */
const LEDGER_SURFACE_SPLIT_BY_TARGET = new Set(["STORES_CATEGORY_TOP", "STORES_CATEGORY_FEED", "TRADE_CATEGORY", "COMMUNITY_TOPIC"]);

export function ledgerSurfaceCapacity(locationKey: string): number | null {
  switch (locationKey) {
    case "STORES_HOME_HERO":
      return DELIVERY_HERO_CAPACITY;
    case "STORES_HOME_INLINE_1":
    case "STORES_CATEGORY_TOP":
    case "STORES_SEARCH_TOP":
      return bannerPlacementDefaultCapacity(locationKey);
    case "TRADE_HOME":
    case "TRADE_CATEGORY":
    case "COMMUNITY_HOME":
    case "COMMUNITY_TOPIC":
      return feedAdPoolCapacity(locationKey);
    case "TRADE_BOOST_TOP":
    case "COMMUNITY_BOOST_TOP":
      return 1;
    case "POPUP":
      return 1;
    default:
      return null;
  }
}

export function ledgerSurfaceHref(locationKey: string, locationTarget: string | null): string {
  const v = locationTarget ? `${locationKey}|${locationTarget}` : locationKey;
  return `/admin/advertising?location=${encodeURIComponent(v)}`;
}

type LocationCountRow = {
  locationKey: string | null;
  locationTarget: string | null;
  locationTargetName: string | null;
  statusTab: string;
  n: number;
};

/**
 * 원장 위치 수 → 지면 칸. 팝업·PTR 은 화면 목록(`COMMUNITY,TRADE`)에 그 화면이 들어 있으면 그 칸에 센다
 * (원장 거름 `?location=POPUP|TRADE` 와 같은 규칙). 전체 화면(GLOBAL) 팝업·PTR 은 「전체 화면」 칸에 따로 센다.
 */
export function projectLedgerSurfaceMap(rows: readonly LocationCountRow[]): LedgerSurfaceCell[] {
  const cells: LedgerSurfaceCell[] = [];
  const add = (group: LedgerSurfaceGroup, key: string, target: string | null, name: string | null) => {
    const matches = rows.filter((r) => {
      if (String(r.locationKey ?? "").toUpperCase() !== key) return false;
      if (key === "POPUP" || key === "PTR") {
        if (!target) return true;
        const list = String(r.locationTarget ?? "GLOBAL").toUpperCase().split(",").map((s) => s.trim());
        return list.includes(target);
      }
      if (target == null) return true;
      return String(r.locationTarget ?? "").toLowerCase() === target.toLowerCase();
    });
    const sum = (tab: string) => matches.filter((r) => r.statusTab === tab).reduce((a, r) => a + r.n, 0);
    const capacity = ledgerSurfaceCapacity(key);
    const live = sum("live");
    const waiting = sum("waiting");
    const aggregate = target == null && LEDGER_SURFACE_SPLIT_BY_TARGET.has(key);
    const liveTargets = aggregate
      ? new Set(
          matches
            .filter((r) => r.statusTab === "live" && r.n > 0)
            .map((r) => String(r.locationTarget ?? "").trim().toLowerCase())
            .filter(Boolean)
        ).size
      : null;
    cells.push({
      group,
      locationKey: key,
      locationTarget: target,
      locationTargetName: name,
      capacity,
      live,
      scheduled: sum("scheduled"),
      waiting,
      vacant: capacity == null || aggregate ? null : Math.max(0, capacity - live),
      capacityPerTarget: aggregate,
      liveTargets,
      ledgerHref: ledgerSurfaceHref(key, target),
    });
  };
  for (const base of LEDGER_SURFACE_BASE) {
    add(base.group, base.locationKey, base.locationTarget ?? null, null);
    if (LEDGER_SURFACE_SPLIT_BY_TARGET.has(base.locationKey)) {
      const targets = new Map<string, string | null>();
      for (const r of rows) {
        if (String(r.locationKey ?? "").toUpperCase() !== base.locationKey) continue;
        const t = String(r.locationTarget ?? "").trim();
        if (t && !targets.has(t)) targets.set(t, r.locationTargetName);
      }
      for (const [t, name] of [...targets.entries()].sort((a, b) => String(a[1] ?? a[0]).localeCompare(String(b[1] ?? b[0])))) {
        add(base.group, base.locationKey, t, name);
      }
    }
  }
  return cells;
}
