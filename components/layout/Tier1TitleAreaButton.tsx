"use client";

import { ChevronDown } from "lucide-react";

/**
 * 1단 제목 뒤 「· 동네 ⌄」 버튼 — 정보교환·거래 공용 모양 (Owner 「3판대로 구현」 2026-11-12, 시안 N3).
 * - 동네만 볼 때(`active`) = 브랜드 초록, 전체 볼 때 = 회색
 * - 글자 14px·굵게. 제목은 자르지 않고, 칸이 모자라면 동네 이름 끝만 「…」(영문 아주 긴 시·군 이름, 시트에 전체 이름)
 */
export function Tier1TitleAreaButton({
  label,
  active,
  ariaLabel,
  expanded,
  onClick,
}: {
  label: string;
  active: boolean;
  ariaLabel: string;
  expanded?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-tier1-title-area={active ? "on" : "off"}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={onClick}
      className={`inline-flex min-w-0 items-center gap-[3px] py-1 text-[14px] font-semibold leading-none [-webkit-tap-highlight-color:transparent] transition-[transform,opacity] duration-100 ease-out active:scale-[0.97] active:opacity-85 motion-reduce:transition-none motion-reduce:active:scale-100 ${
        active ? "text-sam-primary" : "text-sam-muted"
      }`}
    >
      <span aria-hidden className="shrink-0 font-normal text-sam-muted">
        ·
      </span>
      <span className="min-w-0 truncate">{label}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
    </button>
  );
}

/** 1단 제목 + 동네 버튼 한 줄 — 제목은 줄이지 않는다 */
export function Tier1TitleWithArea({ title, area }: { title: string; area: React.ReactNode }) {
  return (
    <span className="flex min-w-0 max-w-full items-center gap-1.5" data-tier1-title-with-area>
      <span className="shrink-0 whitespace-nowrap">{title}</span>
      {area}
    </span>
  );
}
