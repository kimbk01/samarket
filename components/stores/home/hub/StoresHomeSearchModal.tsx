"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  buildDeliveryListScrollRouteKey,
  saveDeliveryListScrollBeforeStoreNavigation,
} from "@/lib/dibay/delivery-list-scroll-restore";
import { markStoreDetailListSeedNavigation } from "@/lib/dibay/store-detail-seed-patch-trace";
import { buildStoreDetailHref } from "@/lib/dibay/store-detail-href";
import { RecentSearchChips } from "@/components/delivery/search/RecentSearchChips";
import { PopularSearchList } from "@/components/delivery/search/PopularSearchList";
import { RecommendedSearchChips } from "@/components/delivery/search/RecommendedSearchChips";
import { DeliverySearchResults } from "@/components/delivery/search/DeliverySearchResults";
import {
  type DeliverySearchMenu,
  useDeliveryStoreSearch,
} from "@/hooks/use-delivery-store-search";

const FALLBACK_RECOMMENDED = [
  "치킨",
  "피자",
  "한식",
  "분식",
  "카페",
  "도시락",
  "마트",
  "족발",
  "야식",
  "무료배달",
] as const;

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

/** `/stores` 홈 — 검색 아이콘 탭 시 전면 모달 */
export function StoresHomeSearchModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const panelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [domReady, setDomReady] = useState(false);
  const search = useDeliveryStoreSearch();
  const { reset, submit, pickKeyword, debouncedQ, showResults, loading, stores, menus, resultCount, q, setQ } =
    search;

  useEffect(() => {
    setDomReady(true);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    document.body.classList.add("overflow-hidden");
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(id);
      document.body.classList.remove("overflow-hidden");
    };
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const listScrollRouteKey = buildDeliveryListScrollRouteKey(
    "/stores/search",
    debouncedQ.trim() ? `?q=${encodeURIComponent(debouncedQ.trim())}` : ""
  );

  const onClickStore = useCallback(
    (slug: string) => {
      const s = slug.trim();
      if (!s) return;
      saveDeliveryListScrollBeforeStoreNavigation(listScrollRouteKey);
      markStoreDetailListSeedNavigation(s);
      onClose();
      router.push(`/stores/${encodeURIComponent(s)}`);
    },
    [router, listScrollRouteKey, onClose]
  );

  const onClickMenu = useCallback(
    (menu: DeliverySearchMenu) => {
      const slug = menu.store_slug?.trim();
      if (!slug) return;
      saveDeliveryListScrollBeforeStoreNavigation(listScrollRouteKey);
      markStoreDetailListSeedNavigation(slug);
      onClose();
      router.push(buildStoreDetailHref(slug, menu.id));
    },
    [router, listScrollRouteKey, onClose]
  );

  if (!domReady || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex flex-col bg-[color:var(--delivery-bg)] pt-[env(safe-area-inset-top,0px)]">
      <div className="delivery-ui shrink-0 border-b border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)] px-[var(--delivery-page-x)] py-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(q);
          }}
          className="flex items-center gap-2"
        >
          <button
            type="button"
            onClick={onClose}
            className="delivery-consumer-header__icon-btn shrink-0 text-[color:var(--delivery-text-main)]"
            aria-label={t("ui_delivery_search_back_aria")}
          >
            <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[var(--delivery-radius-pill)] bg-[color:var(--delivery-bg-soft)] px-3">
            <SearchIcon className="h-[var(--delivery-header-icon-glyph)] w-[var(--delivery-header-icon-glyph)] shrink-0 text-[color:var(--delivery-text-muted)]" />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("store_search_placeholder")}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-[color:var(--delivery-text-main)] placeholder:text-[color:var(--delivery-text-muted)] focus:outline-none"
              aria-label={t("ui_delivery_search_input_aria")}
            />
            {q.trim().length > 0 ?
              <button
                type="button"
                onClick={() => setQ("")}
                className="shrink-0 text-[color:var(--delivery-text-muted)]"
                aria-label={t("ui_delivery_search_clear_aria")}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            : null}
          </div>
        </form>
      </div>
      <div
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label={t("store_search_placeholder")}
        className="delivery-ui min-h-0 flex-1 overflow-y-auto overscroll-contain px-[var(--delivery-page-x)] pb-8 pt-3"
      >
        {!showResults ?
          <div className="space-y-5">
            <RecentSearchChips onPick={pickKeyword} />
            <PopularSearchList keywords={[...FALLBACK_RECOMMENDED]} onPick={pickKeyword} />
            <RecommendedSearchChips keywords={[...FALLBACK_RECOMMENDED]} onPick={pickKeyword} />
          </div>
        : <DeliverySearchResults
            q={debouncedQ}
            loading={loading}
            stores={stores}
            menus={menus}
            resultCount={resultCount}
            onClickStore={onClickStore}
            onClickMenu={onClickMenu}
          />
        }
      </div>
    </div>,
    document.body
  );
}
