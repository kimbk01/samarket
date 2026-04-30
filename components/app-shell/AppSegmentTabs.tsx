"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useRef } from "react";
import { Sam } from "@/lib/ui/sam-component-classes";

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
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const norm = pathname.split("?")[0] ?? "";
  const prefetchAtRef = useRef<Record<string, number>>({});

  const prefetchHref = (href: string, active: boolean) => {
    if (active) return;
    const now = Date.now();
    const last = prefetchAtRef.current[href] ?? 0;
    if (now - last < 8_000) return;
    prefetchAtRef.current[href] = now;
    void router.prefetch(href);
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
            role="tab"
            aria-selected={active}
            onPointerEnter={() => {
              prefetchHref(t.href, active);
            }}
            onFocus={() => {
              prefetchHref(t.href, active);
            }}
            onTouchStart={() => {
              prefetchHref(t.href, active);
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
