"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { CategoryType } from "@/lib/categories/types";
import type { CategoryWithSettings } from "@/lib/categories/types";
import type { PostWithMeta } from "@/lib/posts/schema";
import {
  getCategoryBySlugOrId,
  toCategoryWithSettings,
} from "@/lib/categories/getCategoryById";
import { mapChildCategoryRow, type CategoryDbRow as TradeChildDbRow } from "@/lib/categories/getChildCategories";
import { writeCategoryCache } from "@/lib/categories/category-memory-cache";
import { getCategoryHref } from "@/lib/categories/getCategoryHref";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { useRegisterCategoryListStickyHeader } from "@/contexts/CategoryListHeaderContext";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import type { TradeCategoryServerSeed } from "@/lib/market/trade-category-server-seed";
import { buildMarketBootstrapQueryKey } from "@/lib/market/build-market-bootstrap-query-key";
import { normalizeMarketSlugParam } from "@/lib/categories/tradeMarketPath";

function tradeSeedMatchesMarketSlug(seed: TradeCategoryServerSeed, slugOrId: string): boolean {
  const n = normalizeMarketSlugParam(slugOrId);
  if (!n) return false;
  if (seed.category.id === n) return true;
  const slug = seed.category.slug?.trim().normalize("NFC");
  return !!slug && slug === n;
}

type ExpectedType = CategoryType;

interface CategoryListLayoutProps {
  /** URL 세그먼트 (id 또는 slug) */
  slugOrId: string;
  /** 이 페이지가 기대하는 카테고리 type (불일치 시 올바른 경로로 리다이렉트) */
  expectedType: ExpectedType;
  /** RSC에서 채운 거래 마켓 부트스트랩 — 있으면 첫 `fetch(market-bootstrap)` 생략 */
  tradeServerSeed?: TradeCategoryServerSeed | null;
  /** 뒤로가기 링크 (미주입 시 history.back) */
  backHref?: string;
  children: (
    category: CategoryWithSettings,
    extra?: {
      tradeBootstrapChildren?: CategoryWithSettings[];
      /** 피드 SQL 필터용 직계 하위 id/slug 전체(bootstrap) — 칩 목록과 분리 */
      tradeBootstrapChildrenForFilter?: { id: string; slug: string | null }[];
      tradeBootstrapFeed?: {
        posts: PostWithMeta[];
        hasMore: boolean;
        feedKey: string;
        favoriteMap?: Record<string, boolean>;
      } | null;
    }
  ) => React.ReactNode;
}

export function CategoryListLayout({
  slugOrId,
  expectedType,
  backHref,
  children,
  tradeServerSeed = null,
}: CategoryListLayoutProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsRef = useRef(searchParams);
  /**
   * 거래 마켓만: `load` 의존성에 쿼리 문자열을 넣어 주제·정렬 변경 시 부트스트랩 소프트 리싱크 실행.
   * (philife 등 비-trade 에서는 빈 문자열로 고정해 쿼리만 바뀔 때 `getCategoryBySlugOrId` 재호출 방지)
   */
  const tradeMarketSearchSyncKey = expectedType === "trade" ? searchParams.toString() : "";
  const isTradeSeeded = expectedType === "trade" && tradeServerSeed != null;

  const [category, setCategory] = useState<CategoryWithSettings | null>(() =>
    isTradeSeeded ? tradeServerSeed!.category : null
  );
  const [tradeBootstrapChildren, setTradeBootstrapChildren] = useState<CategoryWithSettings[] | undefined>(
    () => (isTradeSeeded ? tradeServerSeed!.tradeBootstrapChildren : undefined)
  );
  const [tradeBootstrapFeed, setTradeBootstrapFeed] = useState<
    | {
        posts: PostWithMeta[];
        hasMore: boolean;
        feedKey: string;
        favoriteMap?: Record<string, boolean>;
      }
    | null
    | undefined
  >(() => (isTradeSeeded ? tradeServerSeed!.tradeBootstrapFeed ?? null : undefined));
  const [tradeBootstrapChildrenForFilter, setTradeBootstrapChildrenForFilter] = useState<
    { id: string; slug: string | null }[] | undefined
  >(() => (isTradeSeeded ? tradeServerSeed!.tradeBootstrapChildrenForFilter : undefined));
  const [status, setStatus] = useState<"loading" | "found" | "not_found" | "redirect">(() =>
    isTradeSeeded ? "found" : "loading"
  );
  /** `load` 콜백 deps 에 category 를 넣지 않기 위해 — 일자리 `queryKey` 정규화 시 이중 fetch 방지 */
  const categoryRef = useRef<CategoryWithSettings | null>(null);
  categoryRef.current = category;

  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  useEffect(() => {
    if (expectedType !== "trade" || !tradeServerSeed) return;
    writeCategoryCache(`children:${tradeServerSeed.category.id}`, tradeServerSeed.tradeBootstrapChildren);
  }, [expectedType, tradeServerSeed]);

  const bootstrapFetchAbortRef = useRef<AbortController | null>(null);
  /** 시드 없이 부트스트랩만 맞춘 뒤에도 같은 슬러그면 쿼리 변경 시 전면 로딩으로 되돌아가지 않게 함 */
  const tradeResolvedSlugNormRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!slugOrId?.trim()) {
      if (expectedType === "trade") tradeResolvedSlugNormRef.current = null;
      setStatus("not_found");
      return;
    }

    const slugNorm = normalizeMarketSlugParam(slugOrId);

    const topic = (searchParamsRef.current.get("topic")?.trim() ?? "").normalize("NFC");
    const fsPad = searchParamsRef.current.get("fs")?.trim().toLowerCase() ?? "";
    const urlKey = buildMarketBootstrapQueryKey(
      slugOrId,
      topic,
      null,
      fsPad || null,
      null,
      null,
      null,
      null,
      { omitJobListFilters: true }
    );

    if (expectedType === "trade" && tradeServerSeed && tradeServerSeed.queryKey === urlKey) {
      tradeResolvedSlugNormRef.current = slugNorm;
      setCategory(tradeServerSeed.category);
      setTradeBootstrapChildren(tradeServerSeed.tradeBootstrapChildren);
      setTradeBootstrapChildrenForFilter(tradeServerSeed.tradeBootstrapChildrenForFilter);
      setTradeBootstrapFeed(tradeServerSeed.tradeBootstrapFeed ?? null);
      setStatus("found");
      return;
    }

    const softTradeResync =
      expectedType === "trade" &&
      tradeServerSeed != null &&
      tradeSeedMatchesMarketSlug(tradeServerSeed, slugOrId) &&
      tradeServerSeed.queryKey !== urlKey;

    const softTradeQueryOnly =
      expectedType === "trade" &&
      tradeServerSeed == null &&
      tradeResolvedSlugNormRef.current != null &&
      tradeResolvedSlugNormRef.current === slugNorm;

    const softShellKeepTradeChrome = softTradeResync || softTradeQueryOnly;

    bootstrapFetchAbortRef.current?.abort();
    const ac = new AbortController();
    bootstrapFetchAbortRef.current = ac;
    const signal = ac.signal;

    if (!softShellKeepTradeChrome) {
      if (expectedType === "trade") {
        tradeResolvedSlugNormRef.current = null;
      }
      setStatus("loading");
      setTradeBootstrapChildren(undefined);
      setTradeBootstrapChildrenForFilter(undefined);
      setTradeBootstrapFeed(undefined);
    }

    if (expectedType === "trade") {
      try {
        const fs = searchParamsRef.current.get("fs")?.trim().toLowerCase();
        const qs = new URLSearchParams();
        qs.set("q", slugOrId.trim());
        qs.set("includePosts", "1");
        if (topic) qs.set("topic", topic);
        if (fs === "popular" || fs === "pay_desc" || fs === "chat_desc" || fs === "near") {
          qs.set("fs", fs);
        }
        const res = await fetch(`/api/categories/market-bootstrap?${qs.toString()}`, {
          credentials: "include",
          cache: "no-store",
          signal,
        });
        if (signal.aborted) return;
        const j = (await res.json()) as {
          ok?: boolean;
          category?: Record<string, unknown>;
          children?: Record<string, unknown>[];
          childrenForFilter?: { id?: string; slug?: unknown }[];
          initialFeed?: {
            posts: PostWithMeta[];
            hasMore: boolean;
            feedKey: string;
            favoriteMap?: Record<string, boolean>;
          };
          error?: string;
        };
        if (res.ok && j.ok && j.category) {
          const c = toCategoryWithSettings(j.category as unknown as Parameters<typeof toCategoryWithSettings>[0]);
          if (c.type !== expectedType) {
            if (expectedType === "trade") tradeResolvedSlugNormRef.current = null;
            setStatus("redirect");
            router.replace(getCategoryHref(c));
            return;
          }
          const children = (j.children ?? []).map((row) => mapChildCategoryRow(row as unknown as TradeChildDbRow));
          writeCategoryCache(`children:${c.id}`, children);
          const childrenForFilter = (j.childrenForFilter ?? [])
            .map((row) => ({
              id: String(row?.id ?? ""),
              slug: typeof row?.slug === "string" ? row.slug : null,
            }))
            .filter((r) => r.id.length > 0);
          if (signal.aborted) return;
          tradeResolvedSlugNormRef.current = slugNorm;
          setCategory(c);
          setTradeBootstrapChildren(children);
          setTradeBootstrapChildrenForFilter(childrenForFilter);
          setTradeBootstrapFeed(j.initialFeed ?? null);
          setStatus("found");
          return;
        }
      } catch (e) {
        if (signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
        /* 폴백: 기존 클라이언트 조회 */
      }
    }

    if (signal.aborted) return;
    const c = await getCategoryBySlugOrId(slugOrId.trim());
    if (signal.aborted) return;
    if (!c) {
      if (expectedType === "trade") tradeResolvedSlugNormRef.current = null;
      setStatus("not_found");
      return;
    }
    if (c.type !== expectedType) {
      if (expectedType === "trade") tradeResolvedSlugNormRef.current = null;
      setStatus("redirect");
      router.replace(getCategoryHref(c));
      return;
    }
    if (expectedType === "trade") {
      tradeResolvedSlugNormRef.current = slugNorm;
    }
    setCategory(c);
    setTradeBootstrapChildren(undefined);
    setTradeBootstrapChildrenForFilter(undefined);
    setTradeBootstrapFeed(null);
    setStatus("found");
  }, [slugOrId, expectedType, router, tradeServerSeed]);

  useEffect(() => {
    void load();
    return () => bootstrapFetchAbortRef.current?.abort();
  }, [load, tradeMarketSearchSyncKey]);

  /** 거래(중고) 마켓: 메인 1단만 공통 헤더로 두고, 뒤로가기·카테고리 제목 서브헤더는 노출하지 않음 */
  const registerStickySubheader = expectedType !== "trade";

  useRegisterCategoryListStickyHeader(
    registerStickySubheader && (status === "loading" || status === "found"),
    backHref,
    status === "found" ? category : null,
    true,
  );

  if (status === "loading") {
    /** 거래 마켓: 전면 문구·중앙 로딩은 탭 덮어쓰기 애니메이션을 가림 → 배경만 유지 */
    if (expectedType === "trade") {
      return (
        <div className="min-h-screen bg-sam-app" aria-busy="true">
          <div className={`${APP_MAIN_GUTTER_X_CLASS} pt-0 pb-4`}>
            <div
              className="min-h-[min(42vh,360px)] rounded-sam-md bg-sam-surface-muted/35"
              aria-hidden
            />
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-[200px] flex items-center justify-center sam-text-body text-sam-muted">
        불러오는 중…
      </div>
    );
  }

  if (status === "not_found" || status === "redirect") {
    if (status === "not_found") {
      return (
        <div className={`${APP_MAIN_GUTTER_X_CLASS} py-8 text-center`}>
          <p className="sam-text-body font-medium text-sam-fg">카테고리를 찾을 수 없습니다.</p>
          <div className="mt-4 flex justify-center">
            <AppBackButton />
          </div>
        </div>
      );
    }
    return null;
  }

  if (!category) return null;

  /** 거래(type=trade): 스티키 1·2단 바로 아래 간격은 MarketCategoryFeed 토큰만 쓰고, 여기서 pt 를 두지 않음 */
  const tradeInnerY = expectedType === "trade" ? "pt-0 pb-4" : "py-4";

  return (
    <div className="min-h-screen bg-sam-app">
      <div className={`${APP_MAIN_GUTTER_X_CLASS} ${tradeInnerY}`}>
        {children(category, {
          tradeBootstrapChildren: expectedType === "trade" ? tradeBootstrapChildren : undefined,
          tradeBootstrapChildrenForFilter:
            expectedType === "trade" ? tradeBootstrapChildrenForFilter : undefined,
          tradeBootstrapFeed: expectedType === "trade" ? tradeBootstrapFeed : undefined,
        })}
      </div>
    </div>
  );
}
