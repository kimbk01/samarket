"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";
import { prewarmBottomNavTapHrefResolvingStoresRegion } from "@/lib/main-menu/bottom-nav-prewarm-href";
import { useRegion } from "@/contexts/RegionContext";

export type AppSegmentTabItem = {
  key: string;
  label: string;
  href: string;
  /** 없으면 `href` 의 path 부분으로 prefix 판정 */
  matchPrefix?: string;
  /** `prefix`(기본): 하위 경로까지 활성 / `exact`: path 정확히 일치만 */
  pathMatch?: "prefix" | "exact";
};

export type AppSegmentTabsProps = {
  tabs: readonly AppSegmentTabItem[];
  className?: string;
  scroll?: boolean;
};

/**
 * 2단 세그먼트 탭 — `sam-tabs` / `sam-tab` 단일 규칙(밑줄 활성).
 */
export function AppSegmentTabs({ tabs, className, scroll = false }: AppSegmentTabsProps) {
  const pathname = usePathname() ?? "";
  const { primaryRegion } = useRegion();
  const primaryRegionRef = useRef(primaryRegion);
  useLayoutEffect(() => {
    primaryRegionRef.current = primaryRegion;
  }, [primaryRegion]);
  const norm = pathname.split("?")[0] ?? "";
  const prefetchAtRef = useRef<Record<string, number>>({});

  const prewarmHref = (href: string, active: boolean) => {
    if (active) return;
    const now = Date.now();
    const last = prefetchAtRef.current[href] ?? 0;
    if (now - last < 8_000) return;
    prefetchAtRef.current[href] = now;
    try {
      prewarmBottomNavTapHrefResolvingStoresRegion(href, primaryRegionRef.current);
    } catch {
      /* noop */
    }
  };

  return (
    <div className={`${scroll ? Sam.tabs.barScroll : Sam.tabs.bar} ${className ?? ""}`.trim()} role="tablist">
      {tabs.map((t) => {
        const hrefPath = (t.href.split("?")[0] ?? "").replace(/\/+$/, "") || "/";
        const prefix = (t.matchPrefix ?? hrefPath).replace(/\/+$/, "") || "/";
        const p = norm.replace(/\/+$/, "") || "/";
        const mode = t.pathMatch ?? "prefix";
        const active =
          mode === "exact"
            ? p === prefix
            : p === prefix || (prefix !== "/" && p.startsWith(`${prefix}/`));
        return (
          <Link
            key={t.key}
            href={t.href}
            prefetch={false}
            role="tab"
            aria-selected={active}
            onPointerEnter={() => {
              prewarmHref(t.href, active);
            }}
            onFocus={() => {
              prewarmHref(t.href, active);
            }}
            onTouchStart={() => {
              prewarmHref(t.href, active);
            }}
            className={active ? Sam.tabs.tabActive : Sam.tabs.tab}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
