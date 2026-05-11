"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  BusinessAdminSidebarItem,
  BusinessAdminSidebarSection,
} from "@/lib/business/business-admin-nav";
import { isBusinessAdminNavHrefActive } from "@/lib/business/business-admin-nav";

export function BusinessAdminSidebar({
  sections,
  pathname,
  onNavigate,
  className = "",
}: {
  sections: BusinessAdminSidebarSection[];
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, item: BusinessAdminSidebarItem) => {
    /* Drawer 닫기와 레이아웃 전환(hub)이 겹치면 Link 기본 동작이 끊기는 경우가 있어 대시보드만 명시 이동 */
    if (item.label === "대시보드") {
      e.preventDefault();
      router.push(item.href);
      queueMicrotask(() => onNavigate?.());
      return;
    }
    onNavigate?.();
  };

  return (
    <nav className={`flex flex-col gap-6 ${className}`} aria-label="매장 어드민 메뉴">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 sam-text-xxs font-bold uppercase tracking-wide text-sam-meta">{section.title}</p>
          <ul className="mt-1.5 space-y-0.5">
            {section.items.map((item) => {
              const active = isBusinessAdminNavHrefActive(item.href, pathname, searchParams);
              const isExternal = item.href.startsWith("/stores/");
              const common =
                "flex items-center justify-between gap-2 rounded-ui-rect px-3 py-2.5 sam-text-body font-medium transition-colors";
              const activeCls = active ? "bg-[#E7F3FF] text-[#1877F2]" : "text-sam-fg hover:bg-sam-surface-muted";
              const inner = (
                <>
                  <span className="min-w-0 truncate">{item.label}</span>
                  {item.badge != null && item.badge > 0 ? (
                    <span className="inline-flex min-h-[20px] min-w-[20px] shrink-0 items-center justify-center rounded-full bg-red-600 px-1 sam-text-xxs font-bold text-white">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </>
              );
              if (isExternal) {
                return (
                  <li key={item.label + item.href}>
                    <Link
                      href={item.href}
                      className={`${common} ${activeCls}`}
                      onClick={(e) => handleNavClick(e, item)}
                    >
                      {inner}
                    </Link>
                  </li>
                );
              }
              return (
                <li key={item.label + item.href}>
                  <Link
                    href={item.href}
                    className={`${common} ${activeCls}`}
                    onClick={(e) => handleNavClick(e, item)}
                    aria-current={active ? "page" : undefined}
                  >
                    {inner}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
