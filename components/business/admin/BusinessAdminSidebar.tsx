"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useOwnerAdminUrlSearchParams } from "@/lib/business/use-owner-admin-url-search-params";
import { ChevronDown, ChevronRight, UserRound } from "lucide-react";
import type {
  BusinessAdminSidebarItem,
  BusinessAdminSidebarSection,
} from "@/lib/business/business-admin-nav";
import { resolveBusinessAdminActiveNavIds } from "@/lib/business/business-admin-nav";
import { resolveOwnerHubMenuIcon } from "@/lib/business/owner-hub-menu-icons";
import {
  emitOwnerBasicInfoLeave,
  getOwnerBasicInfoDirty,
  isOwnerStoreAdminDirtyGuardPath,
} from "@/lib/business/owner-basic-info-guard";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useBusinessAdminStore } from "@/components/business/admin/business-admin-store-context";
import {
  isOwnerStorePreviewActionHref,
  openOwnerStorePreview,
} from "@/lib/business/owner-store-preview-bridge";

/** 메뉴 행 공통 — 드로어·PC 사이드바·「내 정보」 같은 모양 · 눌림 표시 (R2 2026-11-03) */
const OWNER_SIDEBAR_ROW_CLASS =
  "flex items-center justify-between gap-2 rounded-ui-rect px-2.5 py-2.5 sam-text-body font-medium transition-colors touch-manipulation select-none [-webkit-tap-highlight-color:transparent]";
const OWNER_SIDEBAR_ROW_IDLE_CLASS =
  "text-[var(--biz-text)] hover:bg-[var(--biz-tan-soft)] active:bg-[var(--biz-header-bg)]";

/** 메뉴 맨 아래 「내 정보」 — 드로어·PC 사이드바 공통 행 */
export function BusinessAdminSidebarMyLink({ onClick }: { onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void }) {
  const { t } = useI18n();
  return (
    <Link href="/my" className={`${OWNER_SIDEBAR_ROW_CLASS} ${OWNER_SIDEBAR_ROW_IDLE_CLASS}`} onClick={onClick}>
      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <UserRound className="h-[1.125rem] w-[1.125rem] shrink-0 text-[var(--biz-text-muted)]" strokeWidth={2} aria-hidden />
        <span className="block truncate">{t("store_owner_my_home_link")}</span>
      </span>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-sam-muted" aria-hidden />
    </Link>
  );
}

export function BusinessAdminSidebar({
  sections,
  pathname,
  onNavigate,
  onDirtyNavBlocked,
  className = "",
  collapsible = false,
}: {
  sections: BusinessAdminSidebarSection[];
  pathname: string;
  onNavigate?: () => void;
  /** 미저장 이탈을 막아 사이드 링크 기본 이동을 취소했을 때(예: 모바일 드로어 닫기) */
  onDirtyNavBlocked?: () => void;
  className?: string;
  /** PC 고정 사이드바(≥1280px) — 12그룹 섹션 접기/펼치기 */
  collapsible?: boolean;
}) {
  const { t } = useI18n();
  const searchParams = useOwnerAdminUrlSearchParams();
  const router = useRouter();
  const biz = useBusinessAdminStore();
  const activeIds = useMemo(
    () => resolveBusinessAdminActiveNavIds(pathname, searchParams),
    [pathname, searchParams]
  );
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, item: BusinessAdminSidebarItem) => {
    if (item.id === "public_store" || isOwnerStorePreviewActionHref(item.href)) {
      e.preventDefault();
      const slug = biz?.storeRow?.slug?.trim() ?? "";
      if (slug) openOwnerStorePreview(slug);
      onNavigate?.();
      return;
    }
    /* Drawer 닫기와 레이아웃 전환(hub)이 겹치면 Link 기본 동작이 끊기는 경우가 있어 대시보드만 명시 이동 */
    if (item.id === "dashboard") {
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
      aria-label={t("business_phase7_076")}
    >
      {sections.map((section) => {
        const headingId = `biz-admin-nav-${collapsible ? "pc-" : ""}${section.groupId}`;
        const listId = `${headingId}-list`;
        const sectionHasActive = section.items.some((i) => activeIds.has(i.id));
        const collapsed = collapsible && collapsedGroups.has(section.groupId) && !sectionHasActive;
        return (
        <section
          key={section.groupId}
          className="rounded-ui-rect border border-sam-border-soft bg-[var(--biz-card-bg)] p-1.5"
          aria-labelledby={headingId}
          data-owner-nav-group={section.groupId}
        >
          <h2
            id={headingId}
            className="px-2.5 pb-1 pt-1.5 sam-text-xxs font-bold tracking-wide text-sam-meta"
          >
            {collapsible ? (
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-ui-rect text-left"
                aria-expanded={!collapsed}
                aria-controls={listId}
                onClick={() => toggleGroup(section.groupId)}
              >
                <span>{section.title}</span>
                <ChevronDown
                  className={`h-3.5 w-3.5 shrink-0 transition-transform ${collapsed ? "-rotate-90" : ""}`}
                  aria-hidden
                />
              </button>
            ) : (
              section.title
            )}
          </h2>
          <ul id={listId} className="space-y-0.5" hidden={collapsed}>
            {section.items.map((item) => {
              const active = activeIds.has(item.id);
              const isPreviewAction =
                item.id === "public_store" || isOwnerStorePreviewActionHref(item.href);
              const Icon = resolveOwnerHubMenuIcon(item.id);
              const common = OWNER_SIDEBAR_ROW_CLASS;
              const activeCls = active
                ? "bg-[var(--biz-header-bg)] font-semibold text-[var(--biz-text)] ring-1 ring-inset ring-[var(--biz-card-border)]"
                : OWNER_SIDEBAR_ROW_IDLE_CLASS;
              const iconCls = active ? "text-[var(--biz-primary)]" : "text-[var(--biz-text-muted)]";
              /** 설명 줄·「상세」 글자 없음 — 이름 + 배지 + › 만 (설명 슬롯 금지 · R2 2026-11-03) */
              const inner = (
                <>
                  <span className="flex min-w-0 flex-1 items-center gap-2.5">
                    <Icon className={`h-[1.125rem] w-[1.125rem] shrink-0 ${iconCls}`} strokeWidth={2} aria-hidden />
                    <span className="block min-w-0 truncate">{item.label}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {item.badge != null && item.badge > 0 ? (
                      <span className="inline-flex min-h-[20px] min-w-[20px] items-center justify-center rounded-full bg-sam-danger px-1 sam-text-xxs font-bold text-sam-on-primary">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    ) : null}
                    <ChevronRight className="h-3.5 w-3.5 text-sam-muted" aria-hidden />
                  </span>
                </>
              );
              if (isPreviewAction) {
                return (
                  <li key={item.id + item.href}>
                    <button
                      type="button"
                      className={`${common} w-full text-left ${activeCls}`}
                      onClick={(e) => {
                        e.preventDefault();
                        const slug = biz?.storeRow?.slug?.trim() ?? "";
                        if (slug) openOwnerStorePreview(slug);
                        onNavigate?.();
                      }}
                    >
                      {inner}
                    </button>
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
        );
      })}
    </nav>
  );
}
