"use client";

import {
  readStoreDetailListSeed,
  storeDetailPartialFromListSeed,
  type StoreDetailListSeed,
} from "@/lib/dibay/store-detail-list-seed";
import type { StoreBannerPublicRow, StoreNoticePublicRow } from "@/lib/stores/store-banners-notices-public";
import { decodeSlugSegment } from "@/lib/stores/store-consumer-route";
import {
  parseStoreMenusPayload,
  parseStoreSummaryPayload,
  type StoreMenusPayload,
  type StoreSummaryPayload,
} from "@/lib/stores/store-detail-split-types";
import type { StoreApiJsonResponse } from "@/lib/stores/store-delivery-api-client";
import {
  peekStoreBannersPublicCache,
  peekStoreMenusPublicCache,
  peekStoreNoticesPublicCache,
  peekStoreSummaryPublicCache,
} from "@/lib/stores/store-delivery-api-client";
import type { StorePublicInitialSnapshot } from "@/lib/stores/store-public-page-hydrate";

export function storeDetailBannersFromListSeed(seed: StoreDetailListSeed): StoreBannerPublicRow[] {
  const url = seed.hero_image_url?.trim();
  if (!url) return [];
  return [
    {
      id: `seed:${seed.slug}`,
      image_url: url,
      title: null,
      description: null,
      link_type: "none",
      link_target_id: null,
      sort_order: 0,
    },
  ];
}

export type StoreDetailInstantPeek = {
  listSeed: StoreDetailListSeed | null;
  summaryRes: StoreApiJsonResponse | null;
  menusRes: StoreApiJsonResponse | null;
  bannersRes: StoreApiJsonResponse | null;
  noticesRes: StoreApiJsonResponse | null;
  summaryParsed: StoreSummaryPayload | null;
  menusParsed: StoreMenusPayload | null;
};

export function peekStoreDetailInstantHydrate(slug: string): StoreDetailInstantPeek {
  const decoded = decodeSlugSegment(slug);
  const listSeed = readStoreDetailListSeed(decoded);
  const summaryRes = peekStoreSummaryPublicCache(decoded);
  const menusRes = peekStoreMenusPublicCache(decoded);
  const bannersRes = peekStoreBannersPublicCache(decoded);
  const noticesRes = peekStoreNoticesPublicCache(decoded);
  const summaryParsed =
    summaryRes?.status === 200 ? parseStoreSummaryPayload(summaryRes.json) : null;
  const menusParsed = menusRes?.status === 200 ? parseStoreMenusPayload(menusRes.json) : null;
  return {
    listSeed,
    summaryRes,
    menusRes,
    bannersRes,
    noticesRes,
    summaryParsed: summaryParsed?.ok && summaryParsed.store?.id ? summaryParsed : null,
    menusParsed: menusParsed?.ok ? menusParsed : null,
  };
}

/** 클라 첫 `useState` — 목록 seed·prewarm 캐시로 loading=false·즉시 페인트 */
export function buildStoreDetailClientInitialState(
  slug: string,
  serverSnap: StorePublicInitialSnapshot
): {
  hasInstantPaint: boolean;
  summaryLoading: boolean;
  menusLoading: boolean;
  storeFromSeed: ReturnType<typeof storeDetailPartialFromListSeed> | null;
  publicBannersFromSeed: StoreBannerPublicRow[];
  peek: StoreDetailInstantPeek;
} {
  if (typeof window === "undefined") {
    return {
      hasInstantPaint: false,
      summaryLoading: serverSnap.loading,
      menusLoading: serverSnap.loading,
      storeFromSeed: null,
      publicBannersFromSeed: [],
      peek: {
        listSeed: null,
        summaryRes: null,
        menusRes: null,
        bannersRes: null,
        noticesRes: null,
        summaryParsed: null,
        menusParsed: null,
      },
    };
  }

  const peek = peekStoreDetailInstantHydrate(slug);
  const hasSummaryCache = peek.summaryParsed != null;
  const hasMenusCache = Boolean(
    peek.menusParsed?.ok && Array.isArray(peek.menusParsed.products)
  );
  const hasListSeed = peek.listSeed != null;
  const hasInstantPaint = hasListSeed || hasSummaryCache;

  return {
    hasInstantPaint,
    summaryLoading: hasInstantPaint ? false : serverSnap.loading,
    menusLoading: hasMenusCache ? false : hasInstantPaint ? true : serverSnap.loading,
    storeFromSeed:
      hasSummaryCache && peek.summaryParsed?.store ?
        (peek.summaryParsed.store as ReturnType<typeof storeDetailPartialFromListSeed>)
      : hasListSeed ?
        storeDetailPartialFromListSeed(peek.listSeed!)
      : null,
    publicBannersFromSeed:
      peek.listSeed ? storeDetailBannersFromListSeed(peek.listSeed) : [],
    peek,
  };
}

export function parseBannersFromApiResponse(res: StoreApiJsonResponse | null): StoreBannerPublicRow[] {
  if (!res || res.status !== 200) return [];
  const j = res.json as { ok?: boolean; banners?: StoreBannerPublicRow[] };
  return j?.ok && Array.isArray(j.banners) ? j.banners : [];
}

export function parseNoticesFromApiResponse(res: StoreApiJsonResponse | null): StoreNoticePublicRow[] {
  if (!res || res.status !== 200) return [];
  const j = res.json as { ok?: boolean; notices?: StoreNoticePublicRow[] };
  return j?.ok && Array.isArray(j.notices) ? j.notices : [];
}
