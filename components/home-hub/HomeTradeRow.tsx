"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getPostsForHome } from "@/lib/posts/getPostsForHome";
import type { PostWithMeta } from "@/lib/posts/schema";
import { marketplaceFeedLocationExtrasFromUrlOrSession } from "@/lib/trade/marketplace/client-location-fetch";
import { formatRelativeTimeAgo } from "@/lib/i18n/format-relative-time";
import type { AppLanguageCode } from "@/lib/i18n/config";
import { HOME_TRADES_RECENT_DAYS, type HomeTradesConfig } from "@/lib/home/home-layout-contract";
import { homeCatalogName, type HomeTradeCategory } from "@/lib/home/home-catalog-types";
import { keepSessionPick, rotateUnseenFirst } from "@/lib/home/home-rotation";
import type { HomeRotationCtl } from "@/components/home-hub/use-home-rotation";
import { HomeSectionHead } from "@/components/home-hub/HomeSectionHead";

const DAY_MS = 24 * 60 * 60 * 1000;

function peso(n: number | null): string {
  if (n == null) return "";
  return `₱${n.toLocaleString("en-US")}`;
}

/**
 * 「방금 올라온 거래」 — 사진 좌우 넘김.
 * 후보 = 판매중·예약중 거래글(거래완료·숨김 제외), 최근 7일 글 먼저 · 모자라면 오래된 글로 채움 ·
 * 지역 = 거래 탭에서 이번 실행에 고른 지역(없으면 전체 지역) ·
 * 새로고침·재접속마다 새로 받아 한 번도 안 보인 글 먼저(최신순), 이미 보인 글은 오래전에 보인 것부터 뒤에.
 */
export function HomeTradeRow({
  config,
  title,
  tradeCategories,
  rot,
  refreshSeq,
}: {
  config: HomeTradesConfig;
  title: string;
  tradeCategories: HomeTradeCategory[];
  rot: HomeRotationCtl | null;
  refreshSeq: number;
}) {
  const { t, language } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<PostWithMeta[] | null>(null);
  const mode = rot?.mode;
  const seq = rot?.seq;

  useEffect(() => {
    if (!rot) return;
    let alive = true;
    void (async () => {
      const loc = marketplaceFeedLocationExtrasFromUrlOrSession("") ?? { locationAll: true };
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
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 교체는 mode·seq(새로고침)·구성 기준
  }, [mode, seq, config.count, config.sort, config.tradeCategoryId]);

  const catName = (id: string | null | undefined) => {
    const c = tradeCategories.find((x) => x.id === id);
    return c ? homeCatalogName(c, language) : "";
  };

  return (
    <section className="mt-3 bg-white pb-5 pt-[18px]" data-home-trades>
      <HomeSectionHead title={title} moreLabel={t("home_more")} onMore={() => router.push("/market")} />
      {items == null ? (
        <div className="flex gap-2.5 overflow-hidden px-4">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[118px] w-[118px] shrink-0 animate-pulse rounded-ui-rect bg-[#eef1ee]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="px-[18px] text-[13.5px] text-[#767676]">{t("home_trades_empty")}</p>
      ) : (
        <div className="flex gap-2.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((p) => {
            const img = p.thumbnail_url || p.images?.[0] || "";
            const cat = catName((p as { trade_category_id?: string | null }).trade_category_id ?? p.category_id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => router.push(`/post/${encodeURIComponent(p.id)}`)}
                className="w-[118px] shrink-0 text-left active:opacity-80"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 거래글 사진 */}
                <img
                  src={img}
                  alt=""
                  className="rounded-ui-rect bg-[#eef1ee] object-cover"
                  /* 앱 전역 img height:auto 보다 앞서도록 크기는 인라인 (정사각 고정) */
                  style={{ width: 118, height: 118 }}
                />
                <span className="mt-1.5 block truncate text-[14px] text-[#222]">{p.title}</span>
                <span className="block text-[15px] font-bold text-[#141a16]">{peso(p.price)}</span>
                <span className="block truncate text-[12px] text-[#999]">
                  {[cat, formatRelativeTimeAgo(p.created_at, language as AppLanguageCode)].filter(Boolean).join(" · ")}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
