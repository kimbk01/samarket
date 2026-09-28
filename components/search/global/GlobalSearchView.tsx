"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { SearchInputBar } from "@/components/search/SearchInputBar";
import { CommunityPostCard } from "@/components/community/CommunityPostCard";
import { ProductCard } from "@/components/product/ProductCard";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { SearchHighlightText } from "@/components/search/global/SearchHighlightText";
import { useSetMainTier1ExtrasOptional } from "@/contexts/MainTier1ExtrasContext";
import { AppBackIcon, AppCloseIcon } from "@/components/navigation/AppBackButton";
import { SAM_TIER1_HEADER_ACTION_BTN_CLASS } from "@/lib/ui/tier1-header-icon";
import { SECTOR_HEADER_BACK_CLASS } from "@/lib/ui/sector-header-classes";
import { closeGlobalSearch } from "@/lib/search/global/global-search-navigation-ssot";
import { createGlobalSearchCoordinator, trimGlobalSearchQuery } from "@/lib/search/global/coordinate-search";
import { isSearchableGlobalQuery } from "@/lib/search/global/semantics/is-searchable-query";
import {
  orderGlobalSearchDomains,
  readGlobalSearchEntryDomain,
  type GlobalSearchEntryDomain,
} from "@/lib/search/global/semantics/entry-domain";
import {
  matchDeliveryMenuGlobalSearch,
  matchDeliveryStoreGlobalSearch,
} from "@/lib/search/global/semantics/domain-fields";
import { buildMatchedSnippet } from "@/lib/search/global/semantics/match";
import {
  addGlobalRecentSearch,
  getGlobalRecentSearches,
  removeGlobalRecentSearch,
  type GlobalRecentSearch,
} from "@/lib/search/global/recent-searches";
import { searchCommunityForGlobal } from "@/lib/search/global/adapters/community-search-adapter";
import { searchTradeForGlobal } from "@/lib/search/global/adapters/trade-search-adapter";
import { searchDeliveryForGlobal } from "@/lib/search/global/adapters/delivery-search-adapter";
import {
  searchChatForGlobal,
  type GlobalSearchChatHit,
  type GlobalSearchChatKind,
} from "@/lib/search/global/adapters/chat-search-adapter";
import { useTradeMarketplaceLocationHydrate } from "@/lib/trade/location/use-trade-marketplace-location-hydrate";
import { marketplaceLocationFetchGate } from "@/lib/trade/marketplace/client-location-fetch";
import { rememberTradeListReturnHref } from "@/lib/trade/location/trade-list-return-href";
import {
  buildDeliveryListScrollRouteKey,
  saveDeliveryListScrollBeforeStoreNavigation,
} from "@/lib/dibay/delivery-list-scroll-restore";
import { useDeliveryListScrollRestore } from "@/lib/dibay/use-delivery-list-scroll-restore";
import { markStoreDetailListSeedNavigation } from "@/lib/dibay/store-detail-seed-patch-trace";
import {
  navigateToDeliveryStoreCard,
  navigateToDeliveryStoreProduct,
} from "@/lib/navigation/navigate-to-delivery-store-product";
import { formatStoreCardOutOfRangeLabel } from "@/lib/stores/presentation/resolve-store-list-card-badges";
import { runCommunityMessengerRoomForwardNavigation } from "@/lib/community-messenger/community-messenger-room-forward-navigation";
import { getRoomTypeBadgeLabel } from "@/lib/community-messenger/cm-home-list-copy";
import { getViewerUserId } from "@/lib/auth/viewer-user-id";
import type { CommunityFeedPostDTO } from "@/lib/community-feed/types";
import type { Product } from "@/lib/types/product";
import type { DeliverySearchMenu, DeliverySearchStore } from "@/components/delivery/search/DeliverySearchResults";
import { MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS } from "@/lib/layout/main-bottom-nav-hub-clearance";

type DomainLoad = "idle" | "loading" | "ok" | "error";

function globalSearchHref(q: string): string {
  const keyword = trimGlobalSearchQuery(q);
  return keyword ? `/search?q=${encodeURIComponent(keyword)}` : "/search";
}

function GlobalSearchHeaderBackButton({ onClose }: { onClose: () => void }) {
  const { safeT } = useI18n();
  return (
    <button
      type="button"
      data-global-search-header-back="true"
      className={SECTOR_HEADER_BACK_CLASS}
      aria-label={safeT("global_search_close", {
        fallbackKo: "검색 닫기",
        fallbackEn: "Close search",
      })}
      onClick={onClose}
    >
      <AppBackIcon />
    </button>
  );
}

function GlobalSearchCloseButton({ onClose }: { onClose: () => void }) {
  const { safeT } = useI18n();
  return (
    <button
      type="button"
      data-global-search-close="true"
      className={SAM_TIER1_HEADER_ACTION_BTN_CLASS}
      aria-label={safeT("global_search_close", {
        fallbackKo: "검색 닫기",
        fallbackEn: "Close search",
      })}
      onClick={onClose}
    >
      <AppCloseIcon className="h-5 w-5" />
    </button>
  );
}

function GlobalSearchStickyInput({
  onKeywordChange,
  submitSearch,
}: {
  onKeywordChange: (value: string) => void;
  submitSearch: (keyword: string) => void;
}) {
  const { safeT } = useI18n();
  const searchParams = useSearchParams();
  const queryFromUrl = trimGlobalSearchQuery(searchParams.get("q"));
  const [value, setValue] = useState(queryFromUrl);

  useEffect(() => {
    setValue(queryFromUrl);
  }, [queryFromUrl]);

  return (
    <div className="border-b border-sam-border bg-[var(--sub-bg)]">
      <div className="flex h-12 items-center gap-2 px-4 py-1.5">
        <div className="min-w-0 flex-1">
          <SearchInputBar
            value={value}
            onChange={(next) => {
              setValue(next);
              onKeywordChange(next);
            }}
            onSubmit={submitSearch}
            placeholder={safeT("global_search_placeholder", {
              fallbackKo: "커뮤니티, 거래, 배달, 채팅 검색",
              fallbackEn: "Search community, market, delivery, chat",
            })}
          />
        </div>
      </div>
    </div>
  );
}

function ChatKindSection({
  title,
  hits,
  query,
  onOpen,
}: {
  title: string;
  hits: GlobalSearchChatHit[];
  query: string;
  onOpen: (hit: GlobalSearchChatHit) => void;
}) {
  if (hits.length === 0) return null;
  return (
    <div className="space-y-1.5" data-global-search-chat-kind={hits[0]?.kind}>
      <h3 className="sam-text-body-secondary font-semibold text-sam-muted">{title}</h3>
      <ul className="space-y-1">
        {hits.map((hit) => (
          <li key={`${hit.kind}-${hit.room.id}`}>
            <button
              type="button"
              onClick={() => onOpen(hit)}
              className="flex w-full items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left active:scale-[0.98]"
            >
              <SamarketThumbnail
                src={hit.room.avatarUrl}
                size={44}
                roundedClassName="rounded-full"
                className="bg-sam-surface-muted"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate sam-text-body font-semibold text-sam-fg">
                    {hit.matchedField === "title" ? (
                      <SearchHighlightText text={hit.room.title} query={query} />
                    ) : (
                      hit.room.title
                    )}
                  </p>
                  <span className="shrink-0 rounded-full bg-sam-primary-soft px-1.5 py-0.5 sam-text-xxs text-sam-primary">
                    {getRoomTypeBadgeLabel(hit.room)}
                  </span>
                </div>
                {hit.preview ? (
                  <p className="mt-0.5 truncate sam-text-helper text-sam-muted">
                    {hit.matchedField !== "title" ? (
                      <SearchHighlightText text={hit.preview} query={query} />
                    ) : (
                      hit.preview
                    )}
                  </p>
                ) : null}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GlobalSearchView() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const setMainTier1Extras = useSetMainTier1ExtrasOptional();
  const queryFromUrl = trimGlobalSearchQuery(searchParams.get("q"));
  const { scope } = useTradeMarketplaceLocationHydrate();
  const locGate = useMemo(() => marketplaceLocationFetchGate(scope), [scope]);
  const entryDomain = useMemo(() => readGlobalSearchEntryDomain(), []);
  const domainOrder = useMemo(() => orderGlobalSearchDomains(entryDomain), [entryDomain]);
  const coordinatorRef = useRef(createGlobalSearchCoordinator());
  const lastImmediateQueryRef = useRef<string | null>(null);
  const [keyword, setKeyword] = useState(queryFromUrl);
  const [recents, setRecents] = useState<GlobalRecentSearch[]>([]);
  const [communityStatus, setCommunityStatus] = useState<DomainLoad>("idle");
  const [tradeStatus, setTradeStatus] = useState<DomainLoad>("idle");
  const [deliveryStatus, setDeliveryStatus] = useState<DomainLoad>("idle");
  const [chatStatus, setChatStatus] = useState<DomainLoad>("idle");
  const [communityPosts, setCommunityPosts] = useState<CommunityFeedPostDTO[]>([]);
  const [tradeProducts, setTradeProducts] = useState<Product[]>([]);
  const [deliveryStores, setDeliveryStores] = useState<DeliverySearchStore[]>([]);
  const [deliveryMenus, setDeliveryMenus] = useState<DeliverySearchMenu[]>([]);
  const [chatHits, setChatHits] = useState<GlobalSearchChatHit[]>([]);

  const activeQuery = trimGlobalSearchQuery(keyword);
  const searchableQuery = isSearchableGlobalQuery(activeQuery);
  const showResults = searchableQuery;
  const listScrollRouteKey = useMemo(
    () => buildDeliveryListScrollRouteKey("/search", activeQuery ? `?q=${encodeURIComponent(activeQuery)}` : ""),
    [activeQuery]
  );
  useDeliveryListScrollRestore(listScrollRouteKey, showResults);

  useEffect(() => {
    setKeyword(queryFromUrl);
  }, [queryFromUrl]);

  useEffect(() => {
    setRecents(getGlobalRecentSearches());
  }, []);

  const commitUrl = useCallback(
    (raw: string) => {
      const next = trimGlobalSearchQuery(raw);
      const href = globalSearchHref(next);
      router.replace(href, { scroll: false });
      if (next) setRecents(addGlobalRecentSearch(next));
    },
    [router]
  );

  const runSearch = useCallback(
    async (raw: string) => {
      const q = trimGlobalSearchQuery(raw);
      if (!q || !isSearchableGlobalQuery(q)) {
        coordinatorRef.current.cancel();
        setCommunityStatus("idle");
        setTradeStatus("idle");
        setDeliveryStatus("idle");
        setChatStatus("idle");
        setCommunityPosts([]);
        setTradeProducts([]);
        setDeliveryStores([]);
        setDeliveryMenus([]);
        setChatHits([]);
        return;
      }
      const { signal, seq } = coordinatorRef.current.beginRequest();
      const coord = coordinatorRef.current;
      setCommunityStatus("loading");
      setTradeStatus("loading");
      setDeliveryStatus("loading");
      setChatStatus("loading");

      const settle = (requestSeq: number) => coord.isCurrent(requestSeq);

      void searchCommunityForGlobal(q, signal)
        .then((res) => {
          if (!settle(seq)) return;
          if (!res.ok) {
            setCommunityStatus("error");
            setCommunityPosts([]);
            return;
          }
          setCommunityPosts(res.posts);
          setCommunityStatus("ok");
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          if (!settle(seq)) return;
          setCommunityStatus("error");
          setCommunityPosts([]);
        });

      void searchTradeForGlobal(q, {
        signal,
        locationAll: locGate.locationAll === true,
        lguCityId: locGate.lguCityId ?? null,
        radiusKm: locGate.radiusKm ?? null,
        canFetch: locGate.canFetch,
      })
        .then((res) => {
          if (!settle(seq)) return;
          if (!res.ok) {
            setTradeStatus("error");
            setTradeProducts([]);
            return;
          }
          setTradeProducts(res.products);
          setTradeStatus("ok");
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          if (!settle(seq)) return;
          setTradeStatus("error");
          setTradeProducts([]);
        });

      void searchDeliveryForGlobal(q, signal)
        .then((res) => {
          if (!settle(seq)) return;
          if (!res.ok) {
            setDeliveryStatus("error");
            setDeliveryStores([]);
            setDeliveryMenus([]);
            return;
          }
          setDeliveryStores(res.stores);
          setDeliveryMenus(res.menus);
          setDeliveryStatus("ok");
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          if (!settle(seq)) return;
          setDeliveryStatus("error");
          setDeliveryStores([]);
          setDeliveryMenus([]);
        });

      void searchChatForGlobal(q, signal)
        .then((res) => {
          if (!settle(seq)) return;
          if (!res.ok) {
            setChatStatus("error");
            setChatHits([]);
            return;
          }
          setChatHits(res.hits);
          setChatStatus("ok");
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === "AbortError") return;
          if (!settle(seq)) return;
          setChatStatus("error");
          setChatHits([]);
        });
    },
    [locGate]
  );

  const submitSearch = useCallback(
    (raw: string) => {
      coordinatorRef.current.cancel();
      const next = trimGlobalSearchQuery(raw);
      if (!next || !isSearchableGlobalQuery(next)) return;
      lastImmediateQueryRef.current = next;
      setKeyword(next);
      commitUrl(next);
      void runSearch(next);
    },
    [commitUrl, runSearch]
  );

  const closeSearch = useCallback(() => {
    closeGlobalSearch(router);
  }, [router]);

  useEffect(() => {
    const q = trimGlobalSearchQuery(keyword);
    if (q && lastImmediateQueryRef.current === q) {
      lastImmediateQueryRef.current = null;
      return;
    }
    lastImmediateQueryRef.current = null;
    if (!q || !isSearchableGlobalQuery(q)) {
      coordinatorRef.current.cancel();
      setCommunityStatus("idle");
      setTradeStatus("idle");
      setDeliveryStatus("idle");
      setChatStatus("idle");
      setCommunityPosts([]);
      setTradeProducts([]);
      setDeliveryStores([]);
      setDeliveryMenus([]);
      setChatHits([]);
      return;
    }
    coordinatorRef.current.schedule(() => {
      void runSearch(q);
    });
    return () => {
      coordinatorRef.current.cancel();
    };
  }, [keyword, runSearch]);

  useEffect(() => {
    if (tradeStatus === "ok" && activeQuery) {
      rememberTradeListReturnHref(globalSearchHref(activeQuery));
    }
  }, [tradeStatus, activeQuery, tradeProducts.length]);

  useEffect(() => {
    if (!setMainTier1Extras) return;
    setMainTier1Extras({
      stickyBelow: (
        <GlobalSearchStickyInput onKeywordChange={setKeyword} submitSearch={submitSearch} />
      ),
      tier1: {
        showHubQuickActions: false,
        preferHistoryBack: false,
        leftSlot: <GlobalSearchHeaderBackButton onClose={closeSearch} />,
        rightSlot: <GlobalSearchCloseButton onClose={closeSearch} />,
      },
    });
    return () => setMainTier1Extras(null);
  }, [setMainTier1Extras, submitSearch, closeSearch]);

  const originHref = globalSearchHref(activeQuery);
  const originSearch = activeQuery ? `?q=${encodeURIComponent(activeQuery)}` : "";

  const onClickStore = useCallback(
    (slug: string) => {
      const s = slug.trim();
      if (!s) return;
      saveDeliveryListScrollBeforeStoreNavigation(listScrollRouteKey);
      markStoreDetailListSeedNavigation(s);
      navigateToDeliveryStoreCard(router, {
        storeSlug: s,
        pathname: "/search",
        search: originSearch,
        originHrefOverride: originHref,
        originSurfaceOverride: "SEARCH",
        saveScroll: false,
      });
    },
    [router, listScrollRouteKey, originHref, originSearch]
  );

  const onClickMenu = useCallback(
    (menu: DeliverySearchMenu) => {
      const slug = menu.store_slug?.trim();
      if (!slug || !menu.id) return;
      saveDeliveryListScrollBeforeStoreNavigation(listScrollRouteKey);
      markStoreDetailListSeedNavigation(slug);
      navigateToDeliveryStoreProduct(router, {
        storeSlug: slug,
        productId: menu.id,
        childMode: "focusProduct",
        pathname: "/search",
        search: originSearch,
        originHrefOverride: originHref,
        originSurfaceOverride: "SEARCH",
        saveScroll: false,
      });
    },
    [router, listScrollRouteKey, originHref, originSearch]
  );

  const onOpenChat = useCallback(
    (hit: GlobalSearchChatHit) => {
      void runCommunityMessengerRoomForwardNavigation({
        router,
        roomId: hit.room.id,
        listSource: hit.listSource,
        fromEntryOrigin: null,
        viewerUserId: getViewerUserId(),
        roomForPrime: hit.room,
        returnHrefOverride: originHref,
      });
    },
    [router, originHref]
  );

  const retryDomain = useCallback(
    (domain: "community" | "trade" | "delivery" | "chat") => {
      const q = activeQuery;
      if (!q || !isSearchableGlobalQuery(q)) return;
      if (domain === "community") {
        setCommunityStatus("loading");
        void searchCommunityForGlobal(q, new AbortController().signal)
          .then((res) => {
            if (!res.ok) {
              setCommunityStatus("error");
              return;
            }
            setCommunityPosts(res.posts);
            setCommunityStatus("ok");
          })
          .catch(() => setCommunityStatus("error"));
        return;
      }
      if (domain === "trade") {
        setTradeStatus("loading");
        void searchTradeForGlobal(q, {
          signal: new AbortController().signal,
          locationAll: locGate.locationAll === true,
          lguCityId: locGate.lguCityId ?? null,
          radiusKm: locGate.radiusKm ?? null,
          canFetch: locGate.canFetch,
        })
          .then((res) => {
            if (!res.ok) {
              setTradeStatus("error");
              return;
            }
            setTradeProducts(res.products);
            setTradeStatus("ok");
          })
          .catch(() => setTradeStatus("error"));
        return;
      }
      if (domain === "delivery") {
        setDeliveryStatus("loading");
        void searchDeliveryForGlobal(q, new AbortController().signal)
          .then((res) => {
            if (!res.ok) {
              setDeliveryStatus("error");
              return;
            }
            setDeliveryStores(res.stores);
            setDeliveryMenus(res.menus);
            setDeliveryStatus("ok");
          })
          .catch(() => setDeliveryStatus("error"));
        return;
      }
      setChatStatus("loading");
      void searchChatForGlobal(q, new AbortController().signal)
        .then((res) => {
          if (!res.ok) {
            setChatStatus("error");
            return;
          }
          setChatHits(res.hits);
          setChatStatus("ok");
        })
        .catch(() => setChatStatus("error"));
    },
    [activeQuery, locGate]
  );

  const chatByKind = useMemo(() => {
    const groups: Record<GlobalSearchChatKind, GlobalSearchChatHit[]> = {
      direct: [],
      group: [],
      trade: [],
      order: [],
    };
    for (const hit of chatHits) groups[hit.kind].push(hit);
    return groups;
  }, [chatHits]);

  const anyHits =
    communityPosts.length > 0 ||
    tradeProducts.length > 0 ||
    deliveryStores.length > 0 ||
    deliveryMenus.length > 0 ||
    chatHits.length > 0;
  const anyError =
    communityStatus === "error" ||
    tradeStatus === "error" ||
    deliveryStatus === "error" ||
    chatStatus === "error";
  const allSettled = [communityStatus, tradeStatus, deliveryStatus, chatStatus].every(
    (s) => s === "ok" || s === "error"
  );
  const globalEmpty = showResults && allSettled && !anyHits && !anyError;

  const renderDomain = (domain: GlobalSearchEntryDomain) => {
    if (domain === "community") {
      if (communityStatus === "loading") {
        return (
          <section key="community" data-global-search-section="community" className="space-y-2">
            <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("global_search_section_community")}</h2>
            <p className="sam-text-body text-sam-muted">{t("global_search_searching")}</p>
          </section>
        );
      }
      if (communityStatus === "error") {
        return (
          <section key="community" data-global-search-section="community" className="space-y-2">
            <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("global_search_section_community")}</h2>
            <button type="button" className="sam-text-body font-semibold text-sam-primary" onClick={() => retryDomain("community")}>
              {t("common_retry")}
            </button>
          </section>
        );
      }
      if (communityPosts.length === 0) return null;
      return (
        <section key="community" data-global-search-section="community" className="space-y-2">
          <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("global_search_section_community")}</h2>
          <ul className="space-y-2">
            {communityPosts.map((post) => (
              <li key={post.id}>
                <CommunityPostCard post={post} highlightQuery={activeQuery} />
              </li>
            ))}
          </ul>
        </section>
      );
    }

    if (domain === "trade") {
      if (tradeStatus === "loading") {
        return (
          <section key="trade" data-global-search-section="trade" className="space-y-2">
            <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("global_search_section_trade")}</h2>
            <p className="sam-text-body text-sam-muted">{t("global_search_searching")}</p>
          </section>
        );
      }
      if (tradeStatus === "error") {
        return (
          <section key="trade" data-global-search-section="trade" className="space-y-2">
            <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("global_search_section_trade")}</h2>
            <button type="button" className="sam-text-body font-semibold text-sam-primary" onClick={() => retryDomain("trade")}>
              {t("common_retry")}
            </button>
          </section>
        );
      }
      if (tradeProducts.length === 0) return null;
      return (
        <section key="trade" data-global-search-section="trade" className="space-y-2">
          <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("global_search_section_trade")}</h2>
          <ul className="space-y-2">
            {tradeProducts.map((product) => (
              <li key={product.id}>
                <ProductCard product={product} highlightQuery={activeQuery} />
              </li>
            ))}
          </ul>
        </section>
      );
    }

    if (domain === "delivery") {
      if (deliveryStatus === "loading") {
        return (
          <section key="delivery" data-global-search-section="delivery" className="space-y-2">
            <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("global_search_section_delivery_store")}</h2>
            <p className="sam-text-body text-sam-muted">{t("global_search_searching")}</p>
          </section>
        );
      }
      if (deliveryStatus === "error") {
        return (
          <section key="delivery" data-global-search-section="delivery" className="space-y-2">
            <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("global_search_section_delivery_store")}</h2>
            <button type="button" className="sam-text-body font-semibold text-sam-primary" onClick={() => retryDomain("delivery")}>
              {t("common_retry")}
            </button>
          </section>
        );
      }
      if (deliveryStores.length === 0 && deliveryMenus.length === 0) return null;
      return (
        <div key="delivery" className="space-y-6">
          {deliveryStores.length > 0 ? (
            <section data-global-search-section="delivery-store" className="space-y-2">
              <h2 className="sam-text-body-secondary font-semibold text-sam-fg">
                {t("global_search_section_delivery_store")}
              </h2>
              <ul className="space-y-2">
                {deliveryStores.map((s) => {
                  const outOfRangeLabel = formatStoreCardOutOfRangeLabel({
                    distanceOutOfRange: s.distanceOutOfRange === true,
                    maxDeliveryDistanceKm: s.maxDeliveryDistanceKm,
                    labelWithMax: (km) => t("store_delivery_distance_out_of_range_with_max", { km }),
                    labelGeneric: t("store_delivery_distance_out_of_range"),
                  });
                  const storeMatch = matchDeliveryStoreGlobalSearch(s, activeQuery);
                  const descSnippet =
                    storeMatch.matchedField === "description"
                      ? buildMatchedSnippet(s.description ?? "", activeQuery)
                      : null;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => onClickStore(s.slug)}
                        className="flex w-full items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left active:scale-[0.98]"
                      >
                        <SamarketThumbnail
                          src={s.profile_image_url}
                          size={48}
                          roundedClassName="rounded-ui-rect"
                          className="bg-sam-surface-muted"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate sam-text-body font-semibold text-sam-fg">
                            {storeMatch.matchedField === "store_name" ? (
                              <SearchHighlightText text={s.store_name} query={activeQuery} />
                            ) : (
                              s.store_name
                            )}
                          </p>
                          {descSnippet ? (
                            <p className="mt-0.5 line-clamp-1 sam-text-body text-sam-muted">
                              <SearchHighlightText text={descSnippet} query={activeQuery} />
                            </p>
                          ) : s.description ? (
                            <p className="mt-0.5 line-clamp-1 sam-text-body text-sam-muted">{s.description}</p>
                          ) : null}
                          {outOfRangeLabel ? (
                            <p className="mt-1 sam-text-helper font-semibold text-sam-warning">{outOfRangeLabel}</p>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {deliveryMenus.length > 0 ? (
            <section data-global-search-section="delivery-menu" className="space-y-2">
              <h2 className="sam-text-body-secondary font-semibold text-sam-fg">
                {t("global_search_section_delivery_menu")}
              </h2>
              <ul className="space-y-2">
                {deliveryMenus.map((m) => {
                  const menuMatch = matchDeliveryMenuGlobalSearch(m, activeQuery);
                  const summarySnippet =
                    menuMatch.matchedField === "summary"
                      ? buildMatchedSnippet(m.summary ?? "", activeQuery)
                      : null;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => onClickMenu(m)}
                        className="flex w-full items-center gap-3 rounded-ui-rect border border-sam-border bg-sam-surface p-3 text-left active:scale-[0.98]"
                      >
                        <SamarketThumbnail
                          src={m.thumbnail_url}
                          size={48}
                          roundedClassName="rounded-ui-rect"
                          className="bg-sam-surface-muted"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate sam-text-body font-semibold text-sam-fg">
                            {menuMatch.matchedField === "title" ? (
                              <SearchHighlightText text={m.title} query={activeQuery} />
                            ) : (
                              m.title
                            )}
                          </p>
                          {summarySnippet ? (
                            <p className="mt-0.5 truncate sam-text-body text-sam-muted">
                              <SearchHighlightText text={summarySnippet} query={activeQuery} />
                            </p>
                          ) : (
                            <p className="mt-0.5 truncate sam-text-body text-sam-muted">{m.store_name}</p>
                          )}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      );
    }

    if (chatStatus === "loading") {
      return (
        <section key="chat" data-global-search-section="chat" className="space-y-2">
          <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("global_search_section_chat")}</h2>
          <p className="sam-text-body text-sam-muted">{t("global_search_searching")}</p>
        </section>
      );
    }
    if (chatStatus === "error") {
      return (
        <section key="chat" data-global-search-section="chat" className="space-y-2">
          <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("global_search_section_chat")}</h2>
          <button type="button" className="sam-text-body font-semibold text-sam-primary" onClick={() => retryDomain("chat")}>
            {t("common_retry")}
          </button>
        </section>
      );
    }
    if (chatHits.length === 0) return null;
    return (
      <section key="chat" data-global-search-section="chat" className="space-y-4">
        <h2 className="sam-text-body-secondary font-semibold text-sam-fg">{t("global_search_section_chat")}</h2>
        <ChatKindSection title={t("global_search_section_chat_direct")} hits={chatByKind.direct} query={activeQuery} onOpen={onOpenChat} />
        <ChatKindSection title={t("global_search_section_chat_group")} hits={chatByKind.group} query={activeQuery} onOpen={onOpenChat} />
        <ChatKindSection title={t("global_search_section_chat_trade")} hits={chatByKind.trade} query={activeQuery} onOpen={onOpenChat} />
        <ChatKindSection title={t("global_search_section_chat_order")} hits={chatByKind.order} query={activeQuery} onOpen={onOpenChat} />
      </section>
    );
  };

  return (
    <div
      className={`mx-auto max-w-lg ${MAIN_BOTTOM_NAV_BODY_CLEARANCE_CLASS}`}
      data-global-search="true"
      data-global-search-entry-domain={entryDomain ?? "canonical"}
    >
      {!showResults ? (
        <div className="space-y-3 px-4 py-4">
          <h2 className="sam-text-body-secondary font-semibold text-sam-muted">{t("global_search_recent")}</h2>
          {recents.length === 0 ? (
            <p className="sam-text-body text-sam-muted">{t("global_search_recent_empty")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {recents.map((item) => (
                <span key={item.keyword} className="inline-flex items-center gap-1 rounded-full border border-sam-border bg-sam-surface px-3 py-1.5">
                  <button
                    type="button"
                    className="sam-text-body-secondary text-sam-fg"
                    onClick={() => {
                      submitSearch(item.keyword);
                    }}
                  >
                    {item.keyword}
                  </button>
                  <button
                    type="button"
                    className="sam-text-helper text-sam-muted"
                    aria-label={t("nav_close")}
                    onClick={() => setRecents(removeGlobalRecentSearch(item.keyword))}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6 px-4 py-4" data-global-search-domain-order={domainOrder.join(",")}>
          {globalEmpty ? (
            <div className="py-10 text-center">
              <p className="sam-text-body font-semibold text-sam-fg">{t("global_search_empty_title")}</p>
              <p className="mt-1 sam-text-body text-sam-muted">{t("global_search_empty_hint")}</p>
            </div>
          ) : null}
          {domainOrder.map((domain) => renderDomain(domain))}
        </div>
      )}
    </div>
  );
}
