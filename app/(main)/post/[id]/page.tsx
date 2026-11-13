import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { getOptionalAuthenticatedUserId } from "@/lib/auth/api-session";
import { withTimeout } from "@/lib/async/with-timeout";
import { resolvePostsReadClientsForServerComponent } from "@/lib/supabase/resolve-posts-read-clients";
/** RSC 상세: 본문·프로필은 `getItemDetailPageData` 1차 블록, related 는 Suspense 스트림(`PostDetailRelatedDeferredLoader`). */
import { getItemDetailPageData } from "@/services/trade/trade-detail.service";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { recordTradeRecentView } from "@/lib/mypage/trade-recent-views.server";
import { PostDetailConfigError, PostDetailPageClient } from "./PostDetailPageClient";
import { PostDetailRelatedDeferredLoader } from "./post-detail-related-deferred";
import { TradePostUnavailable } from "@/components/trade/TradePostUnavailable";
import { RouteLoadingInline } from "@/components/i18n/RouteLoadingInline";
import { APP_LANGUAGE_COOKIE } from "@/lib/i18n/config";
import { resolveServerInitialLanguage } from "@/lib/i18n/language-preference";
import { safeTranslate } from "@/lib/i18n/safe-translate";
import { buildTradePostPageMetadata, buildUnavailableSharePageMetadata } from "@/lib/share/trade-post-metadata";

/** 무한 스켈레톤 방지 — 상세 부트스트랩 상한 (운영 DB 지연 시에도 UI가 멈추지 않게) */
const TRADE_DETAIL_LOAD_BUDGET_MS = 28_000;

/**
 * 상세 데이터 1회 로드 — 링크 미리보기(generateMetadata)와 본문이 같은 요청에서 같은 결과를 쓴다
 * (React `cache` · 통합 공유 S4: 미리보기 때문에 DB 조회를 늘리지 않는다).
 */
const loadPostDetailForRequest = cache(async (itemId: string) => {
  const [clients, viewerId] = await Promise.all([
    resolvePostsReadClientsForServerComponent(),
    getOptionalAuthenticatedUserId(),
  ]);
  if (!clients) return { configError: true as const, viewerId, bundle: null };
  try {
    const bundle = await withTimeout(
      getItemDetailPageData(clients, { itemId, viewerUserId: viewerId }),
      TRADE_DETAIL_LOAD_BUDGET_MS,
      "trade_detail_load_timeout"
    );
    return { configError: false as const, viewerId, bundle };
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("[post/[id]] getItemDetailPageData", e);
    throw e;
  }
});

/** MARKET 상품 링크 미리보기(OG) — 공개 필드만, 숨김·삭제는 검색 제외 (통합 공유 S4) */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const trimmed = typeof id === "string" ? id.trim() : "";
  if (!trimmed) return {};
  let loaded: Awaited<ReturnType<typeof loadPostDetailForRequest>>;
  try {
    loaded = await loadPostDetailForRequest(trimmed);
  } catch {
    return {};
  }
  if (loaded.configError) return {};
  if (!loaded.bundle) return buildUnavailableSharePageMetadata();
  const item = loaded.bundle.item;
  if (item.type === "community") return {};
  const [h, cookieStore] = await Promise.all([headers(), cookies()]);
  const lang = resolveServerInitialLanguage({
    cookieValue: cookieStore.get(APP_LANGUAGE_COOKIE)?.value,
    acceptLanguage: h.get("accept-language"),
  });
  return buildTradePostPageMetadata(item, { freeShare: safeTranslate(lang, "trade_detail_free_share") });
}

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t0 = performance.now();
  const { id } = await params;
  const trimmed = typeof id === "string" ? id.trim() : "";
  if (!trimmed) {
    notFound();
  }

  const loaded = await loadPostDetailForRequest(trimmed);
  if (loaded.configError) {
    return <PostDetailConfigError />;
  }
  const { bundle, viewerId } = loaded;

  if (!bundle) {
    /** 숨김·삭제·없는 거래 글 — 404 대신 「볼 수 없는 글이에요」(Owner 2026-10-28 승인) */
    return <TradePostUnavailable />;
  }

  // 최근 본 상품(M3) — 응답 후 기록해 상세 표시를 늦추지 않는다
  if (viewerId && bundle.item.type !== "community") {
    const postId = bundle.item.id;
    after(async () => {
      const sb = tryCreateSupabaseServiceClient();
      if (sb) await recordTradeRecentView(sb, viewerId, postId);
    });
  }

  return (
    <Suspense fallback={null}>
      <PostDetailPageClient
        key={bundle.item.id}
        initialBundle={bundle}
        initialRouteTotalMs={Math.round(performance.now() - t0)}
      >
        {bundle.item.type !== "community" ? (
          <Suspense
            fallback={
              <div className="border-t border-sam-border px-4 py-6 sam-text-body-secondary text-sam-muted">
                <RouteLoadingInline messageKey="post_detail_related_loading" />
              </div>
            }
          >
            <PostDetailRelatedDeferredLoader
              viewerUserId={viewerId}
              preloadedItem={bundle.item}
            />
          </Suspense>
        ) : null}
      </PostDetailPageClient>
    </Suspense>
  );
}
