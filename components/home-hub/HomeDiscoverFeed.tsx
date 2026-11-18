"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { HOME_MENU_CATALOG, type HomeLayoutConfig } from "@/lib/home/home-layout-contract";
import { homeCatalogName, type HomeTradeCategory } from "@/lib/home/home-catalog-types";
import type { HomeRotationCtl } from "@/components/home-hub/use-home-rotation";
import { HOME_SHELF_BRAND_MARK, HomeShelfHead } from "@/components/home-hub/HomeSectionHead";
import { HomeLoadError } from "@/components/home-hub/HomeLoadError";
import { HomeTradeShelfCard, useHomeTrades } from "@/components/home-hub/HomeTradeRow";
import { HomePostMagCard, useHomePosts } from "@/components/home-hub/HomePostsSection";
import { HomeStoresSection } from "@/components/home-hub/HomeStoresSection";

/** 마켓 줄 분류 알약 최대 수 (전체 제외) */
const HOME_TRADE_CHIPS_MAX = 8;

/**
 * 홈 아래 — 시안 R3 서비스별 줄 (Owner 「계획대로 진행」 2026-11-18 · 계획서 C·D·E, 이전 v4 「지금 우리 동네」 섞인 피드 대체).
 * ① 방금 올라온 마켓 상품(분류 알약 · 정사각 사진) ② 지금 주문하는 DIPICK(매장 카드 격자) ③ 정보 공유 인기·새 글(매거진 카드).
 * 구성(개수·정렬·카테고리·매장 고르기)은 어드민 「홈 구성」의 마켓·정보 공유·DIPICK 설정 그대로. 홈 「피드」 칸 보이기 = 세 줄 모두.
 */
export function HomeDiscoverFeed({
  layout,
  tradeCategories,
  isMember,
  membershipChecking,
  rot,
  refreshSeq,
}: {
  layout: HomeLayoutConfig;
  tradeCategories: HomeTradeCategory[];
  isMember: boolean;
  membershipChecking: boolean;
  rot: HomeRotationCtl | null;
  refreshSeq: number;
}) {
  const { t, language } = useI18n();
  const router = useRouter();
  /** 마켓 분류 알약 — 빈 값 = 어드민 기본 카테고리(「전체」) */
  const [chip, setChip] = useState<string>("");
  const tradeConfig = chip ? { ...layout.trades, tradeCategoryId: chip } : layout.trades;
  const trades = useHomeTrades({ config: tradeConfig, rot, refreshSeq });
  const posts = useHomePosts({ config: layout.posts, refreshSeq });
  const popular = layout.posts.sort === "popular";
  /** 어드민이 마켓 카테고리를 하나로 고정했으면 알약을 보이지 않는다 */
  const chips = layout.trades.tradeCategoryId ? [] : tradeCategories.slice(0, HOME_TRADE_CHIPS_MAX);

  return (
    <div data-home-feed>
      {/* ① 마켓 */}
      <section className="home-shelf" data-home-shelf="trade">
        <HomeShelfHead
          title={t("home_shelf_trade_title", { brand: HOME_SHELF_BRAND_MARK })}
          brand={t(HOME_MENU_CATALOG.trade.labelKey)}
          sub={t("home_shelf_trade_sub")}
          allLabel={t("home_see_all")}
          onAll={() => router.push("/market")}
        />
        {chips.length > 0 ? (
          <div className="home-chips" role="tablist">
            {[{ id: "", label: t("home_all") }, ...chips.map((c) => ({ id: c.id, label: homeCatalogName(c, language) }))].map(
              (c) => (
                <button
                  key={c.id || "all"}
                  type="button"
                  role="tab"
                  aria-selected={chip === c.id}
                  onClick={() => setChip(c.id)}
                  className={`home-chip${chip === c.id ? " is-on" : ""}`}
                >
                  {c.label}
                </button>
              )
            )}
          </div>
        ) : null}
        {trades.failed ? (
          <HomeLoadError onRetry={trades.retry} />
        ) : trades.items == null ? (
          <div className="home-trade-row" aria-busy="true">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <span key={i} className="home-trade-card">
                <span className="home-sq home-skel" />
              </span>
            ))}
          </div>
        ) : trades.items.length === 0 ? (
          <p className="home-shelf-empty">{t("home_shelf_trade_empty")}</p>
        ) : (
          <div className="home-trade-row">
            {trades.items.map((p) => (
              <HomeTradeShelfCard key={p.id} post={p} tradeCategories={tradeCategories} />
            ))}
          </div>
        )}
      </section>

      {/* ② DIPICK — 회원 확인 중에는 그리지 않는다(비회원 안내가 먼저 깜빡이지 않게 · 현행 규칙) */}
      {membershipChecking ? null : (
        <HomeStoresSection config={layout.stores} isMember={isMember} rot={rot} refreshSeq={refreshSeq} />
      )}

      {/* ③ 정보 공유 */}
      <section className="home-shelf" data-home-shelf="posts">
        <HomeShelfHead
          title={t(popular ? "home_shelf_posts_title_popular" : "home_shelf_posts_title_latest", {
            brand: HOME_SHELF_BRAND_MARK,
          })}
          brand={t(HOME_MENU_CATALOG.philife.labelKey)}
          sub={t(popular ? "home_shelf_posts_sub_popular" : "home_shelf_posts_sub_latest")}
          allLabel={t("home_see_all")}
          onAll={() => router.push("/philife")}
        />
        {posts.failed ? (
          <HomeLoadError onRetry={posts.retry} />
        ) : posts.posts == null ? (
          <div className="home-mag" aria-busy="true">
            {[0, 1].map((i) => (
              <span key={i} className="home-mag-card home-skel" style={{ height: 112 }} />
            ))}
          </div>
        ) : posts.posts.length === 0 ? (
          <p className="home-shelf-empty">{t("home_feed_empty")}</p>
        ) : (
          <div className="home-mag">
            {posts.posts.map((p) => (
              <HomePostMagCard key={p.id} post={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
