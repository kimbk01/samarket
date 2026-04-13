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

type ExpectedType = CategoryType;

interface CategoryListLayoutProps {
  /** URL 세그먼트 (id 또는 slug) */
  slugOrId: string;
  /** 이 페이지가 기대하는 카테고리 type (불일치 시 올바른 경로로 리다이렉트) */
  expectedType: ExpectedType;
  /** 뒤로가기 링크 (미주입 시 history.back) */
  backHref?: string;
  children: (
    category: CategoryWithSettings,
    extra?: {
      tradeBootstrapChildren?: CategoryWithSettings[];
      /** 피드 SQL 필터용 직계 하위 id/slug 전체(bootstrap) — 칩 목록과 분리 */
      tradeBootstrapChildrenForFilter?: { id: string; slug: string | null }[];
      tradeBootstrapFeed?: { posts: PostWithMeta[]; hasMore: boolean; feedKey: string } | null;
    }
  ) => React.ReactNode;
}

export function CategoryListLayout({
  slugOrId,
  expectedType,
  backHref,
  children,
}: CategoryListLayoutProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchParamsRef = useRef(searchParams);
  const [category, setCategory] = useState<CategoryWithSettings | null>(null);
  const [tradeBootstrapChildren, setTradeBootstrapChildren] = useState<CategoryWithSettings[] | undefined>(
    undefined
  );
  const [tradeBootstrapFeed, setTradeBootstrapFeed] = useState<
    { posts: PostWithMeta[]; hasMore: boolean; feedKey: string } | null | undefined
  >(undefined);
  const [tradeBootstrapChildrenForFilter, setTradeBootstrapChildrenForFilter] = useState<
    { id: string; slug: string | null }[] | undefined
  >(undefined);
  const [status, setStatus] = useState<"loading" | "found" | "not_found" | "redirect">("loading");

  useEffect(() => {
    searchParamsRef.current = searchParams;
  }, [searchParams]);

  const load = useCallback(async () => {
    if (!slugOrId?.trim()) {
      setStatus("not_found");
      return;
    }
    setStatus("loading");
    setTradeBootstrapChildren(undefined);
    setTradeBootstrapChildrenForFilter(undefined);
    setTradeBootstrapFeed(undefined);

    if (expectedType === "trade") {
      try {
        const topic = (searchParamsRef.current.get("topic")?.trim() ?? "").normalize("NFC");
        const jk = searchParamsRef.current.get("jk")?.trim().toLowerCase();
        const qs = new URLSearchParams();
        qs.set("q", slugOrId.trim());
        qs.set("includePosts", "1");
        if (topic) qs.set("topic", topic);
        if (jk === "work" || jk === "hire") qs.set("jk", jk);
        const res = await fetch(`/api/categories/market-bootstrap?${qs.toString()}`, {
          credentials: "include",
          cache: "no-store",
        });
        const j = (await res.json()) as {
          ok?: boolean;
          category?: Record<string, unknown>;
          children?: Record<string, unknown>[];
          childrenForFilter?: { id?: string; slug?: unknown }[];
          initialFeed?: { posts: PostWithMeta[]; hasMore: boolean; feedKey: string };
          error?: string;
        };
        if (res.ok && j.ok && j.category) {
          const c = toCategoryWithSettings(j.category as unknown as Parameters<typeof toCategoryWithSettings>[0]);
          if (c.type !== expectedType) {
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
          setCategory(c);
          setTradeBootstrapChildren(children);
          setTradeBootstrapChildrenForFilter(childrenForFilter);
          setTradeBootstrapFeed(j.initialFeed ?? null);
          setStatus("found");
          return;
        }
      } catch {
        /* 폴백: 기존 클라이언트 조회 */
      }
    }

    const c = await getCategoryBySlugOrId(slugOrId.trim());
    if (!c) {
      setStatus("not_found");
      return;
    }
    if (c.type !== expectedType) {
      setStatus("redirect");
      router.replace(getCategoryHref(c));
      return;
    }
    setCategory(c);
    setTradeBootstrapChildren(undefined);
    setTradeBootstrapChildrenForFilter(undefined);
    setTradeBootstrapFeed(null);
    setStatus("found");
  }, [slugOrId, expectedType, router]);

  useEffect(() => {
    load();
  }, [load]);

  /** 거래(중고) 마켓: 메인 1단만 공통 헤더로 두고, 뒤로가기·카테고리 제목 서브헤더는 노출하지 않음 */
  const registerStickySubheader = expectedType !== "trade";

  useRegisterCategoryListStickyHeader(
    registerStickySubheader && (status === "loading" || status === "found"),
    backHref,
    status === "found" ? category : null,
    true,
  );

  if (status === "loading") {
    return (
      <div className="min-h-[200px] flex items-center justify-center text-[14px] text-sam-muted">
        불러오는 중…
      </div>
    );
  }

  if (status === "not_found" || status === "redirect") {
    if (status === "not_found") {
      return (
        <div className={`${APP_MAIN_GUTTER_X_CLASS} py-8 text-center`}>
          <p className="text-[15px] font-medium text-sam-fg">카테고리를 찾을 수 없습니다.</p>
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
