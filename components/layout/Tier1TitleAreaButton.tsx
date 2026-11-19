"use client";

import { ChevronDown, MapPin } from "lucide-react";

/**
 * 1단 제목 뒤 「📍 동네 ⌄」 버튼 — 앞 표시 = 지도 핀 16px · 선 2.4 · 글자와 같은 색
 *   (Owner 2026-11-19 「지역 부분에 지도 아이콘」 시안 1-1 `docs/audit/header-title-tabs-2026-11-19/design.html` 「그대로 구현」).
 * 정보교환·거래 공용 모양 (Owner 「3판대로 구현」 2026-11-12, 시안 N3).
 * - 동네만 볼 때(`active`) = 브랜드 초록, 전체 볼 때 = 회색 #8a8a8a (시안 1-1 표 값, Owner 2026-11-19 「시안대로 정확히」)
 * - 글자 = 제목과 같은 크기(`--sector-header-title-size`, 하위 화면 17px · 대표 헤더 20px)·600 (Owner 2026-11-13 「주소가 있는 부분도 제목의 크기로 일치」, 헤더 SSOT S8). 제목은 자르지 않고, 칸이 모자라면 동네 이름 끝만 「…」(영문 아주 긴 시·군 이름, 시트에 전체 이름)
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
      className={`inline-flex min-w-0 items-center gap-[3px] py-1 text-[length:var(--sector-header-title-size,17px)] font-semibold leading-none [-webkit-tap-highlight-color:transparent] transition-[transform,opacity] duration-100 ease-out active:scale-[0.97] active:opacity-85 motion-reduce:transition-none motion-reduce:active:scale-100 ${
        active ? "text-sam-primary" : "text-[#8a8a8a]"
      }`}
    >
      <MapPin className="h-4 w-4 shrink-0" strokeWidth={2.4} aria-hidden data-tier1-title-area-pin="" />
      <span className="min-w-0 truncate">{label}</span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
    </button>
  );
}

/** 1단 제목 + 동네 버튼 한 줄 — 제목은 줄이지 않는다. 제목·동네 간격 10px (시안 1-1: 제목과 지역을 띄움) */
export function Tier1TitleWithArea({ title, area }: { title: string; area: React.ReactNode }) {
  return (
    <span className="flex min-w-0 max-w-full items-center gap-2.5" data-tier1-title-with-area>
      <span className="shrink-0 whitespace-nowrap">{title}</span>
      {area}
    </span>
  );
}
