"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminSidebarItem } from "./AdminSidebarItem";
import type { AdminMenuItem } from "../admin-menu";
import { getMenuStatus, getMenuDisplayTitle } from "@/lib/admin-menu-status";
import {
  collectMenuPaths,
  hasActiveDescendantInMenu,
} from "./admin-sidebar-active-path";

/** 그룹(children 있는 메뉴): 접기/펼치기 — active 하위가 있으면 기본 펼침 */
export function AdminSidebarGroup({
  item,
  currentPath,
  onClose,
  onNavigate,
}: {
  item: AdminMenuItem & { children: AdminMenuItem[] };
  currentPath: string;
  onClose?: () => void;
  onNavigate?: (path: string) => void;
}) {
  const { t, tt } = useI18n();
  const status = getMenuStatus(item);
  const displayTitle = getMenuDisplayTitle(item.titleKey ? t(item.titleKey) : tt(item.title), status);
  const pathsScope = collectMenuPaths(item.children);
  const childActive = hasActiveDescendantInMenu(item.children, currentPath);
  const [open, setOpen] = useState(childActive);

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  const toggleOpen = () => setOpen((o) => !o);

  const titleRowClass = `admin-sidebar__group-title mb-2 flex w-full items-center gap-1 rounded-ui-rect px-3 py-2 ${
    childActive ? "admin-sidebar__group-active" : "admin-sidebar__group-inactive"
  }`;

  return (
    <div className="mb-2">
      <button
        type="button"
        className={`${titleRowClass} cursor-pointer border-0 bg-transparent text-left font-inherit`}
        onClick={toggleOpen}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 font-bold tracking-wide uppercase">{displayTitle}</span>
        <span className="admin-sidebar__toggle shrink-0 rounded p-1 sam-text-body font-semibold" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>
      {open ? (
        <div className="space-y-0">
          {item.children.map((child) => (
            <AdminSidebarItem
              key={child.key}
              item={child}
              currentPath={currentPath}
              depth={0}
              pathsScope={pathsScope}
              onClose={onClose}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
