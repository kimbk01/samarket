"use client";

import type { ButtonHTMLAttributes, MouseEvent } from "react";
import {
  APP_BACK_CHEVRON_CLASS,
  APP_BACK_CHEVRON_PATH,
  APP_BACK_CHEVRON_STROKE,
  APP_BACK_CHEVRON_VIEWBOX,
} from "@/lib/ui/app-back-glyph";
import { SECTOR_HEADER_BACK_ROUND_CLASS } from "@/lib/ui/sector-header-classes";
import { headerBackPressHandlers, playHeaderBackPressSound } from "@/lib/ui/header-back-press-feedback";

/** 원형 뒤로 버튼의 ‹ — 잉크 중심이 24 상자 정중앙인 SVG 꺾쇠 (`lib/ui/app-back-glyph.ts`) */
export function AppBackChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={[APP_BACK_CHEVRON_CLASS, className].filter(Boolean).join(" ")}
      viewBox={APP_BACK_CHEVRON_VIEWBOX}
      fill="none"
      stroke="currentColor"
      strokeWidth={APP_BACK_CHEVRON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={APP_BACK_CHEVRON_PATH} />
    </svg>
  );
}

type HeaderBackRoundButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  /** 버튼(터치 상자) 크기·색 클래스 — 원 36 은 이 상자 가운데 */
  className?: string;
};

/**
 * 헤더 뒤로 원형 버튼 — 원 36·눌림·소리·SVG 꺾쇠 한 부품
 * (Owner 「기본값대로 구현」 2026-11-16, 설계 docs/design/header-back-round-design-2026-11-16.md).
 * 이동은 각 화면의 `onClick` 그대로 — 이 부품은 모양·눌림·소리만 맡는다.
 * 공용 이동 규칙이 필요한 곳은 `AppBackButton` 을 쓴다(같은 클래스·같은 눌림·같은 소리).
 */
export function HeaderBackRoundButton({ className, onClick, children, ...rest }: HeaderBackRoundButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      {...headerBackPressHandlers}
      className={[className, SECTOR_HEADER_BACK_ROUND_CLASS].filter(Boolean).join(" ")}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        playHeaderBackPressSound(e);
        onClick?.(e);
      }}
    >
      {children ?? <AppBackChevronIcon />}
    </button>
  );
}
