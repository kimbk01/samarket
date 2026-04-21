"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { BusinessAdminSidebarSection } from "@/lib/business/business-admin-nav";

function isNavActive(href: string, pathname: string, searchParams: URLSearchParams): boolean {
  const [path, rawQ = ""] = href.split("?");
  const norm = (v: string) => v.replace(/\/+$/, "") || "/";
  const targetPath = norm(path);
  const currentPath = norm(pathname);

  if (href.startsWith("/stores/")) {
    return currentPath === targetPath;
  }
  if (targetPath === "/my/business") {
    return currentPath === "/my/business";
  }
  if (currentPath !== targetPath) return false;
  const tq = new URLSearchParams(rawQ);
  const tSid = tq.get("storeId");
  if (tSid) {
    return searchParams.get("storeId") === tSid;
  }
  return true;
}

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

  return (
    <nav className={`flex flex-col gap-6 ${className}`} aria-label="매장 어드민 메뉴">
      {sections.map((section) => (
        <div key={section.title}>
          <p className="px-3 sam-text-xxs font-bold uppercase tracking-wide text-sam-meta">{section.title}</p>
          <ul className="mt-1.5 space-y-0.5">
            {section.items.map((item) => {
              const active = isNavActive(item.href, pathname, searchParams);
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
                    <Link href={item.href} className={`${common} ${activeCls}`} onClick={onNavigate}>
                      {inner}
                    </Link>
                  </li>
                );
              }
              return (
                <li key={item.label + item.href}>
                  <Link href={item.href} className={`${common} ${activeCls}`} onClick={onNavigate} aria-current={active ? "page" : undefined}>
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
