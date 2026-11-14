"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { ServiceBrandIcon } from "@/components/brand/ServiceBrandIcon";
import { MoimCard } from "@/components/moim/MoimCard";
import { moimApi } from "@/lib/moim/moim-client-api";
import type { MoimCardDto } from "@/lib/moim/moim-api-types";
import type { HomeLayoutConfig } from "@/lib/home/home-layout-contract";
import type { HomeTradeCategory } from "@/lib/home/home-catalog-types";
import type { DibayServiceBrandId } from "@/lib/brand/dibay-service-brand";
import type { MessageKey } from "@/lib/i18n/message-key";
import type { HomeRotationCtl } from "@/components/home-hub/use-home-rotation";
import { HomeSectionHead } from "@/components/home-hub/HomeSectionHead";
import { HomeLoadError } from "@/components/home-hub/HomeLoadError";
import { HomeTradeFeedCard, useHomeTrades } from "@/components/home-hub/HomeTradeRow";
import { HomePostFeedCard, useHomePosts } from "@/components/home-hub/HomePostsSection";
import { HomeStoresSection } from "@/components/home-hub/HomeStoresSection";

/** 피드 카드 왼쪽 위 서비스 표시 = 누르면 갈 곳 (마켓·정보 공유·DIPICK·모임) */
function DomainTag({ brand, labelKey }: { brand: DibayServiceBrandId; labelKey: MessageKey }) {
  const { t } = useI18n();
  return (
    <span className="mb-2 inline-flex items-center gap-1 rounded-[3px] bg-sam-primary-soft px-1.5 py-0.5 text-[11px] font-bold text-sam-primary">
      <ServiceBrandIcon brand={brand} className="h-3 w-3" />
      {t(labelKey)}
    </span>
  );
}

function FeedItem({ children, first, data }: { children: ReactNode; first: boolean; data?: string }) {
  return (
    <div className={`bg-white px-4 py-3.5 ${first ? "" : "mt-2"}`} data-home-feed-item={data}>
      {children}
    </div>
  );
}

/** 우리 동네 모임 (대표 주소 시/군 · 모임 탭과 같은 조회) — 주소가 없으면(비로그인 포함) 빈 목록 */
function useHomeMoims(refreshSeq: number): MoimCardDto[] {
  const [items, setItems] = useState<MoimCardDto[]>([]);
  useEffect(() => {
    let alive = true;
    void moimApi.listLocal({}).then((r) => {
      if (alive) setItems(r.ok ? r.items.slice(0, 2) : []);
    });
    return () => {
      alive = false;
    };
  }, [refreshSeq]);
  return items;
}

/**
 * 「지금 우리 동네」 — 홈 시안 v4 (Owner 「이 시안으로 진행」 2026-11-14). 칸 제목·탭 없이 서비스별 공개 최신 콘텐츠를 섞어 이어 보인다
 * (당근 동네생활·Grab Discover 형). 섞는 순서는 고정(개인화 없음):
 * 마켓 큰 카드 → 정보 공유 → DIPICK 매장(배달 탭과 같은 판정·비로그인 = 기존 로그인 안내 S-07) → 마켓 2열 → 정보 공유 → 모임 → 나머지.
 * 구성(개수·정렬·카테고리·매장 고르기)은 어드민 「홈 구성」의 마켓·정보 공유·DIPICK 설정 그대로.
 */
export function HomeDiscoverFeed({
  layout,
  title,
  tradeCategories,
  isMember,
  membershipChecking,
  rot,
  refreshSeq,
}: {
  layout: HomeLayoutConfig;
  title: string;
  tradeCategories: HomeTradeCategory[];
  isMember: boolean;
  membershipChecking: boolean;
  rot: HomeRotationCtl | null;
  refreshSeq: number;
}) {
  const { t } = useI18n();
  const trades = useHomeTrades({ config: layout.trades, rot, refreshSeq });
  const posts = useHomePosts({ config: layout.posts, refreshSeq });
  const moims = useHomeMoims(refreshSeq);

  const loading = trades.items == null && posts.posts == null && !trades.failed && !posts.failed;
  const bothFailed = trades.failed && posts.failed;
  const tradeList = trades.items ?? [];
  const postList = posts.posts ?? [];

  const blocks: ReactNode[] = [];
  const push = (key: string, node: ReactNode) => blocks.push(<FeedItem key={key} first={blocks.length === 0} data={key}>{node}</FeedItem>);
  const trade = (i: number) => tradeList[i];
  const post = (i: number) => postList[i];

  if (trade(0)) push(`t-${trade(0)!.id}`, <><DomainTag brand="MARKET" labelKey="nav_bottom_trade" /><HomeTradeFeedCard post={trade(0)!} variant="big" tradeCategories={tradeCategories} /></>);
  if (post(0)) push(`p-${post(0)!.id}`, <><DomainTag brand="FEED" labelKey="nav_community_switch_info" /><HomePostFeedCard post={post(0)!} /></>);
  const storesBlock = membershipChecking ? null : (
    <div key="stores" className="mt-2 [&>section]:mt-0" data-home-feed-item="stores">
      <HomeStoresSection config={layout.stores} title={t("navigation_delivery")} isMember={isMember} rot={rot} refreshSeq={refreshSeq} />
    </div>
  );
  if (storesBlock) blocks.push(storesBlock);
  if (trade(1)) {
    const pair = [trade(1)!, trade(2)].filter((x): x is NonNullable<typeof x> => Boolean(x));
    push(
      `t2-${pair.map((x) => x.id).join("-")}`,
      <>
        <DomainTag brand="MARKET" labelKey="nav_bottom_trade" />
        <div className="grid grid-cols-2 gap-2.5">
          {pair.map((p) => (
            <HomeTradeFeedCard key={p.id} post={p} variant="pair" tradeCategories={tradeCategories} />
          ))}
        </div>
      </>
    );
  }
  if (post(1)) push(`p-${post(1)!.id}`, <><DomainTag brand="FEED" labelKey="nav_community_switch_info" /><HomePostFeedCard post={post(1)!} /></>);
  if (moims.length > 0) {
    push(
      "moims",
      <>
        <DomainTag brand="CREW" labelKey="moim_tab" />
        <div className="space-y-2">
          {moims.map((m) => (
            <MoimCard key={m.id} moim={m} />
          ))}
        </div>
      </>
    );
  }
  // 나머지 — 마켓 큰 카드와 정보 공유를 번갈아
  const restTrades = tradeList.slice(3);
  const restPosts = postList.slice(2);
  for (let i = 0; i < Math.max(restTrades.length, restPosts.length); i++) {
    const tp = restTrades[i];
    const pp = restPosts[i];
    if (tp) push(`t-${tp.id}`, <><DomainTag brand="MARKET" labelKey="nav_bottom_trade" /><HomeTradeFeedCard post={tp} variant="big" tradeCategories={tradeCategories} /></>);
    if (pp) push(`p-${pp.id}`, <><DomainTag brand="FEED" labelKey="nav_community_switch_info" /><HomePostFeedCard post={pp} /></>);
  }

  return (
    <section className="mt-2 bg-white pt-[18px]" data-home-feed>
      <HomeSectionHead title={title} />
      {bothFailed ? (
        <div className="pb-5">
          <HomeLoadError
            onRetry={() => {
              trades.retry();
              posts.retry();
            }}
          />
        </div>
      ) : loading ? (
        <div className="space-y-3 px-4 pb-5" aria-busy="true">
          <span className="block h-[220px] animate-pulse rounded-ui-rect bg-[#eef1ee]" />
          <span className="block h-[88px] animate-pulse rounded-ui-rect bg-[#eef1ee]" />
        </div>
      ) : blocks.length === 0 ? (
        <p className="px-[18px] pb-5 text-[13.5px] text-[#767676]">{t("home_feed_empty")}</p>
      ) : (
        <div className="bg-[#F3F5F3]">{blocks}</div>
      )}
    </section>
  );
}
