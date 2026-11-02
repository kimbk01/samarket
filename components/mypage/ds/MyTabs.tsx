"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Sam } from "@/lib/ui/css-vars";

export type MyTabItem<T extends string> = {
  id: T;
  label: ReactNode;
  /** 탭 옆 보조 숫자·문구 (예: 받은 제안 대기 2) */
  accessory?: ReactNode;
  testId?: string;
  /** 링크형 탭 — 주소(쿼리)로 탭을 정하는 화면 (쿠폰·상품권 지갑·고객센터 게시판) */
  href?: string;
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
  trailing,
}: {
  items: readonly MyTabItem<T>[];
  value: T;
  /** 링크형(`href`)만 쓰면 생략 */
  onChange?: (next: T) => void;
  ariaLabel?: string;
  className?: string;
  /** 같은 줄 끝에 붙는 보조 버튼(예: 진행중 거래 「포인트 홍보」 켜기·끄기) — 탭과 같은 모양, 스크롤 칸 안 */
  trailing?: ReactNode;
}) {
  const scroll = items.length + (trailing ? 1 : 0) > 4;
  return (
    <div
      className={`${scroll ? Sam.tabs.barScroll : Sam.tabs.bar} ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
      data-my-tabs
    >
      {items.map((it) => {
        const selected = it.id === value;
        const cls = `${selected ? Sam.tabs.tabActive : Sam.tabs.tab} whitespace-nowrap ${scroll ? "" : "flex-1 text-center"}`;
        if (it.href) {
          return (
            <Link
              key={it.id}
              href={it.href}
              replace
              scroll={false}
              prefetch={false}
              role="tab"
              aria-selected={selected}
              data-testid={it.testId}
              className={`${cls} inline-flex items-center justify-center`}
            >
              {it.label}
              {it.accessory != null ? <span className="ml-1 opacity-80">{it.accessory}</span> : null}
            </Link>
          );
        }
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange?.(it.id)}
            data-testid={it.testId}
            className={cls}
          >
            {it.label}
            {it.accessory != null ? <span className="ml-1 opacity-80">{it.accessory}</span> : null}
          </button>
        );
      })}
      {trailing}
    </div>
  );
}
