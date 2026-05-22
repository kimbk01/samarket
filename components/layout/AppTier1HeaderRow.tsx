"use client";

import type { ReactNode } from "react";
import {
  APP_TIER1_HEADER_ACTIONS_CLASS,
  APP_TIER1_HEADER_LAYOUT_ROW_CLASS,
  APP_TIER1_HEADER_LEADING_CLASS,
  APP_TIER1_HEADER_TITLE_IN_SLOT_CLASS,
  APP_TIER1_HEADER_TITLE_SLOT_CLASS,
} from "@/lib/layout/app-tier1-header";

/**
 * 앱 1단 헤더 행 — 뒤로(좌) · 제목(좌측 20%) · 아이콘(우).
 * 햄버거 탐색 1단은 이 컴포넌트를 쓰지 않는다.
 */
export function AppTier1HeaderRow({
  title,
  leading,
  trailing,
  titleHidden = false,
}: {
  title: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  titleHidden?: boolean;
}) {
  return (
    <div className={APP_TIER1_HEADER_LAYOUT_ROW_CLASS}>
      {leading ? <div className={APP_TIER1_HEADER_LEADING_CLASS}>{leading}</div> : null}
      <h1
        className={`${APP_TIER1_HEADER_TITLE_SLOT_CLASS}${titleHidden ? " opacity-0" : ""}`}
        aria-hidden={titleHidden}
      >
        <span className={APP_TIER1_HEADER_TITLE_IN_SLOT_CLASS}>{title}</span>
      </h1>
      {trailing ? <div className={APP_TIER1_HEADER_ACTIONS_CLASS}>{trailing}</div> : null}
    </div>
  );
}
