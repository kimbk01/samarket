"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
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
import {
  dispatchTier1HeaderOverlayClose,
  dispatchTier1HeaderOverlayOpen,
} from "@/lib/layout/tier1-header-overlay-events";

const FALLBACK_RECOMMENDED_KEYS = [
  "store_search_chip_chicken",
  "store_search_chip_pizza",
  "store_search_chip_korean",
  "store_search_chip_bunsik",
  "store_search_chip_cafe",
  "store_search_chip_lunchbox",
  "store_search_chip_mart",
  "store_search_chip_jokbal",
  "store_search_chip_latenight",
  "store_search_chip_free_delivery",
] as const;

const STORES_HOME_SEARCH_POPUP_MOTION_MS = 240;

type PopupLayout = {
  top: number;
  left: number;
  right: number;
  maxHeight: number;
};

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

function computeStoresHomeSearchPopupLayout(anchorRect: DOMRect): PopupLayout {
  const pageX = 10;
  const top = Math.max(anchorRect.top, 0);
  const right = Math.max(8, window.innerWidth - anchorRect.right);
  const bottomReserve = 72;
  const maxHeight = Math.max(240, window.innerHeight - top - bottomReserve);
  return { top, left: pageX, right, maxHeight };
}

/** `/stores` 홈 — 돋보기 기준 우상단에서 좌하로 펼쳐지는 검색 팝업 */
export function StoresHomeSearchModal({
  open,
  onClose,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const panelId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [domReady, setDomReady] = useState(false);
  const [visible, setVisible] = useState(false);
  const [entered, setEntered] = useState(false);
  const [layout, setLayout] = useState<PopupLayout | null>(null);
  const search = useDeliveryStoreSearch();
  const fallbackRecommended = useMemo(
    () => FALLBACK_RECOMMENDED_KEYS.map((key) => t(key)),
    [t]
  );
  const { reset, submit, pickKeyword, debouncedQ, showResults, loading, stores, menus, resultCount, q, setQ } =
    search;

  useEffect(() => {
    setDomReady(true);
  }, []);

  const updateLayout = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    setLayout(computeStoresHomeSearchPopupLayout(rect));
  }, [anchorRef]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      const timer = window.setTimeout(() => {
        setVisible(false);
        reset();
      }, STORES_HOME_SEARCH_POPUP_MOTION_MS);
      return () => window.clearTimeout(timer);
    }

    setVisible(true);
    updateLayout();
    const enterId = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setEntered(true);
        inputRef.current?.focus();
      });
    });

    return () => {
      window.cancelAnimationFrame(enterId);
    };
  }, [open, reset, updateLayout]);

  useEffect(() => {
    if (open) {
      dispatchTier1HeaderOverlayOpen();
    } else {
      dispatchTier1HeaderOverlayClose();
    }
  }, [open]);

  useEffect(() => {
    if (!visible) return;
    document.body.classList.add("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    updateLayout();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const inPanel = panelRef.current?.contains(target) ?? false;
      const onTrigger = anchorRef.current?.contains(target) ?? false;
      if (!inPanel && !onTrigger) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout, true);
    };
  }, [visible, onClose, updateLayout, anchorRef]);

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

  if (!domReady || !visible || !layout) return null;

  const panelStyle: CSSProperties = {
    top: layout.top,
    left: layout.left,
    right: layout.right,
    maxHeight: layout.maxHeight,
    transformOrigin: "top right",
  };

  return createPortal(
    <>
      <div
        className={[
          "stores-home-search-popup__backdrop fixed inset-0 z-[1260] touch-none bg-black/25",
          entered ? "stores-home-search-popup__backdrop--open" : "stores-home-search-popup__backdrop--closed",
        ].join(" ")}
        role="presentation"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={panelRef}
        id={panelId}
        role="dialog"
        aria-modal="true"
        aria-label={t("store_search_placeholder")}
        className={[
          "stores-home-search-popup delivery-ui fixed z-[1270] flex min-h-0 flex-col overflow-hidden rounded-ui-rect border border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)] shadow-[0_14px_36px_rgba(0,0,0,0.16)]",
          entered ? "stores-home-search-popup--open" : "stores-home-search-popup--closed",
        ].join(" ")}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 border-b border-[color:var(--delivery-border)] px-3 py-2.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(q);
            }}
            className="flex items-center gap-2"
          >
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
            <button
              type="button"
              onClick={onClose}
              className="delivery-consumer-header__icon-btn shrink-0 text-[color:var(--delivery-text-main)]"
              aria-label={t("ui_delivery_search_back_aria")}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </form>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4 pt-3">
          {!showResults ?
            <div className="space-y-5">
              <RecentSearchChips onPick={pickKeyword} />
              <PopularSearchList keywords={fallbackRecommended} onPick={pickKeyword} />
              <RecommendedSearchChips keywords={fallbackRecommended} onPick={pickKeyword} />
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
      </div>
    </>,
    document.body
  );
}
