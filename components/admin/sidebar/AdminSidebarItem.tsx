"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminMenuItem } from "../admin-menu";
import { getMenuStatus, getMenuDisplayTitle } from "@/lib/admin-menu-status";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";
import {
  hasActiveDescendantInMenu,
  isLeafMenuActive,
  menuPathMatchScore,
} from "./admin-sidebar-active-path";

const STORE_POINT_CHARGES_MENU_KEY = "store-point-charges-admin";
const USER_POINT_CHARGES_MENU_KEY = "points-charge";

function itemOrChildMatches(item: AdminMenuItem, currentPath: string): boolean {
  if (item.path && menuPathMatchScore(currentPath, item.path) >= 0) return true;
  if (item.matchPaths?.some((p) => menuPathMatchScore(currentPath, p) >= 0)) return true;
  if (item.children?.length) return hasActiveDescendantInMenu(item.children, currentPath);
  return false;
}

export function AdminSidebarItem({
  item,
  currentPath,
  depth = 0,
  /** 같은 사이드바 그룹 내 path 집합 — 있으면 leaf 활성은 '가장 긴 prefix 일치'만 true */
  pathsScope,
  /** 모바일 overlay 닫기 — 링크 클릭 시 호출 */
  onClose,
  /** 메뉴 클릭 직후 active 하이라이트 */
  onNavigate,
}: {
  item: AdminMenuItem;
  currentPath: string;
  depth?: number;
  pathsScope?: string[];
  onClose?: () => void;
  onNavigate?: (path: string) => void;
}) {
  const { tt, t } = useI18n();
  const { pendingCount, userChargePendingCount, feedAdPendingCount, tradePromoPendingCount } =
    useAdminStorePointPendingCount();
  const hasChildren = item.children && item.children.length > 0;
  /** COUNT SSOT: Trade ads-applications = TRADE_PROMO_PENDING; Growth ads-feed-applications = FEED_AD_PENDING_REVIEW */
  const menuBadge =
    item.key === STORE_POINT_CHARGES_MENU_KEY && pendingCount > 0
      ? pendingCount
      : item.key === USER_POINT_CHARGES_MENU_KEY && userChargePendingCount > 0
        ? userChargePendingCount
        : item.key === "ads-applications" && tradePromoPendingCount > 0
          ? tradePromoPendingCount
          : item.key === "ads-feed-applications" && feedAdPendingCount > 0
            ? feedAdPendingCount
            : 0;

  const childActive = hasChildren
    ? hasActiveDescendantInMenu(item.children ?? [], currentPath)
    : false;
  const selfMatches = itemOrChildMatches(
    { ...item, children: undefined },
    currentPath
  );
  const [open, setOpen] = useState(childActive || selfMatches);

  useEffect(() => {
    if (childActive || selfMatches) setOpen(true);
  }, [childActive, selfMatches]);

  const pending = item.pendingRoute === true;
  const status = getMenuStatus(item);
  const displayTitle = getMenuDisplayTitle(item.titleKey ? t(item.titleKey) : tt(item.title), status);

  const padding = depth === 0 ? "pl-3" : depth === 1 ? "pl-5" : "pl-7";
  const baseLinkClass = `block rounded-sm py-2 pr-3 text-[13px] leading-5 whitespace-nowrap ${padding}`;
  const activeClass = "admin-sidebar__item-active font-semibold";
  const inactiveClass = pending
    ? "admin-sidebar__item-inactive font-medium opacity-70"
    : "admin-sidebar__item-inactive font-medium";

  const leafIsActive =
    pathsScope && pathsScope.length > 0 && item.path
      ? isLeafMenuActive(item.path, currentPath, pathsScope, item.matchPaths)
      : Boolean(item.path && menuPathMatchScore(currentPath, item.path) >= 0 && !hasChildren);

  const linkClass = `${baseLinkClass} ${leafIsActive ? activeClass : inactiveClass}`;

  /** Section/group: open indicator only — never leaf-active chrome. */
  const groupLabelClass = `flex-1 text-[12px] leading-4 tracking-wide whitespace-nowrap min-w-0 text-left ${
    childActive
      ? "admin-sidebar__group-open font-semibold"
      : pending
        ? "admin-sidebar__group-inactive font-medium opacity-70"
        : "admin-sidebar__group-inactive font-medium"
  }`;

  const groupRowClass = childActive
    ? "admin-sidebar__group-open"
    : "admin-sidebar__group-inactive";

  const toggleOpen = () => setOpen((o) => !o);

  if (hasChildren) {
    return (
      <div className="py-0.5">
        <div className={`flex items-center rounded-sm pl-3 pr-2 py-1.5 ${groupRowClass}`}>
          {item.path ? (
            <Link
              href={item.path}
              prefetch={false}
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
            className="admin-sidebar__toggle shrink-0 rounded p-1 text-[12px] font-semibold"
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
                onClose={onClose}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!item.path) return null;

  const badge =
    menuBadge > 0 ? (
      <span className="shrink-0 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
        {menuBadge > 99 ? "99+" : menuBadge}
      </span>
    ) : null;

  if (pending) {
    return (
      <div className="py-0.5">
        <span
          className={`${linkClass} flex cursor-not-allowed items-center justify-between gap-2`}
          aria-disabled="true"
          title={t("admin_trade_hub_note_page_prep")}
        >
          <span className="truncate">{displayTitle}</span>
          {badge}
        </span>
      </div>
    );
  }

  return (
    <div className="py-0.5">
      <Link
        href={item.path}
        prefetch={false}
        className={`${linkClass} flex items-center justify-between gap-2`}
        data-admin-sidebar-leaf={leafIsActive ? "active" : "idle"}
        onClick={() => {
          onNavigate?.(item.path!);
          onClose?.();
        }}
      >
        <span className="truncate">{displayTitle}</span>
        {badge}
      </Link>
    </div>
  );
}
