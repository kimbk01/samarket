"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRegion } from "@/contexts/RegionContext";
import {
  neighborhoodLocationKeyFromRegion,
  neighborhoodLocationMetaFromRegion,
  neighborhoodLocationLabelFromRegion,
} from "@/lib/neighborhood/location-key";
import {
  NEIGHBORHOOD_CATEGORY_LABELS,
  NEIGHBORHOOD_CATEGORY_SLUGS,
} from "@/lib/neighborhood/categories";
import { philifeNeighborhoodFeedUrl, philifeNeighborhoodTopicOptionsUrl } from "@domain/philife/api";
import { philifeAppPaths } from "@domain/philife/paths";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { APP_MAIN_GUTTER_X_CLASS, APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import { CommunityCard } from "./CommunityCard";
import { HorizontalDragScroll } from "./HorizontalDragScroll";
import { AdPostCard } from "@/components/ads/AdPostCard";
import type { AdFeedPost } from "@/lib/ads/types";
import { MySubpageHeader } from "@/components/my/MySubpageHeader";
import { PhilifeTitleWithRegionRow } from "@/components/philife/PhilifeTitleWithRegionRow";
import { useMyNotificationUnreadCount } from "@/hooks/useMyNotificationUnreadCount";

const PAGE_SIZE = 20;

export function CommunityFeed() {
  const { currentRegion } = useRegion();
  const notificationUnreadCount = useMyNotificationUnreadCount();
  const locationKey = neighborhoodLocationKeyFromRegion(currentRegion);
  const locationMeta = neighborhoodLocationMetaFromRegion(currentRegion);
  const locationLabel = neighborhoodLocationLabelFromRegion(currentRegion);
  const [category, setCategory] = useState<string>("");
  const [neighborOnly, setNeighborOnly] = useState(false);
  const [posts, setPosts] = useState<NeighborhoodFeedPostDTO[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState("");
  const [topAds, setTopAds] = useState<AdFeedPost[]>([]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const nextOffsetRef = useRef(0);
  const loadMoreLockRef = useRef(false);
  const feedAbortRef = useRef<AbortController | null>(null);
  const adsAbortRef = useRef<AbortController | null>(null);
  /** 지역·필터가 바뀌면 증가. 이전 요청 응답은 무시해 트래픽·경합 시 UI 꼬임 방지 */
  const feedSessionRef = useRef(0);

  const [chips, setChips] = useState<{ slug: string; label: string }[]>(() => [
    { slug: "", label: "전체" },
    ...NEIGHBORHOOD_CATEGORY_SLUGS.map((s) => ({ slug: s, label: NEIGHBORHOOD_CATEGORY_LABELS[s] })),
  ]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(philifeNeighborhoodTopicOptionsUrl(), { cache: "no-store" });
        const j = (await res.json()) as {
          ok?: boolean;
          feedChips?: { slug: string; name: string }[];
        };
        if (cancelled || !j?.ok || !Array.isArray(j.feedChips) || j.feedChips.length === 0) return;
        setChips([{ slug: "", label: "전체" }, ...j.feedChips.map((x) => ({ slug: x.slug, label: x.name }))]);
      } catch {
        /* 초기 상수 칩 유지 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!category) return;
    const slugs = new Set(chips.map((c) => c.slug));
    if (!slugs.has(category)) setCategory("");
  }, [chips, category]);

  const fetchPage = useCallback(
    async (nextOffset: number, append: boolean, session: number) => {
      if (!locationKey) {
        setPosts([]);
        setHasMore(false);
        setLoading(false);
        setErr("저장된 동네를 선택해 주세요. (지역 설정)");
        return;
      }
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setErr("");
      }
      feedAbortRef.current?.abort();
      const controller = new AbortController();
      feedAbortRef.current = controller;
      try {
        const p = new URLSearchParams();
        p.set("locationKey", locationKey);
        p.set("city", locationMeta?.city ?? "");
        p.set("district", locationMeta?.district ?? "");
        p.set("name", locationMeta?.name ?? (locationLabel || currentRegion?.label || ""));
        p.set("limit", String(PAGE_SIZE));
        p.set("offset", String(nextOffset));
        if (category) p.set("category", category);
        if (neighborOnly) p.set("neighborOnly", "1");
        const res = await fetch(philifeNeighborhoodFeedUrl(p.toString()), {
          cache: "no-store",
          signal: controller.signal,
        });
        const j = (await res.json()) as {
          ok?: boolean;
          posts?: NeighborhoodFeedPostDTO[];
          hasMore?: boolean;
          error?: string;
          /** 피드 API: DB에서 이번에 읽은 행 수(데모 글 병합 시에도 offset 계산용) */
          nextOffset?: number | null;
          dbPageLength?: number;
        };
        if (session !== feedSessionRef.current) return;
        if (res.status === 401 && neighborOnly) {
          setErr("관심이웃 필터는 로그인 후 사용할 수 있어요.");
          setNeighborOnly(false);
          setLoadingMore(false);
          if (!append) setLoading(false);
          return;
        }
        if (!res.ok || !j.ok) {
          const code = j.error ?? "";
          const human =
            code === "invalid_category"
              ? "선택한 주제가 더 이상 사용되지 않아요. 상단 주제를 다시 선택해 주세요."
              : code === "location_not_registered" || code === "invalid_or_unknown_location_key"
                ? "동네 위치를 확인하지 못했습니다. 지역을 다시 저장하거나 잠시 후 다시 시도해 주세요."
                : code === "server_config"
                  ? "서버 설정을 확인할 수 없습니다."
                  : (j.error ?? "피드를 불러오지 못했습니다.");
          setErr(human);
          if (!append) setPosts([]);
          setHasMore(false);
          return;
        }
        const next = j.posts ?? [];
        setPosts((prev) => (append ? [...prev, ...next] : next));
        setHasMore(!!j.hasMore);
        const advance =
          typeof j.dbPageLength === "number" ? j.dbPageLength : next.length;
        nextOffsetRef.current =
          typeof j.nextOffset === "number" ? j.nextOffset : nextOffset + advance;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (session !== feedSessionRef.current) return;
        if (!append) setPosts([]);
        setHasMore(false);
        setErr("피드를 불러오지 못했습니다.");
      } finally {
        if (feedAbortRef.current === controller) {
          feedAbortRef.current = null;
        }
        if (append) {
          setLoadingMore(false);
        } else if (session === feedSessionRef.current) {
          setLoading(false);
        }
      }
    },
    [locationKey, locationMeta?.city, locationMeta?.district, locationMeta?.name, category, neighborOnly, currentRegion?.label, locationLabel]
  );

  useEffect(() => {
    feedSessionRef.current += 1;
    const session = feedSessionRef.current;
    nextOffsetRef.current = 0;
    loadMoreLockRef.current = false;
    void fetchPage(0, false, session);
    return () => {
      feedAbortRef.current?.abort();
    };
  }, [locationKey, category, neighborOnly, fetchPage]);

  // 상단 광고 비동기 로드 (1회, 위치 무관)
  useEffect(() => {
    adsAbortRef.current?.abort();
    const controller = new AbortController();
    adsAbortRef.current = controller;
    fetch("/api/ads/active?boardKey=plife", { signal: controller.signal })
      .then((r) => r.json())
      .then((j: { ads?: AdFeedPost[] }) => {
        if (j.ads) setTopAds(j.ads);
      })
      .catch(() => { /* 광고 로드 실패는 조용히 무시 */ });
    return () => {
      controller.abort();
      if (adsAbortRef.current === controller) {
        adsAbortRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || loadingMore) return;
    const session = feedSessionRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadMoreLockRef.current) return;
        loadMoreLockRef.current = true;
        const start = nextOffsetRef.current;
        void fetchPage(start, true, session).finally(() => {
          loadMoreLockRef.current = false;
        });
      },
      { rootMargin: "120px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, loadingMore, fetchPage]);

  const scrollNavClass =
    "flex w-full max-w-full min-w-0 flex-nowrap justify-start gap-1 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden";

  return (
    <div className="min-h-screen min-w-0 max-w-full overflow-x-hidden bg-background pb-28">
      <MySubpageHeader
        title={<PhilifeTitleWithRegionRow />}
        backHref="/home"
        preferHistoryBack
        hideCtaStrip
        showHubQuickActions
        notificationUnreadCount={notificationUnreadCount}
        stickyBelow={
          <>
            <div className="w-full min-w-0 overflow-x-hidden border-b border-ig-border bg-[var(--sub-bg)]">
              <div className={`${APP_MAIN_HEADER_INNER_CLASS} min-w-0 py-2`}>
                <HorizontalDragScroll
                  className={scrollNavClass}
                  style={{ WebkitOverflowScrolling: "touch" }}
                  aria-label="피드 주제"
                >
                  {chips.map((c) => {
                    const on = category === c.slug || (c.slug === "" && category === "");
                    return (
                      <button
                        key={c.slug || "all"}
                        type="button"
                        onClick={() => setCategory(c.slug === "" ? "" : c.slug)}
                        className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                          on ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </HorizontalDragScroll>
              </div>
            </div>
            <div className="w-full min-w-0 overflow-x-hidden border-b border-ig-border bg-[var(--sub-bg)]">
              <label
                className={`flex cursor-pointer items-center gap-2 py-2.5 text-[12px] text-[var(--text-muted)] ${APP_MAIN_HEADER_INNER_CLASS} min-w-0`}
              >
                <input
                  type="checkbox"
                  checked={neighborOnly}
                  onChange={(e) => setNeighborOnly(e.target.checked)}
                  className="rounded border-gray-300"
                />
                관심이웃 글만 보기
              </label>
            </div>
          </>
        }
      />

      <div className="min-w-0">
        {topAds.length > 0 ? topAds.map((ad) => <AdPostCard key={ad.adId} ad={ad} />) : null}

        {err ? (
          <div className="px-3 py-3 sm:px-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] text-amber-900">{err}</div>
          </div>
        ) : null}
        {loading ? (
          <p className="py-12 text-center text-[14px] text-gray-400">불러오는 중…</p>
        ) : posts.length === 0 ? (
          <div className={`${APP_MAIN_GUTTER_X_CLASS} py-12 text-center text-[14px] text-gray-500`}>
            이 동네에 아직 글이 없어요.
            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
              <Link href={philifeAppPaths.write} className="font-semibold text-signature">
                첫 글 쓰기
              </Link>
              <Link href={philifeAppPaths.openChatCreate} className="font-semibold text-gray-700 underline">
                오픈채팅 만들기
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div
              className={`${APP_MAIN_GUTTER_X_CLASS} space-y-2.5 pt-2 pb-1 ${topAds.length > 0 ? "mt-2" : ""}`}
            >
              {posts.map((p) => (
                <CommunityCard key={p.id} post={p} />
              ))}
            </div>
            <div ref={sentinelRef} className="h-4 w-full" aria-hidden />
            {loadingMore ? <p className="py-4 text-center text-[13px] text-gray-400">더 불러오는 중…</p> : null}
            {!hasMore && posts.length > 0 ? (
              <p className="pb-8 pt-2 text-center text-[12px] text-gray-300">모든 글을 불러왔어요</p>
            ) : null}
          </>
        )}
      </div>

      <Link
        href={philifeAppPaths.write}
        className="kasama-quick-add fixed bottom-24 right-5 z-30 flex h-12 min-w-[5.75rem] items-center justify-center rounded-full bg-signature px-4 text-[15px] font-semibold text-white shadow-lg"
        aria-label="커뮤니티 글쓰기"
      >
        글쓰기
      </Link>
    </div>
  );
}
