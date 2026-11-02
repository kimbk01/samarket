"use client";

import type { ReactNode } from "react";
import { Sam } from "@/lib/ui/css-vars";

export type MyTabItem<T extends string> = {
  id: T;
  label: ReactNode;
  /** 탭 옆 보조 숫자·문구 (예: 받은 제안 대기 2) */
  accessory?: ReactNode;
  testId?: string;
};

/**
 * 내정보 하위 화면 탭 1종 (분류 설계 2026-11-02 §2.2) — 밑줄형 `sam-tabs`.
 * 4개 이하 = 균등 폭, 5개 이상 = 가로 스크롤. 탭 이름은 자르지 않는다(줄바꿈 없이 스크롤).
 */
export function MyTabs<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  items: readonly MyTabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const scroll = items.length > 4;
  return (
    <div
      className={`${scroll ? Sam.tabs.barScroll : Sam.tabs.bar} ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
      data-my-tabs
    >
      {items.map((it) => {
        const selected = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(it.id)}
            data-testid={it.testId}
            className={`${selected ? Sam.tabs.tabActive : Sam.tabs.tab} whitespace-nowrap ${scroll ? "" : "flex-1"}`}
          >
            {it.label}
            {it.accessory != null ? <span className="ml-1 opacity-80">{it.accessory}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
