"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminMenuItem } from "../admin-menu";
import { getMenuStatus, getMenuDisplayTitle } from "@/lib/admin-menu-status";
import { isLeafMenuActive } from "./admin-sidebar-active-path";

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
  const hasChildren = item.children && item.children.length > 0;

  const isActive = isPathActive(item.path, currentPath);
  const childActive = hasActiveChild(item, currentPath);
  const [open, setOpen] = useState(isActive || childActive);

  const pending = item.pendingRoute === true;
  const status = getMenuStatus(item);
  const displayTitle = getMenuDisplayTitle(item.titleKey ? t(item.titleKey) : tt(item.title), status);

  const padding = depth === 0 ? "pl-3" : depth === 1 ? "pl-5" : "pl-7";
  const baseLinkClass = `block rounded-ui-rect py-2 pr-3 sam-text-body whitespace-nowrap ${padding}`;
  /** `text-signature`는 OS 다크에서 밝은 파랑+연한 배경 대비가 무너짐 — 본문색+프라이머리 틴트로 통일 */
  const activeClass =
    "bg-sam-primary/14 font-semibold text-sam-fg shadow-sm ring-1 ring-inset ring-sam-primary/20";
  const inactiveClass = pending
    ? "font-medium text-sam-meta hover:bg-sam-app hover:text-sam-muted"
    : "font-medium text-sam-fg hover:bg-sam-surface-muted hover:text-sam-fg";

  const leafIsActive =
    pathsScope && pathsScope.length > 0 && item.path
      ? isLeafMenuActive(item.path, currentPath, pathsScope)
      : isPathActive(item.path, currentPath);

  const linkClass = `${baseLinkClass} ${leafIsActive ? activeClass : inactiveClass}`;

  const groupLabelClass = `flex-1 sam-text-body whitespace-nowrap min-w-0 text-left ${
    isActive || childActive
      ? "font-bold text-sam-fg"
      : pending
        ? "font-medium text-sam-meta"
        : "font-medium text-sam-fg"
  }`;

  const groupRowClass =
    isActive || childActive
      ? "bg-sam-primary/12 shadow-sm ring-1 ring-inset ring-sam-primary/18"
      : "hover:bg-sam-surface-muted";

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
            className="shrink-0 rounded p-1 sam-text-body font-semibold text-sam-muted hover:bg-sam-border-soft"
            aria-expanded={open}
            aria-label={open ? t("common_close_submenu") : t("common_open_submenu")}
          >
            {open ? "▲" : "▼"}
          </button>
        </div>
        {open && (
          <div className="mt-0.5 ml-3 border-l border-sam-border pl-1">
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
      <Link href={item.path} className={linkClass}>
        {displayTitle}
      </Link>
    </div>
  );
}
