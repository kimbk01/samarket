"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import {
  StoreDeliveryRowCard,
  homeFeedToRowCard,
} from "@/components/stores/home/StoreDeliveryRowCard";
import {
  StoreVerticalDiscoveryCard,
  homeFeedItemToVerticalModel,
} from "@/components/stores/home/StoreVerticalDiscoveryCard";
import { FB } from "@/components/stores/store-facebook-feed-tokens";
import { storesBrowsePrimaryPath } from "@/components/stores/browse/stores-browse-paths";

function splitFeedSections(stores: StoreHomeFeedItem[]) {
  const seen = new Set<string>();
  const pull = (pred: (s: StoreHomeFeedItem) => boolean, max = 40) => {
    const out: StoreHomeFeedItem[] = [];
    for (const s of stores) {
      if (out.length >= max) break;
      if (seen.has(s.id) || !pred(s)) continue;
      seen.add(s.id);
      out.push(s);
    }
    return out;
  };

  const premium = pull((s) => s.isFeatured);
  const openDelivery = pull((s) => s.status === "open" && s.deliveryAvailable);
  const rest = stores.filter((s) => !seen.has(s.id));
  return { premium, openDelivery, rest };
}

function SectionBlock({
  eyebrow,
  title,
  subtitle,
  action,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-2 px-0.5">
        <div>
          {eyebrow ?
            <p className={`text-[12px] font-semibold uppercase tracking-wide ${FB.metaSm}`}>{eyebrow}</p>
          : null}
          <h3 className={`${FB.name} ${eyebrow ? "mt-0.5" : ""}`}>{title}</h3>
          {subtitle ? <p className={`mt-1 ${FB.meta}`}>{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

function RowSkeletonList() {
  return (
    <ul className="space-y-2">
      {[0, 1, 2, 3].map((k) => (
        <li key={k} className={`flex gap-2 p-3 ${FB.card}`}>
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[#E4E6EB] dark:bg-[#3A3B3C]" />
          <div className="flex flex-1 flex-col gap-2 py-0.5">
            <div className="h-4 w-3/5 animate-pulse rounded bg-[#E4E6EB] dark:bg-[#3A3B3C]" />
            <div className="h-3 w-full animate-pulse rounded bg-[#F0F2F5] dark:bg-[#3A3B3C]" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-[#F0F2F5] dark:bg-[#3A3B3C]" />
          </div>
        </li>
      ))}
    </ul>
  );
}

const spotRailScroll =
  "flex gap-3 overflow-x-auto pb-1 pt-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export function StoreNearbyFeedSection({
  querySuffix,
  ownerStore,
  externalSearchQ,
}: {
  querySuffix: string;
  ownerStore: StoreRow | null;
  externalSearchQ: string;
}) {
  const [stores, setStores] = useState<StoreHomeFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<{ source?: string } | null>(null);

  const fetchSuffix = useMemo(() => {
    const base = querySuffix.startsWith("?") ? querySuffix.slice(1) : querySuffix;
    const q = new URLSearchParams(base);
    const t = externalSearchQ.trim();
    if (t.length >= 2) q.set("q", t);
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [querySuffix, externalSearchQ]);

  const loadFeed = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = !!opts?.silent;
      if (!silent) setLoading(true);
      try {
        const res = await fetch(`/api/stores/home-feed${fetchSuffix}`, { cache: "no-store" });
        const json = await res.json();
        if (json?.ok && Array.isArray(json.stores)) {
          setStores(json.stores as StoreHomeFeedItem[]);
          setMeta(json.meta ?? null);
        } else {
          if (!silent) setStores([]);
        }
      } catch {
        if (!silent) setStores([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [fetchSuffix]
  );

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useRefetchOnPageShowRestore(() => void loadFeed({ silent: true }));

  const sections = useMemo(() => splitFeedSections(stores), [stores]);

  const tailList =
    sections.rest.length > 0 ?
      sections.rest
    : sections.premium.length === 0 && sections.openDelivery.length === 0 ?
      stores
    : [];

  return (
    <section className="space-y-5 pb-4">
      <div className="flex items-end justify-between px-0.5">
        <div>
          <p className={`text-[12px] font-semibold uppercase tracking-wide ${FB.metaSm}`}>피드</p>
          <h2 className={`mt-0.5 text-[20px] font-bold leading-tight text-[#050505] dark:text-[#E4E6EB]`}>
            매장
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 pb-0.5">
          <Link href={storesBrowsePrimaryPath("restaurant")} className={`text-[15px] ${FB.link}`}>
            음식 더보기
          </Link>
          <span className="text-[13px] text-[#CED0D4] dark:text-[#5F6062]" aria-hidden>
            ·
          </span>
          <Link href="/stores#store-industry-explore" className={`text-[15px] ${FB.link}`}>
            업종별
          </Link>
        </div>
      </div>

      {meta?.source === "supabase_unconfigured" ?
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Supabase가 연결되지 않았거나 매장 테이블이 아직 없습니다.
        </p>
      : null}

      <div className="flex flex-wrap gap-2">
        <Link href="/my/business/apply" className={FB.primaryBtn}>
          {ownerStore ? "매장 추가" : "매장 등록"}
        </Link>
        <Link href="/regions" className={FB.secondaryBtn}>
          동네 설정
        </Link>
      </div>

      {loading ?
        <RowSkeletonList />
      : stores.length === 0 ?
        <div className={`border border-dashed px-4 py-8 text-center ${FB.cardFlat} ${FB.hairline}`}>
          <p className={FB.body}>등록된 매장이 없습니다</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/stores#store-industry-explore" className={FB.secondaryBtn}>
              업종별 찾기
            </Link>
            <Link href="/my/business/apply" className={FB.primaryBtn}>
              등록하기
            </Link>
          </div>
        </div>
      : <>
          {sections.premium.length > 0 ?
            <SectionBlock
              eyebrow="큐레이션"
              title="추천 스폿"
              subtitle="에디터가 고른 동네 매장 — 카드를 옆으로 넘겨 보세요."
            >
              <HorizontalDragScroll
                className={spotRailScroll}
                style={{ WebkitOverflowScrolling: "touch" }}
                aria-label="추천 매장"
              >
                {sections.premium.map((s) => (
                  <div key={s.id} className="w-[min(88vw,300px)] shrink-0">
                    <StoreVerticalDiscoveryCard store={homeFeedItemToVerticalModel(s)} adHint="추천" />
                  </div>
                ))}
              </HorizontalDragScroll>
            </SectionBlock>
          : null}

          {sections.openDelivery.length > 0 ?
            <SectionBlock eyebrow="실시간" title="지금 주문 가능" subtitle="영업 중 · 배달 또는 포장이 열려 있어요">
              <ul className="space-y-2">
                {sections.openDelivery.map((s) => (
                  <StoreDeliveryRowCard key={s.id} data={homeFeedToRowCard(s)} />
                ))}
              </ul>
            </SectionBlock>
          : null}

          {tailList.length > 0 ?
            <SectionBlock
              eyebrow="동네"
              title="이 동네 더보기"
              subtitle="거리와 인기를 섞어 보여 드려요"
              action={
                <div className="flex flex-wrap items-center justify-end gap-x-2">
                  <Link href={storesBrowsePrimaryPath("restaurant")} className={`text-[15px] ${FB.link}`}>
                    음식
                  </Link>
                  <Link href={storesBrowsePrimaryPath("mart")} className={`text-[15px] ${FB.link}`}>
                    마트
                  </Link>
                </div>
              }
            >
              <ul className="space-y-2">
                {tailList.map((s) => (
                  <StoreDeliveryRowCard key={s.id} data={homeFeedToRowCard(s)} />
                ))}
              </ul>
            </SectionBlock>
          : null}
        </>
      }
    </section>
  );
}
