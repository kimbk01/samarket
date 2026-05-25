"use client";

import type { ReactNode } from "react";
import { SectorHeaderBar } from "@/components/layout/sector-header";

/**
 * 앱 1단 헤더 행 — 뒤로(좌) · 제목(중앙 grid) · 아이콘(우).
 * 햄버거 탐색 1단은 이 컴포넌트를 쓰지 않는다.
 */
export function AppTier1HeaderRow({
  title,
  leading,
  trailing,
  titleHidden = false,
  withSubtitle = false,
  centerAlign = "center",
}: {
  title: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  titleHidden?: boolean;
  withSubtitle?: boolean;
  centerAlign?: "center" | "left";
}) {
  return (
    <SectorHeaderBar
      withSubtitle={withSubtitle}
      centerAlign={centerAlign}
      left={leading}
      center={
        titleHidden ? (
          <span className="opacity-0" aria-hidden>
            {title}
          </span>
        ) : (
          <h1 className="sector-header-title min-w-0 max-w-full">{title}</h1>
        )
      }
      right={trailing}
    />
  );
}
