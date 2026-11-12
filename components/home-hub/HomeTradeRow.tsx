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
import { HomeSectionHead } from "@/components/home-hub/HomeSectionHead";
import { HomeLoadError } from "@/components/home-hub/HomeLoadError";
import { useHubActive } from "@/lib/layout/hub-active-context";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 가격 = 글 통화(meta.currency, 한국 주소 지원 3단계) — 없으면 ₱ (감사 2026-11-10: ₩ 글이 ₱ 로 보임) */
function tradePrice(n: number | null, meta: unknown): string {
  if (n == null) return "";
  return formatPrice(n, resolveTradePostCurrency(meta, "PHP"));
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
  const hubActive = useHubActive();
  const { t, language } = useI18n();
  const router = useRouter();
  const [items, setItems] = useState<PostWithMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const mode = rot?.mode;
  const seq = rot?.seq;

  /** D1 §4 — 허브 화면 보관대에서 다시 보일 때 같은 조건(교체 상태·구성·지역)·60초 안이면 다시 받지 않음 */
  const revisitGate = useHubDataRevisitGate();

  useEffect(() => {
    if (!hubActive) return;
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
  }, [hubActive, mode, seq, config.count, config.sort, config.tradeCategoryId, retryKey]);

  const catName = (id: string | null | undefined) => {
    const c = tradeCategories.find((x) => x.id === id);
    return c ? homeCatalogName(c, language) : "";
  };

  return (
    <section className="mt-3 bg-white pb-5 pt-[18px]" data-home-trades>
      <HomeSectionHead title={title} />
      {failed ? (
        <HomeLoadError
          onRetry={() => {
            setFailed(false);
            setItems(null);
            setRetryKey((n) => n + 1);
          }}
        />
      ) : items == null ? (
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
                <span className="block text-[15px] font-bold text-[#141a16]">{tradePrice(p.price, (p as { meta?: unknown }).meta)}</span>
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
