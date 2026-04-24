"use client";

import { createPortal } from "react-dom";
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import { HorizontalDragScroll } from "@/components/community/HorizontalDragScroll";
import { APP_MAIN_HEADER_INNER_CLASS } from "@/lib/ui/app-content-layout";
import { useTradeTabs } from "@/lib/trade/tabs/use-trade-tabs";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  cancelScheduledWhenBrowserIdle,
  isConstrainedNetwork,
  scheduleWhenBrowserIdle,
} from "@/lib/ui/network-policy";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";

interface TradePrimaryTabsProps {
  embed?: boolean;
  embedInAppHeader?: boolean;
  /** @deprecated — 전역 `sam-tab` 단일 규칙만 사용 */
  appearance?: "pill" | "inline-text" | "community" | "orders-tab";
}

function TradePrimaryTabsFallback({ embedInAppHeader }: { embedInAppHeader: boolean }) {
  if (!embedInAppHeader) {
    return (
      <div className="relative flex min-w-0 flex-shrink-0 flex-col overflow-x-hidden border-b border-sam-border bg-sam-surface">
        <div className={APP_MAIN_HEADER_INNER_CLASS}>
          <div className={`${Sam.tabs.barScroll} flex min-h-[var(--sam-segment-tab-height)] w-full min-w-0 items-stretch border-b border-sam-border`} aria-hidden>
            <span className="min-w-16 flex-1 animate-pulse border-b-2 border-transparent py-2 text-center" />
            <span className="min-w-20 flex-1 animate-pulse border-b-2 border-transparent py-2 text-center" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-w-0 overflow-x-hidden border-t border-sam-border-soft bg-sam-surface">
      <div className={APP_MAIN_HEADER_INNER_CLASS}>
        <div className={`${Sam.tabs.barScroll} flex min-h-[var(--sam-segment-tab-height)] w-full min-w-0 items-stretch`} aria-hidden>
          <span className="min-w-16 flex-1 animate-pulse border-b-2 border-transparent py-2 text-center" />
          <span className="min-w-20 flex-1 animate-pulse border-b-2 border-transparent py-2 text-center" />
        </div>
      </div>
    </div>
  );
}

/**
 * TRADE 메뉴 탭(전체·카테고리…) — `RegionBar` 아래. `sam-tabs` / `sam-tabs--scroll` 단일 시각.
 * `useSearchParams()` — Next 정적 생성용 `Suspense` 경계.
 */
function TradePrimaryTabsInner({
  embed = false,
  embedInAppHeader = false,
}: TradePrimaryTabsProps) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const router = useRouter();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const { loading, error, tabs } = useTradeTabs(pathname);
  const [allSortOpen, setAllSortOpen] = useState(false);
  const [allSortMenuPos, setAllSortMenuPos] = useState<{ top: number; left: number } | null>(null);
  const allSortButtonRef = useRef<HTMLButtonElement | null>(null);
  const allSortMenuRef = useRef<HTMLUListElement | null>(null);
  const tradeStateRaw = searchParams.get("tradeState")?.trim() ?? "";
  const tradeState = tradeStateRaw === "active" || tradeStateRaw === "reserved" || tradeStateRaw === "sold"
    ? tradeStateRaw
    : "latest";
  const allSortLabel = tradeState === "active" ? "판매중" : tradeState === "reserved" ? "예약중" : tradeState === "sold" ? "거래 완료" : "최신순";
  const allHref = useMemo(() => {
    const sp = new URLSearchParams(searchParams.toString());
    if (tradeState === "latest") sp.delete("tradeState");
    else sp.set("tradeState", tradeState);
    const qs = sp.toString();
    return qs ? `/home?${qs}` : "/home";
  }, [searchParams, tradeState]);

  const setTradeState = useCallback(
    (next: "latest" | "active" | "reserved" | "sold") => {
      if (next !== tradeState && !guardBeforeNavigate()) return;
      const sp = new URLSearchParams(searchParams.toString());
      if (next === "latest") sp.delete("tradeState");
      else sp.set("tradeState", next);
      const qs = sp.toString();
      void router.replace(qs ? `/home?${qs}` : "/home", { scroll: false });
      setAllSortOpen(false);
    },
    [router, searchParams, tradeState, guardBeforeNavigate]
  );

  const updateAllSortMenuPos = useCallback(() => {
    const el = allSortButtonRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setAllSortMenuPos({ top: rect.bottom + 6, left: rect.left });
  }, []);

  useEffect(() => {
    if (loading || tabs.length < 2) return;
    if (isConstrainedNetwork()) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    const idleId = scheduleWhenBrowserIdle(() => {
      for (const tab of tabs) {
        if (tab.href && !tab.isActive) {
          void router.prefetch(tab.href);
        }
      }
    }, 450);
    return () => cancelScheduledWhenBrowserIdle(idleId);
  }, [loading, tabs, router]);

  useLayoutEffect(() => {
    const activeTab = tabs.find((t) => t.isActive);
    const el = activeTab ? tabRefs.current[activeTab.key] : null;
    if (el) {
      el.scrollIntoView({ inline: "center", block: "nearest" });
    }
  }, [tabs]);

  useEffect(() => {
    if (!allSortOpen) return;
    updateAllSortMenuPos();
    const onResize = () => updateAllSortMenuPos();
    const onScroll = () => updateAllSortMenuPos();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (allSortButtonRef.current?.contains(target) || allSortMenuRef.current?.contains(target)) return;
      setAllSortOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAllSortOpen(false);
    };
    window.addEventListener("resize", onResize);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [allSortOpen, updateAllSortMenuPos]);

  const loadingBlock = (
    <p className={`${Sam.text.bodySecondary} py-3`} aria-live="polite">
      로딩…
    </p>
  );

  const errorBlock = (
    <p className={`${Sam.text.bodySecondary} py-3 text-sam-danger`} role="alert">
      {error}
    </p>
  );

  const scrollBody =
    loading ? loadingBlock : error ? errorBlock : (
      <HorizontalDragScroll
        className={`${Sam.tabs.barScroll} min-w-0 max-w-full`}
        style={{ WebkitOverflowScrolling: "touch" }}
        role="tablist"
        aria-label="TRADE 메뉴"
      >
        {tabs.map((tab) => {
          if (tab.key === "all") {
            if (pathname === "/home") {
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected
                  aria-haspopup="listbox"
                  aria-expanded={allSortOpen}
                  ref={allSortButtonRef}
                  onClick={() => setAllSortOpen((v) => !v)}
                  className={`${Sam.tabs.tabActive} inline-flex items-center gap-1.5 rounded-sam-sm bg-sam-primary-soft px-2.5`}
                >
                  <span className="block min-w-0 max-w-[min(10rem,36vw)] truncate px-0.5">{allSortLabel}</span>
                  {allSortOpen ? (
                    <ChevronUp className="h-3.5 w-3.5 shrink-0 text-sam-primary" strokeWidth={2.4} aria-hidden />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sam-primary" strokeWidth={2.4} aria-hidden />
                  )}
                </button>
              );
            }
            return (
              <Link
                key={tab.key}
                href={allHref}
                ref={(el) => {
                  tabRefs.current[tab.key] = el;
                }}
                role="tab"
                aria-selected={tab.isActive}
                prefetch={false}
                className={tab.isActive ? Sam.tabs.tabActive : Sam.tabs.tab}
                onClick={(e) => {
                  if (!tab.isActive && !guardBeforeNavigate()) e.preventDefault();
                }}
              >
                <span className="block min-w-0 max-w-[min(10rem,36vw)] truncate px-0.5">전체</span>
              </Link>
            );
          }
          return (
            <Link
              key={tab.key}
              href={tab.href}
              ref={(el) => {
                tabRefs.current[tab.key] = el;
              }}
              role="tab"
              aria-selected={tab.isActive}
              prefetch
              className={tab.isActive ? Sam.tabs.tabActive : Sam.tabs.tab}
              onClick={(e) => {
                if (!tab.isActive && !guardBeforeNavigate()) e.preventDefault();
              }}
            >
              <span className="block min-w-0 max-w-[min(10rem,36vw)] truncate px-0.5">{tab.label}</span>
            </Link>
          );
        })}
      </HorizontalDragScroll>
    );

  if (embedInAppHeader) {
    return (
      <div className="min-w-0 overflow-x-hidden border-t border-sam-border-soft bg-sam-surface">
        <div className={APP_MAIN_HEADER_INNER_CLASS}>{scrollBody}</div>
        {allSortOpen && allSortMenuPos && typeof document !== "undefined"
          ? createPortal(
              <ul
                ref={allSortMenuRef}
                role="listbox"
                aria-label="거래 전체 정렬"
                className="min-w-[10rem] rounded-sam-md border border-sam-border bg-sam-surface py-1 shadow-sam-elevated"
                style={{ position: "fixed", top: allSortMenuPos.top, left: allSortMenuPos.left, zIndex: 200 }}
              >
                {[
                  { key: "latest", label: "최신순" },
                  { key: "active", label: "판매중" },
                  { key: "reserved", label: "예약중" },
                  { key: "sold", label: "거래 완료" },
                ].map((opt) => (
                  <li key={opt.key} role="none">
                    <button
                      type="button"
                      role="option"
                      aria-selected={tradeState === opt.key}
                      onClick={() => setTradeState(opt.key as "latest" | "active" | "reserved" | "sold")}
                      className="block w-full px-3 py-2 text-left text-[13px] font-semibold text-sam-fg transition hover:bg-sam-surface-muted"
                    >
                      {opt.label}
                    </button>
                  </li>
                ))}
              </ul>,
              document.body
            )
          : null}
      </div>
    );
  }

  return (
    <div className="relative flex min-w-0 flex-shrink-0 flex-col overflow-x-hidden border-b border-sam-border bg-sam-surface">
      <div className={APP_MAIN_HEADER_INNER_CLASS}>{scrollBody}</div>
    </div>
  );
}

export function TradePrimaryTabs(props: TradePrimaryTabsProps) {
  const { embed = false, embedInAppHeader = false } = props;
  if (!embed && !embedInAppHeader) {
    return null;
  }
  return (
    <Suspense fallback={<TradePrimaryTabsFallback embedInAppHeader={Boolean(embedInAppHeader)} />}>
      <TradePrimaryTabsInner {...props} />
    </Suspense>
  );
}
