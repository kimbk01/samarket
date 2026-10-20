"use client";

/**
 * Admin 밑줄형 탭 (설계 v4 §7 「탭」) — 높이 40 · 건수 배지 · 주소(`?tab=`)에 보존 · 넘치면 탭 바 안에서 가로 스크롤.
 * 키보드: role=tablist/tab, ←/→ 이동(선택 포함) · Home/End.
 *
 * 선택값 결정: `value` 를 주면 그 값(제어형), 아니면 주소 `?{param}=` → 없거나 모르는 값이면 `defaultValue` → 첫 탭.
 * 탭을 바꾸면 `syncUrl`(기본 true) 일 때 `router.replace` 로 `param` 을 쓰고(기본 탭이면 지움) `resetParams`(기본 `page`)를 지운다.
 * `useSearchParams` 를 쓰므로 페이지에서 `<Suspense>` 안에 렌더한다.
 * 탭 패널은 호출 측이 그린다 — `adminTabPanelId(idBase, tabId)` 를 패널 `id` 로, `aria-labelledby` 는 `adminTabButtonId`.
 */

import { useCallback, useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatAdminCount } from "@/lib/admin/pagination/admin-pagination-window";

export type AdminTabItem = {
  id: string;
  label: ReactNode;
  /** 건수 배지 — null/undefined 면 숨김 */
  count?: number | null;
  disabled?: boolean;
};

export function resolveAdminTabValue(
  raw: string | null | undefined,
  tabs: readonly AdminTabItem[],
  defaultValue?: string
): string {
  const enabled = tabs.filter((t) => !t.disabled);
  const v = String(raw ?? "").trim();
  if (v && enabled.some((t) => t.id === v)) return v;
  if (defaultValue && enabled.some((t) => t.id === defaultValue)) return defaultValue;
  return enabled[0]?.id ?? "";
}

/** 키 입력 → 다음에 선택할 탭 id (비활성 탭은 건너뜀). 해당 없는 키면 null. */
export function nextAdminTabId(tabs: readonly AdminTabItem[], currentId: string, key: string): string | null {
  const enabled = tabs.filter((t) => !t.disabled);
  if (enabled.length === 0) return null;
  const idx = Math.max(0, enabled.findIndex((t) => t.id === currentId));
  switch (key) {
    case "ArrowRight":
      return enabled[(idx + 1) % enabled.length].id;
    case "ArrowLeft":
      return enabled[(idx - 1 + enabled.length) % enabled.length].id;
    case "Home":
      return enabled[0].id;
    case "End":
      return enabled[enabled.length - 1].id;
    default:
      return null;
  }
}

function safeDomId(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function adminTabButtonId(idBase: string, tabId: string): string {
  return `${safeDomId(idBase)}-tab-${safeDomId(tabId)}`;
}

export function adminTabPanelId(idBase: string, tabId: string): string {
  return `${safeDomId(idBase)}-panel-${safeDomId(tabId)}`;
}

export function AdminTabs({
  tabs,
  ariaLabel,
  param = "tab",
  value,
  defaultValue,
  onChange,
  syncUrl = true,
  resetParams = ["page"],
  idBase,
  className = "",
}: {
  tabs: readonly AdminTabItem[];
  ariaLabel: string;
  /** 주소 쿼리 키 (기본 `tab`) */
  param?: string;
  /** 제어형 선택값 */
  value?: string;
  /** 주소에 값이 없을 때 선택 (기본: 첫 탭) — 이 탭은 주소에서 생략된다 */
  defaultValue?: string;
  onChange?: (tabId: string) => void;
  syncUrl?: boolean;
  /** 탭 변경 시 함께 지울 쿼리 키 (기본 `page`) */
  resetParams?: readonly string[];
  /** 탭·패널 DOM id 접두사 (기본 useId) */
  idBase?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const autoId = useId();
  const base = idBase ?? `admin-tabs${autoId}`;
  const fallback = resolveAdminTabValue(null, tabs, defaultValue);
  const selected = value !== undefined ? value : resolveAdminTabValue(searchParams?.get(param), tabs, defaultValue);
  const listRef = useRef<HTMLDivElement | null>(null);

  const select = useCallback(
    (tabId: string) => {
      if (tabId === selected) return;
      if (syncUrl) {
        const next = new URLSearchParams(searchParams?.toString() ?? "");
        if (tabId === fallback) next.delete(param);
        else next.set(param, tabId);
        for (const k of resetParams) next.delete(k);
        const qs = next.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }
      onChange?.(tabId);
    },
    [fallback, onChange, param, pathname, resetParams, router, searchParams, selected, syncUrl]
  );

  // 선택 탭이 탭 바 밖에 있으면 보이도록 (가로 스크롤 안에서만)
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selected]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const nextId = nextAdminTabId(tabs, selected, e.key);
    if (!nextId) return;
    e.preventDefault();
    select(nextId);
    listRef.current?.ownerDocument.getElementById(adminTabButtonId(base, nextId))?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      onKeyDown={onKeyDown}
      data-admin-tabs="1"
      className={`flex h-10 items-stretch gap-1 overflow-x-auto overflow-y-hidden whitespace-nowrap border-b border-[var(--admin-console-border)] [scrollbar-width:thin] ${className}`.trim()}
    >
      {tabs.map((t) => {
        const isSel = t.id === selected;
        return (
          <button
            key={t.id}
            id={adminTabButtonId(base, t.id)}
            type="button"
            role="tab"
            aria-selected={isSel}
            aria-controls={adminTabPanelId(base, t.id)}
            tabIndex={isSel ? 0 : -1}
            disabled={t.disabled}
            data-admin-tab={t.id}
            onClick={() => select(t.id)}
            className={[
              "relative -mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 text-[14px] leading-5 transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--admin-console-accent)]",
              "disabled:cursor-not-allowed disabled:opacity-40",
              isSel
                ? "border-[var(--admin-console-accent)] font-semibold text-[var(--admin-console-fg)]"
                : "border-transparent font-medium text-[var(--admin-console-muted)] hover:text-[var(--admin-console-fg)]",
            ].join(" ")}
          >
            <span>{t.label}</span>
            {t.count != null ? (
              <span
                data-admin-tab-count="1"
                className={[
                  "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[12px] font-semibold leading-5",
                  isSel
                    ? "bg-[var(--admin-console-active-bg)] text-[var(--admin-console-accent)]"
                    : "bg-[var(--admin-console-hover)] text-[var(--admin-console-muted)]",
                ].join(" ")}
              >
                {formatAdminCount(t.count)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
