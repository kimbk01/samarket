"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import type { ReactNode } from "react";
import Link from "next/link";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchStoresHomeFeedDeduped } from "@/lib/stores/store-delivery-api-client";
import {
  readStoreHomeFeedClientCache,
  primeStoreHomeFeedClientCache,
} from "@/lib/stores/store-home-feed-client-cache";
import { useRefetchOnPageShowRestore } from "@/lib/ui/use-refetch-on-page-show";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import {
  StoreDeliveryRowCard,
  homeFeedToRowCard,
} from "@/components/stores/home/StoreDeliveryRowCard";
import { StoreDeliveryListLoading } from "@/components/stores/StoreDeliveryListLoading";
import {
  StoreVerticalDiscoveryCard,
  homeFeedItemToVerticalModel,
} from "@/components/stores/home/StoreVerticalDiscoveryCard";
import { FB } from "@/components/stores/store-facebook-feed-tokens";
import { storesBrowsePrimaryPath } from "@/components/stores/browse/stores-browse-paths";
import { isConstrainedNetwork } from "@/lib/ui/network-policy";

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
            <p className={`sam-text-helper font-semibold uppercase tracking-wide ${FB.metaSm}`}>{eyebrow}</p>
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
  const { t, language } = useI18n();
  const [stores, setStores] = useState<StoreHomeFeedItem[]>(() => {
    if (typeof window === "undefined") return [];
    const snap = readStoreHomeFeedClientCache("");
    return snap.entry?.stores ?? [];
  });
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return true;
    const snap = readStoreHomeFeedClientCache("");
    return !snap.entry;
  });
  const [meta, setMeta] = useState<{ source?: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const snap = readStoreHomeFeedClientCache("");
    return snap.entry?.meta ?? null;
  });
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

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
      const requestId = ++requestIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const cachedSnapshot = readStoreHomeFeedClientCache(fetchSuffix);
      const cached = cachedSnapshot.entry;
      /**
       * `/stores` 하단 탭 prewarm은 기본 suffix("")를 먼저 데운다.
       * 실제 진입 키가 지역 쿼리(`?region=...`)로 달라져도,
       * 기본 캐시를 즉시 폴백으로 보여 첫 진입 체감 공백을 줄인다.
       */
      const fallbackSnapshot = !cached && fetchSuffix ? readStoreHomeFeedClientCache("") : null;
      const fallbackCached = fallbackSnapshot?.entry ?? null;
      const cachedEntry = cached ?? fallbackCached;
      const hasFreshCache = cached ? cachedSnapshot.isFresh : (fallbackSnapshot?.isFresh ?? false);
      if (cachedEntry) {
        setStores(cachedEntry.stores);
        setMeta(cachedEntry.meta);
        setLoading(false);
        if (!silent && isConstrainedNetwork() && cached && hasFreshCache) {
          return;
        }
      }
      if (!silent && !cachedEntry) setLoading(true);
      try {
        const { json } = await fetchStoresHomeFeedDeduped(fetchSuffix, { signal: controller.signal });
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        if (json && typeof json === "object" && (json as { ok?: boolean }).ok && Array.isArray((json as { stores?: unknown }).stores)) {
          const j = json as { stores: StoreHomeFeedItem[]; meta?: { source?: string } };
          const nextStores = j.stores;
          const nextMeta = (j.meta ?? null) as { source?: string } | null;
          primeStoreHomeFeedClientCache(fetchSuffix, {
            stores: nextStores,
            meta: nextMeta,
          });
          setStores(nextStores);
          setMeta(nextMeta);
        } else {
          if (!silent) setStores([]);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (requestId !== requestIdRef.current || controller.signal.aborted) return;
        if (!silent) setStores([]);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (!silent && requestId === requestIdRef.current) setLoading(false);
      }
    },
    [fetchSuffix]
  );

  useLayoutEffect(() => {
    void loadFeed();
    return () => {
      abortRef.current?.abort();
    };
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
          <p className={`sam-text-helper font-semibold uppercase tracking-wide ${FB.metaSm}`}>{t("store_feed_eyebrow")}</p>
          <h2 className={`mt-0.5 sam-text-page-title font-bold leading-tight text-[#050505] dark:text-[#E4E6EB]`}>
            {t("store_feed_stores_title")}
          </h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1 pb-0.5">
          <Link href={storesBrowsePrimaryPath("restaurant")} className={`sam-text-body ${FB.link}`}>
            {t("store_more_food_link")}
          </Link>
          <span className="sam-text-body-secondary text-[#CED0D4] dark:text-[#5F6062]" aria-hidden>
            ·
          </span>
          <Link href="/stores#store-industry-explore" className={`sam-text-body ${FB.link}`}>
            {t("store_by_industry_link")}
          </Link>
        </div>
      </div>

      {meta?.source === "supabase_unconfigured" ?
        <p className="rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {t("store_supabase_unconfigured_hint")}
        </p>
      : null}

      <div className="flex flex-wrap gap-2">
        <Link href="/stores/owner/apply" className={FB.primaryBtn}>
          {ownerStore ? t("store_add_store") : t("store_register_store")}
        </Link>
        <Link href="/regions" className={FB.secondaryBtn}>
          {t("store_region_settings_btn")}
        </Link>
      </div>

      {loading ?
        <StoreDeliveryListLoading />
      : stores.length === 0 ?
        <div className={`border border-dashed px-4 py-8 text-center ${FB.cardFlat} ${FB.hairline}`}>
          <p className={FB.body}>{t("store_no_registered_stores")}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Link href="/stores#store-industry-explore" className={FB.secondaryBtn}>
              {t("store_browse_by_industry_find")}
            </Link>
            <Link href="/stores/owner/apply" className={FB.primaryBtn}>
              {t("store_register_store")}
            </Link>
          </div>
        </div>
      : <>
          {sections.premium.length > 0 ?
            <SectionBlock
              eyebrow={t("store_curation_eyebrow")}
              title={t("store_spot_recommended_title")}
              subtitle={t("store_spot_recommended_subtitle")}
            >
              <HorizontalDragScroll
                className={spotRailScroll}
                style={{ WebkitOverflowScrolling: "touch" }}
                aria-label={t("store_recommended_stores_aria")}
              >
                {sections.premium.map((s) => (
                  <div key={s.id} className="w-[min(88vw,300px)] shrink-0">
                    <StoreVerticalDiscoveryCard
                      store={homeFeedItemToVerticalModel(s)}
                      adHint={t("store_badge_recommended")}
                    />
                  </div>
                ))}
              </HorizontalDragScroll>
            </SectionBlock>
          : null}

          {sections.openDelivery.length > 0 ?
            <SectionBlock eyebrow={t("store_live_eyebrow")} title={t("store_order_now_title")} subtitle={t("store_order_now_subtitle")}>
              <ul className="space-y-2">
                {sections.openDelivery.map((s) => (
                  <StoreDeliveryRowCard key={s.id} data={homeFeedToRowCard(s)} locale={language} />
                ))}
              </ul>
            </SectionBlock>
          : null}

          {tailList.length > 0 ?
            <SectionBlock
              eyebrow={t("store_neighborhood")}
              title={t("store_neighborhood_more_title")}
              subtitle={t("store_neighborhood_more_subtitle")}
              action={
                <div className="flex flex-wrap items-center justify-end gap-x-2">
                  <Link href={storesBrowsePrimaryPath("restaurant")} className={`sam-text-body ${FB.link}`}>
                    {t("store_browse_primary_restaurant")}
                  </Link>
                  <Link href={storesBrowsePrimaryPath("mart")} className={`sam-text-body ${FB.link}`}>
                    {t("store_browse_primary_mart")}
                  </Link>
                </div>
              }
            >
              <ul className="space-y-2">
                {tailList.map((s) => (
                  <StoreDeliveryRowCard key={s.id} data={homeFeedToRowCard(s)} locale={language} />
                ))}
              </ul>
            </SectionBlock>
          : null}
        </>
      }
    </section>
  );
}
