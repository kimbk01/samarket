"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminSidebarItem } from "./AdminSidebarItem";
import type { AdminMenuItem } from "../admin-menu";
import { getMenuStatus, getMenuDisplayTitle } from "@/lib/admin-menu-status";
import { readSidebarGroupOpen, writeSidebarGroupOpen } from "@/lib/admin-ui-prefs";
import {
  collectMenuPathEntries,
  hasActiveDescendantInMenu,
  type MenuPathScopeEntry,
} from "./admin-sidebar-active-path";

/**
 * 그룹(children 있는 메뉴): 접기/펼치기 — active 하위가 있으면 펼침, 그 외는 운영자가 마지막에 둔 상태를 기억한다.
 * 위계(감사 UX-04): 섹션 제목 13px 굵게·흐리게 → 하위 항목 13px 을 들여쓰기 + 가이드선 안에 둔다.
 */
export function AdminSidebarGroup({
  item,
  currentPath,
  pathsScope: workspaceScope,
  onClose,
  onNavigate,
}: {
  item: AdminMenuItem & { children: AdminMenuItem[] };
  currentPath: string;
  /** 워크스페이스 전체 강조 범위 — 없으면 이 섹션만 (단독 사용 호환) */
  pathsScope?: MenuPathScopeEntry[];
  onClose?: () => void;
  onNavigate?: (path: string) => void;
}) {
  const { t, tt } = useI18n();
  const status = getMenuStatus(item);
  const displayTitle = getMenuDisplayTitle(item.titleKey ? t(item.titleKey) : tt(item.title), status);
  const pathsScope = workspaceScope ?? collectMenuPathEntries(item.children);
  const childActive = hasActiveDescendantInMenu(item.children, currentPath, pathsScope);
  const [open, setOpen] = useState(childActive);

  useEffect(() => {
    if (childActive) {
      setOpen(true);
      return;
    }
    const stored = readSidebarGroupOpen(item.key);
    if (stored != null) setOpen(stored);
  }, [childActive, item.key]);

  const toggleOpen = () => {
    const next = !open;
    setOpen(next);
    writeSidebarGroupOpen(item.key, next);
  };

  /** Section header: open cue only — never leaf-active chrome. */
  const titleRowClass = `admin-sidebar__group-title mb-1 flex w-full items-center gap-1 rounded-ui-rect px-3 py-1.5 ${
    childActive ? "admin-sidebar__group-open" : "admin-sidebar__group-inactive"
  }`;

  return (
    <div className="mb-2">
      <button
        type="button"
        className={`${titleRowClass} cursor-pointer border-0 bg-transparent text-left font-inherit`}
        onClick={toggleOpen}
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1 font-bold tracking-wide">{displayTitle}</span>
        <svg
          className={`admin-sidebar__toggle h-3 w-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <polyline points="2.5 4.5 6 8 9.5 4.5" />
        </svg>
      </button>
      {open ? (
        <div className="admin-sidebar__group-items ml-3 space-y-0 border-l pl-1.5">
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
