"use client";

/**
 * 하단 탭 `pointerdown` 직후 호출 — `router.prefetch` 와 **별개**로
 * 목적지 클라이언트 데이터 캐시를 미리 채운다.
 *
 * 라우트 RSC 캐시(`router.prefetch`) 와 클라 데이터 캐시(`homePostsCache`,
 * `tradeFeedClientCache`) 는 분리돼 있어, 라우트만 prewarm 하면 마운트 직후
 * 클라가 또 한 번 fetch 한다. 이 모듈은 **두 캐시를 함께** 데워 첫 진입에서도
 * 카톡/배민급 즉시 렌더가 가능하도록 한다.
 *
 * 부수효과 없는 설계: 이미 캐시된 키는 재요청하지 않고, 미스 일 때만 비동기
 * fetch 를 발사한다(awaited 하지 않음). 실패는 무시 — 라우트 마운트 후 통상
 * 흐름이 같은 `runSingleFlight` 키로 합류한다.
 */

import {
  getPostsForHome,
  isCachedPostsForHomeFresh,
} from "@/lib/posts/getPostsForHome";
import {
  getPostsByTradeCategoryIds,
  getTradeFeedClientViewerSegment,
} from "@/lib/posts/getPostsByCategory";
import { isCachedTradeFeedFresh } from "@/lib/posts/trade-feed-client-cache";
import { prewarmStoreHomeFeedClientCache } from "@/lib/stores/store-home-feed-client-cache";
import {
  fetchMeStoreOrdersHubSummaryDeduped,
  fetchStoresTaxonomyDeduped,
  isStoresTaxonomyClientCacheFresh,
} from "@/lib/stores/store-delivery-api-client";
import {
  buildPhilifeNeighborhoodFeedClientUrl,
  NEIGHBORHOOD_FEED_PAGE_SIZE,
  PHILIFE_GLOBAL_FEED_SESSION_KEY,
} from "@/lib/philife/neighborhood-feed-client-url";
import { fetchNeighborhoodFeedShortTtl } from "@/lib/philife/fetch-neighborhood-feed-short-ttl";
import { writePhilifeFeedCache, philifeFeedViewerSig } from "@/lib/community/philife-feed-session-cache";
import {
  fetchPhilifeNeighborhoodTopicOptions,
  warmPhilifeNeighborhoodTopicOptions,
} from "@/lib/philife/fetch-neighborhood-topic-options-client";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { buildFeedChipsFromPhilifeTopicOptionsJson } from "@/lib/philife/philife-feed-chips-from-topic-options";
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { warmMessengerListBootstrapClient } from "@/lib/community-messenger/warm-messenger-list-bootstrap-client";
import { fetchMeProfileDeduped, isMeProfileCacheFresh } from "@/lib/profile/fetch-me-profile-deduped";

const PHILIFE_TAB_PREWARM_COOLDOWN_MS = 12_000;
const philifeTabPrewarmAt = new Map<string, number>();

type BottomNavTapPrewarmOptions = {
  storeHomeFeedSuffixes?: readonly string[];
};

function canRunPhilifeTabPrewarm(key: string): boolean {
  const now = Date.now();
  const last = philifeTabPrewarmAt.get(key) ?? 0;
  if (now - last < PHILIFE_TAB_PREWARM_COOLDOWN_MS) return false;
  philifeTabPrewarmAt.set(key, now);
  return true;
}

function prewarmPhilifeGlobalFeedVariant(
  viewerSig: string,
  category: string,
  sort: "latest" | "recommended"
): void {
  const warmKey = `${viewerSig}:${category}:${sort}`;
  if (!canRunPhilifeTabPrewarm(warmKey)) return;
  const personalized = viewerSig !== "_anon";
  const url = buildPhilifeNeighborhoodFeedClientUrl({
    globalFeed: true,
    category: category || undefined,
    offset: 0,
    limit: NEIGHBORHOOD_FEED_PAGE_SIZE,
    sort,
  });
  const flightKey = `philife:tab-prewarm:${viewerSig}:${category}:${sort}`;
  void runSingleFlight(flightKey, () =>
    fetchNeighborhoodFeedShortTtl(url, {
      credentials: "include",
      ...(personalized ? { cache: "no-store" as RequestCache } : {}),
    })
  )
    .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
    .then(({ ok, json }) => {
      if (!ok || !json || typeof json !== "object") return;
      const parsed = json as {
        ok?: boolean;
        posts?: Array<Record<string, unknown>>;
        hasMore?: boolean;
        nextOffset?: number | null;
        dbPageLength?: number;
      };
      if (!parsed.ok || !Array.isArray(parsed.posts) || parsed.posts.length === 0) return;
      const advance = typeof parsed.dbPageLength === "number" ? parsed.dbPageLength : parsed.posts.length;
      const nextOffset = typeof parsed.nextOffset === "number" ? parsed.nextOffset : advance;
      writePhilifeFeedCache(
        PHILIFE_GLOBAL_FEED_SESSION_KEY,
        category,
        false,
        viewerSig,
        {
          posts: parsed.posts as NeighborhoodFeedPostDTO[],
          hasMore: !!parsed.hasMore,
          nextOffset,
        },
        category ? "" : sort
      );
    })
    .catch(() => {
      /* philife 글로벌 prewarm 실패는 무시 */
    });
}

function decodeSegment(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function prewarmBottomNavTapTargetClientCache(
  href: string,
  opts: BottomNavTapPrewarmOptions = {}
): void {
  if (typeof window === "undefined") return;
  if (!href || typeof href !== "string") return;
  const path = (href.split("?")[0] ?? "").trim();
  if (!path) return;

  if (path === "/market") {
    const opts = { sort: "latest" as const, type: null, tradeState: "latest" as const };
    if (isCachedPostsForHomeFresh(opts)) return;
    void getPostsForHome({ page: 1, ...opts }).catch(() => {
      /* 라우트 마운트 후 통상 흐름이 같은 single-flight 로 합류 */
    });
    return;
  }

  const m = path.match(/^\/market\/([^/]+)$/);
  if (m) {
    const parent = decodeSegment(m[1]!);
    const opts = {
      page: 1,
      sort: "latest" as const,
      tradeMarketParent: parent,
      topic: "",
    };
    if (isCachedTradeFeedFresh([], opts, getTradeFeedClientViewerSegment())) return;
    void getPostsByTradeCategoryIds([], opts).catch(() => {
      /* 동일 — 마운트 후 single-flight 합류 */
    });
    return;
  }

  if (path === "/stores") {
    const feedSuffixes = Array.from(new Set(["", ...(opts.storeHomeFeedSuffixes ?? [])]));
    for (const suffix of feedSuffixes) {
      void prewarmStoreHomeFeedClientCache(suffix).catch(() => {
        /* stores 홈 피드 prewarm 실패는 무시 (마운트 시 단일비행 합류) */
      });
    }
    if (!isStoresTaxonomyClientCacheFresh()) {
      void fetchStoresTaxonomyDeduped().catch(() => {
        /* taxonomy prewarm 실패 무시 — 마운트 시 동일 single-flight·TTL 합류 */
      });
    }
    void fetchMeStoreOrdersHubSummaryDeduped().catch(() => {
      /* 비로그인/권한 없음 포함 허브 요약 실패 무시 */
    });
    return;
  }

  if (path === "/philife") {
    const viewerSig = philifeFeedViewerSig();
    prewarmPhilifeGlobalFeedVariant(viewerSig, "", "latest");
    prewarmPhilifeGlobalFeedVariant(viewerSig, "", "recommended");
    warmPhilifeNeighborhoodTopicOptions();
    void fetchPhilifeNeighborhoodTopicOptions()
      .then((json) => {
        const { chips } = buildFeedChipsFromPhilifeTopicOptionsJson(json);
        const categoryTargets = chips
          .filter((chip) => !chip.is_feed_sort)
          .map((chip) => (chip.slug ?? "").trim())
          .filter((slug) => slug.length > 0)
          .slice(0, 2);
        for (const category of categoryTargets) {
          prewarmPhilifeGlobalFeedVariant(viewerSig, category, "latest");
        }
      })
      .catch(() => {
        /* 칩 prewarm 실패는 무시 */
      });
    return;
  }

  if (path === "/community-messenger") {
    warmMessengerListBootstrapClient();
    return;
  }

  if (path === "/mypage") {
    if (isMeProfileCacheFresh()) return;
    void fetchMeProfileDeduped().catch(() => {
      /* mypage 프로필 prewarm 실패는 무시 */
    });
    return;
  }

  /**
   * 현재 범위:
   * - 거래(/market 계열)
   * - 필라이프(/philife 글로벌·토픽 옵션)
   * - 스토어(/stores 기본 피드·taxonomy, 허브 요약)
   * - 메신저(/community-messenger lite bootstrap)
   * - 내정보(/mypage 프로필)
   */
}
