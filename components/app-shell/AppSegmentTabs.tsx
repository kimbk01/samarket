"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
};

/**
 * 2단 세그먼트 탭 — `sam-tabs` / `sam-tab` 단일 규칙(밑줄 활성).
 */
export function AppSegmentTabs({ tabs, className }: AppSegmentTabsProps) {
  const pathname = usePathname() ?? "";
  const norm = pathname.split("?")[0] ?? "";

  return (
    <div className={`${Sam.tabs.bar} ${className ?? ""}`.trim()} role="tablist">
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
            prefetch={false}
            className={active ? Sam.tabs.tabActive : Sam.tabs.tab}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
