"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import type {
  BusinessAdminSidebarItem,
  BusinessAdminSidebarSection,
} from "@/lib/business/business-admin-nav";
import { isBusinessAdminNavHrefActive } from "@/lib/business/business-admin-nav";
import { resolveOwnerHubMenuIcon } from "@/lib/business/owner-hub-menu-icons";
import {
  emitOwnerBasicInfoLeave,
  getOwnerBasicInfoDirty,
  isOwnerStoreAdminDirtyGuardPath,
} from "@/lib/business/owner-basic-info-guard";

export function BusinessAdminSidebar({
  sections,
  pathname,
  onNavigate,
  onDirtyNavBlocked,
  className = "",
}: {
  sections: BusinessAdminSidebarSection[];
  pathname: string;
  onNavigate?: () => void;
  /** 미저장 이탈을 막아 사이드 링크 기본 이동을 취소했을 때(예: 모바일 드로어 닫기) */
  onDirtyNavBlocked?: () => void;
  className?: string;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, item: BusinessAdminSidebarItem) => {
    /* Drawer 닫기와 레이아웃 전환(hub)이 겹치면 Link 기본 동작이 끊기는 경우가 있어 대시보드만 명시 이동 */
    if (item.label === "대시보드") {
      if (isOwnerStoreAdminDirtyGuardPath(pathname) && getOwnerBasicInfoDirty()) {
        e.preventDefault();
        emitOwnerBasicInfoLeave({ href: item.href, kind: "sidebar" });
        onDirtyNavBlocked?.();
        return;
      }
      e.preventDefault();
      router.push(item.href);
      queueMicrotask(() => onNavigate?.());
      return;
    }
    if (isOwnerStoreAdminDirtyGuardPath(pathname) && getOwnerBasicInfoDirty()) {
      e.preventDefault();
      emitOwnerBasicInfoLeave({ href: item.href, kind: "sidebar" });
      onDirtyNavBlocked?.();
      return;
    }
    onNavigate?.();
  };

  return (
    <nav
      className={`flex flex-col gap-3 bg-[var(--biz-card-bg)] ${className}`}
      aria-label="매장 어드민 메뉴"
    >
      {sections.map((section) => (
        <section
          key={section.title}
          className="rounded-ui-rect border border-sam-border-soft bg-[var(--biz-card-bg)] p-1.5"
          aria-labelledby={`biz-admin-nav-${section.title}`}
        >
          <h2
            id={`biz-admin-nav-${section.title}`}
            className="px-2.5 pb-1 pt-1.5 sam-text-xxs font-bold uppercase tracking-wide text-sam-meta"
          >
            {section.title}
          </h2>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isBusinessAdminNavHrefActive(item.href, pathname, searchParams);
              const isExternal = item.href.startsWith("/stores/");
              const Icon = resolveOwnerHubMenuIcon(item.label);
              const common =
                "flex items-center justify-between gap-2 rounded-ui-rect px-2.5 py-2.5 sam-text-body font-medium transition-colors";
              const activeCls = active
                ? "bg-[#dbedf5] font-semibold text-sam-fg ring-1 ring-inset ring-sam-border-soft"
                : "text-sam-fg hover:bg-sam-surface-muted";
              const iconCls = active ? "text-signature" : "text-sam-muted";
              const inner = (
                <>
                  <span className="flex min-w-0 flex-1 items-start gap-2.5">
                    <Icon className={`mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 ${iconCls}`} strokeWidth={2} aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate">{item.label}</span>
                      {item.description ? (
                        <span className="mt-0.5 block truncate text-[11px] font-normal leading-snug text-sam-muted">
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {item.badge != null && item.badge > 0 ? (
                      <span className="inline-flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 sam-text-xxs font-bold text-white">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-sam-muted">
                      상세
                      <ChevronRight className="h-3 w-3" aria-hidden />
                    </span>
                  </span>
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
        </section>
      ))}
    </nav>
  );
}
