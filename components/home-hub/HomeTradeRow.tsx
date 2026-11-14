"use client";

import { formatPrice } from "@/lib/utils/format";
import { resolveTradePostCurrency } from "@/lib/trade/trade-price-currency";
import { useEffect, useState } from "react";
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
}): { items: PostWithMeta[] | null; failed: boolean; retry: () => void } {
  const [items, setItems] = useState<PostWithMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
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
  };
}

/** 마켓 상품 카드 — 큰 사진 1장(big) 또는 2열 중 한 칸(pair). 누르면 상품 상세 */
export function HomeTradeFeedCard({
  post,
  variant,
  tradeCategories,
}: {
  post: PostWithMeta;
  variant: "big" | "pair";
  tradeCategories: HomeTradeCategory[];
}) {
  const { language } = useI18n();
  const router = useRouter();
  const img = post.thumbnail_url || post.images?.[0] || "";
  const catId = (post as { trade_category_id?: string | null }).trade_category_id ?? post.category_id;
  const cat = tradeCategories.find((x) => x.id === catId);
  const meta = [cat ? homeCatalogName(cat, language) : "", formatRelativeTimeAgo(post.created_at, language as AppLanguageCode)]
    .filter(Boolean)
    .join(" · ");
  const big = variant === "big";
  return (
    <button
      type="button"
      onClick={() => router.push(`/post/${encodeURIComponent(post.id)}`)}
      className="block w-full min-w-0 text-left active:opacity-80"
      data-home-feed-trade={post.id}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 거래글 사진 */}
      <img
        src={img}
        alt=""
        className="w-full rounded-ui-rect bg-[#eef1ee] object-cover"
        /* 앱 전역 img height:auto 보다 앞서도록 높이는 인라인 */
        style={{ height: big ? 220 : 140 }}
      />
      <span className={`mt-2 block font-extrabold text-[#141a16] ${big ? "text-[18px]" : "text-[15px]"}`}>
        {tradePrice(post.price, (post as { meta?: unknown }).meta)}
      </span>
      <span className="block truncate text-[14px] text-[#222]">{post.title}</span>
      {meta ? <span className="block truncate text-[12px] text-[#999]">{meta}</span> : null}
    </button>
  );
}
