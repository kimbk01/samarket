"use client";

import { formatPrice } from "@/lib/utils/format";
import { untilLaunchDestinationSettled } from "@/lib/startup/launch-push-destination-pending";
import { resolveTradePostCurrency } from "@/lib/trade/trade-price-currency";
import { useEffect, useState } from "react";
import { PostFavoriteButton } from "@/components/favorites/PostFavoriteButton";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getPostsForHome } from "@/lib/posts/getPostsForHome";
import { useHubDataRevisitGate } from "@/lib/http/hub-data-freshness";
import type { PostWithMeta } from "@/lib/posts/schema";
import { marketplaceFeedLocationExtrasFromUrlOrSession } from "@/lib/trade/marketplace/client-location-fetch";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { HOME_TRADES_RECENT_DAYS, type HomeTradesConfig } from "@/lib/home/home-layout-contract";
import { homeCatalogName, type HomeTradeCategory } from "@/lib/home/home-catalog-types";
import { keepSessionPick, rotateUnseenFirst } from "@/lib/home/home-rotation";
import { homeTradeCardImageSrc, prefetchHomeFeedImages } from "@/lib/home/home-feed-image";
import type { HomeRotationCtl } from "@/components/home-hub/use-home-rotation";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 가격 = 글 통화(meta.currency, 한국 주소 지원 3단계) — 없으면 ₱ (감사 2026-11-10: ₩ 글이 ₱ 로 보임) */
function tradePrice(n: number | null, meta: unknown): string {
  if (n == null) return "";
  return formatPrice(n, resolveTradePostCurrency(meta, "PHP"));
}

/**
 * 홈 피드의 마켓 상품 (홈 시안 v4 「지금 우리 동네」) — 데이터는 옛 「방금 올라온 거래」와 같다.
 * 후보 = 판매중·예약중 거래글(거래완료·숨김 제외), 최근 7일 글 먼저 · 모자라면 오래된 글로 채움 ·
 * 지역 = 거래 탭에서 이번 실행에 고른 지역(없으면 전체 지역) ·
 * 새로고침·재접속마다 새로 받아 한 번도 안 보인 글 먼저(최신순), 이미 보인 글은 오래전에 보인 것부터 뒤에.
 */
export function useHomeTrades({
  config,
  rot,
  refreshSeq,
}: {
  config: HomeTradesConfig;
  rot: HomeRotationCtl | null;
  refreshSeq: number;
}): {
  items: PostWithMeta[] | null;
  failed: boolean;
  retry: () => void;
  /** 찜 상태 (회원 · 서버 favoriteMap) — 수정안 #6 */
  favorites: Record<string, boolean>;
  setFavorite: (postId: string, on: boolean) => void;
} {
  const [items, setItems] = useState<PostWithMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [favorites, setFavorites] = useState<Record<string, boolean>>({});
  const [retryKey, setRetryKey] = useState(0);
  const mode = rot?.mode;
  const seq = rot?.seq;

  /** D1 §4 — 허브 화면 보관대에서 다시 보일 때 같은 조건(교체 상태·구성·지역)·60초 안이면 다시 받지 않음 */
  const revisitGate = useHubDataRevisitGate();

  useEffect(() => {
    if (!rot) return;
    const loc = marketplaceFeedLocationExtrasFromUrlOrSession("") ?? { locationAll: true };
    const gateKey = [
      mode,
      seq,
      config.count,
      config.sort,
      config.tradeCategoryId ?? "",
      retryKey,
      loc.locationAll === true || !loc.lguCityId ? "all" : `${loc.lguCityId}:${loc.radiusKm ?? ""}`,
    ].join("|");
    if (revisitGate.isFresh(gateKey)) return;
    let alive = true;
    void (async () => {
      // 설계 §24 D1-웹: 알림으로 켠 실행이면 덮개가 걷힐 때까지(목적지 그림) 홈 전용 요청을 미룬다 · 그 밖에는 바로
      await untilLaunchDestinationSettled();
      if (!alive) return;
      const r = await getPostsForHome({
        type: "trade",
        sort: config.sort,
        tradeMarketParentId: config.tradeCategoryId || null,
        locationAll: loc.locationAll === true || !loc.lguCityId,
        lguCityId: loc.lguCityId ?? null,
        radiusKm: loc.radiusKm ?? null,
        ...(refreshSeq > 0 ? { bypassClientCache: true } : {}),
      }).catch(() => null);
      if (!alive) return;
      // 실패는 「거래 없음」이 아니라 오류로 보이고, 교체 기록에 넣지 않는다 (감사 E8)
      if (!r || r.failed) {
        setFailed(true);
        return;
      }
      setFailed(false);
      // 최근 7일 글 먼저, 모자라면 그보다 오래된 글로 채운다 (각각 받은 순서 = 최신순)
      const since = Date.now() - HOME_TRADES_RECENT_DAYS * DAY_MS;
      const listed = (r?.posts ?? []).filter(
        (p) => (p.status === "active" || p.status === "reserved") && Boolean(p.thumbnail_url || p.images?.[0])
      );
      const recent = listed.filter((p) => Date.parse(p.created_at) >= since);
      const pool = recent.length >= config.count ? recent : [...recent, ...listed.filter((p) => !recent.includes(p))];
      const idOf = (p: PostWithMeta) => p.id;
      const picked =
        rot.mode === "session"
          ? keepSessionPick(pool, idOf, rot.session.trades, config.count)
          : rotateUnseenFirst(pool, idOf, rot.history.log.trades, config.count);
      rot.commit({ trades: picked.map(idOf) });
      setItems(picked);
      setFavorites(r.favoriteMap ?? {});
      /**
       * 설계 D4-2: 다음 실행이 「안 본 글 먼저」로 고를 앞 2개(이번에 고른 글을 본 것으로 친 순서)의 큰 카드 그림을 미리 받아 둔다.
       * 다음 실행의 후보가 바뀌면(새 글) 맞지 않을 수 있다 — 빈도만 줄인다.
       */
      if (rot.mode !== "session") {
        const nextPick = rotateUnseenFirst(pool, idOf, [...rot.history.log.trades, ...picked.map(idOf)], 2);
        prefetchHomeFeedImages(
          nextPick
            .map((p) => p.thumbnail_url || p.images?.[0] || "")
            .filter(Boolean)
            .map((u) => homeTradeCardImageSrc(u))
        );
      }
      revisitGate.markLoaded(gateKey);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 교체는 mode·seq(새로고침)·구성 기준
  }, [mode, seq, config.count, config.sort, config.tradeCategoryId, retryKey]);

  return {
    items,
    failed,
    retry: () => {
      setFailed(false);
      setItems(null);
      setRetryKey((n) => n + 1);
    },
    favorites,
    setFavorite: (postId, on) => setFavorites((m) => ({ ...m, [postId]: on })),
  };
}

/**
 * 마켓 상품 카드 — 시안 R3 (계획서 C): 사진 **정사각**(카드 폭 그대로, 잘라내기 확대 없음) · 제목 · 가격 · 분류·시각.
 * 크기는 줄(`.home-trade-row`)이 정한다 — 휴대폰 144px 가로 넘김 · 태블릿 5열 · PC 6열. 누르면 상품 상세.
 */
export function HomeTradeShelfCard({
  post,
  tradeCategories,
  favorite,
}: {
  post: PostWithMeta;
  tradeCategories: HomeTradeCategory[];
  /** 회원만 — 사진 오른쪽 아래 찜(♡) · 기존 관심목록 버튼(수정안 #6) */
  favorite?: { on: boolean; onChange: (on: boolean) => void };
}) {
  const { language } = useI18n();
  const router = useRouter();
  /** 수정안 #12 — 목록 화면과 같은 정사각 썸네일 (단일 기준) */
  const img = homeTradeCardImageSrc(post.thumbnail_url || post.images?.[0] || "");
  const catId = (post as { trade_category_id?: string | null }).trade_category_id ?? post.category_id;
  const cat = tradeCategories.find((x) => x.id === catId);
  const meta = [cat ? homeCatalogName(cat, language) : "", formatRelativeTimeAgo(post.created_at, language as AppLanguageCode)]
    .filter(Boolean)
    .join(" · ");
  const href = `/post/${encodeURIComponent(post.id)}`;
  // 카드 안에 찜 버튼(버튼)이 있어 카드는 button 이 아닌 role="link"
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter") router.push(href);
      }}
      className="home-trade-card"
      data-home-feed-trade={post.id}
    >
      <span className="home-sq">
        {/* eslint-disable-next-line @next/next/no-img-element -- 거래글 사진 */}
        <img src={img} alt="" className="home-sq-img" />
        {favorite ? (
          <span className="home-trade-fav">
            <PostFavoriteButton
              postId={post.id}
              authorUserId={post.author_id}
              favorited={favorite.on}
              onFavoriteChange={favorite.onChange}
              iconClassName="h-[17px] w-[17px]"
            />
          </span>
        ) : null}
      </span>
      <span className="home-trade-title">{post.title}</span>
      <span className="home-trade-price">{tradePrice(post.price, (post as { meta?: unknown }).meta)}</span>
      {meta ? <span className="home-trade-meta">{meta}</span> : null}
    </div>
  );
}
