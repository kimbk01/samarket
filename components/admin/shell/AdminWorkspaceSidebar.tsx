"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  filterMenuForPublicSidebar,
  type AdminMenuItem,
} from "@/components/admin/admin-menu";
import { AdminSidebarGroup } from "@/components/admin/sidebar/AdminSidebarGroup";
import { AdminSidebarItem } from "@/components/admin/sidebar/AdminSidebarItem";
import { collectMenuPathEntries } from "@/components/admin/sidebar/admin-sidebar-active-path";
import type { AdminWorkspaceDescriptor } from "@/lib/admin/admin-workspace-routing";

export function AdminWorkspaceSidebar({
  workspace,
  currentPath,
  compact = false,
  isDrawerOpen = false,
  onClose,
  onNavigate,
  roleLabel,
}: {
  workspace: AdminWorkspaceDescriptor;
  currentPath: string;
  /** Rail mode — labels truncated */
  compact?: boolean;
  isDrawerOpen?: boolean;
  onClose?: () => void;
  onNavigate?: (path: string) => void;
  roleLabel?: string;
}) {
  const { t } = useI18n();
  const sections = useMemo(
    () => filterMenuForPublicSidebar(workspace.item.children ?? []),
    [workspace.item.children]
  );
  const homeOnly = !sections.length && workspace.item.path;

  /** 강조 판정 범위 = 워크스페이스 전체 (섹션별로 따로 고르면 두 메뉴가 동시에 강조됐다) */
  const pathsScope = useMemo(() => {
    if (homeOnly && workspace.item.path) return [{ path: workspace.item.path }];
    return collectMenuPathEntries(sections);
  }, [homeOnly, sections, workspace.item.path]);

  const asideClass = [
    "admin-sidebar admin-workspace-sidebar flex h-full min-h-0 max-h-full shrink-0 flex-col border-r",
    compact ? "admin-workspace-sidebar--compact" : "admin-workspace-sidebar--expanded",
    isDrawerOpen ? "admin-sidebar--open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <aside className={asideClass} data-admin-sidebar-compact={compact ? "1" : "0"}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="admin-sidebar__header flex shrink-0 items-center border-b px-3 py-3">
          <Link
            href={workspace.rootPath}
            prefetch={false}
            className="admin-sidebar__brand sam-text-section-title truncate"
            title={t(workspace.titleKey)}
            onClick={() => {
              onNavigate?.(workspace.rootPath);
              onClose?.();
            }}
          >
            {compact ? t(workspace.titleKey).slice(0, 2) : t(workspace.titleKey)}
          </Link>
        </div>
        <nav className="admin-sidebar__nav min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 py-3 [-webkit-overflow-scrolling:touch] pb-[max(0.75rem,var(--safe-bottom))]">
          {homeOnly && workspace.item.path ? (
            <AdminSidebarItem
              item={workspace.item}
              currentPath={currentPath}
              depth={0}
              pathsScope={pathsScope}
              onClose={onClose}
              onNavigate={onNavigate}
            />
          ) : null}
          {sections.map((item: AdminMenuItem) =>
            item.children?.length ? (
              <AdminSidebarGroup
                key={item.key}
                item={item as AdminMenuItem & { children: AdminMenuItem[] }}
                currentPath={currentPath}
                pathsScope={pathsScope}
                onClose={onClose}
                onNavigate={onNavigate}
              />
            ) : (
              <AdminSidebarItem
                key={item.key}
                item={item}
                currentPath={currentPath}
                depth={0}
                pathsScope={pathsScope}
                onClose={onClose}
                onNavigate={onNavigate}
              />
            )
          )}
        </nav>
        {roleLabel ? (
          <div className="shrink-0 border-t border-white/10 px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-white/55">
            {roleLabel}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
