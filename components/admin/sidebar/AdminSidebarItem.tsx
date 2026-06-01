"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminMenuItem } from "../admin-menu";
import { getMenuStatus, getMenuDisplayTitle } from "@/lib/admin-menu-status";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";
import { isLeafMenuActive } from "./admin-sidebar-active-path";

const STORE_POINT_CHARGES_MENU_KEY = "store-point-charges-admin";

function isPathActive(path: string | undefined, currentPath: string): boolean {
  if (!path) return false;
  return currentPath === path || currentPath.startsWith(`${path}/`);
}

function hasActiveChild(item: AdminMenuItem, currentPath: string): boolean {
  if (!item.children?.length) return false;
  return item.children.some(
    (c) => isPathActive(c.path, currentPath) || hasActiveChild(c, currentPath)
  );
}

export function AdminSidebarItem({
  item,
  currentPath,
  depth = 0,
  /** 같은 사이드바 그룹 내 path 집합 — 있으면 leaf 활성은 '가장 긴 prefix 일치'만 true */
  pathsScope,
}: {
  item: AdminMenuItem;
  currentPath: string;
  depth?: number;
  pathsScope?: string[];
}) {
  const { tt, t } = useI18n();
  const { pendingCount } = useAdminStorePointPendingCount();
  const hasChildren = item.children && item.children.length > 0;
  const menuBadge =
    item.key === STORE_POINT_CHARGES_MENU_KEY && pendingCount > 0 ? pendingCount : 0;

  const isActive = isPathActive(item.path, currentPath);
  const childActive = hasActiveChild(item, currentPath);
  const [open, setOpen] = useState(isActive || childActive);

  const pending = item.pendingRoute === true;
  const status = getMenuStatus(item);
  const displayTitle = getMenuDisplayTitle(item.titleKey ? t(item.titleKey) : tt(item.title), status);

  const padding = depth === 0 ? "pl-3" : depth === 1 ? "pl-5" : "pl-7";
  const baseLinkClass = `block rounded-ui-rect py-2 pr-3 sam-text-body whitespace-nowrap ${padding}`;
  /** Admin sidebar는 dark green surface 안에서 gold active / white inactive를 고정한다. */
  const activeClass = "admin-sidebar__item-active font-semibold";
  const inactiveClass = pending
    ? "admin-sidebar__item-inactive font-medium opacity-70"
    : "admin-sidebar__item-inactive font-medium";

  const leafIsActive =
    pathsScope && pathsScope.length > 0 && item.path
      ? isLeafMenuActive(item.path, currentPath, pathsScope)
      : isPathActive(item.path, currentPath);

  const linkClass = `${baseLinkClass} ${leafIsActive ? activeClass : inactiveClass}`;

  const groupLabelClass = `flex-1 sam-text-body whitespace-nowrap min-w-0 text-left ${
    isActive || childActive
      ? "admin-sidebar__group-active font-bold"
      : pending
        ? "admin-sidebar__group-inactive font-medium opacity-70"
        : "admin-sidebar__group-inactive font-medium"
  }`;

  const groupRowClass =
    isActive || childActive
      ? "admin-sidebar__group-active"
      : "admin-sidebar__group-inactive";

  const toggleOpen = () => setOpen((o) => !o);

  if (hasChildren) {
    return (
      <div className="py-0.5">
        <div className={`flex items-center rounded-ui-rect pl-3 pr-2 py-2 ${groupRowClass}`}>
          {item.path ? (
            <Link
              href={item.path}
              className={`${groupLabelClass} cursor-pointer`}
              onClick={(e) => {
                e.preventDefault();
                toggleOpen();
              }}
            >
              {displayTitle}
            </Link>
          ) : (
            <button
              type="button"
              className={`${groupLabelClass} cursor-pointer border-0 bg-transparent p-0 font-inherit`}
              onClick={toggleOpen}
            >
              {displayTitle}
            </button>
          )}
          <button
            type="button"
            onClick={toggleOpen}
            className="admin-sidebar__toggle shrink-0 rounded p-1 sam-text-body font-semibold"
            aria-expanded={open}
            aria-label={open ? t("common_close_submenu") : t("common_open_submenu")}
          >
            {open ? "▲" : "▼"}
          </button>
        </div>
        {open && (
          <div className="mt-0.5 ml-3 border-l border-white/15 pl-1">
            {item.children!.map((child) => (
              <AdminSidebarItem
                key={child.key}
                item={child}
                currentPath={currentPath}
                depth={depth + 1}
                pathsScope={pathsScope}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!item.path) return null;

  return (
    <div className="py-0.5">
      <Link href={item.path} className={`${linkClass} flex items-center justify-between gap-2`}>
        <span className="truncate">{displayTitle}</span>
        {menuBadge > 0 ? (
          <span className="shrink-0 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
            {menuBadge > 99 ? "99+" : menuBadge}
          </span>
        ) : null}
      </Link>
    </div>
  );
}
