"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import {
  SECTOR_HEADER_BAR_CLASS,
  SECTOR_HEADER_BAR_LEFT_TITLE_CLASS,
  SECTOR_HEADER_BAR_WRAP_CLASS,
  SECTOR_HEADER_BAR_WITH_SUBTITLE_CLASS,
  SECTOR_HEADER_SIDE_VAR,
  resolveSectorHeaderSideWidthPx,
} from "@/lib/ui/sector-header-classes";

/**
 * 공통 헤더 행 — 제목 가운데(기본)는 좌우 대칭 3열 격자.
 * 좌·우 슬롯의 실제 폭을 재서 넓은 쪽을 `--sector-header-side` 로 행에 기록 → 양쪽 열이 같은 폭이 되어
 * 제목이 아이콘 개수·제목 길이와 무관하게 화면 실제 중앙에 온다 (설계서 v3 §12).
 * 측정 전(SSR 첫 페인트)에도 CSS `minmax(side, max-content)` 로 슬롯이 제목과 겹치지 않는다.
 */
export function SectorHeaderBar({
  left,
  center,
  right,
  withSubtitle = false,
  centerAlign = "center",
}: {
  left?: ReactNode;
  center: ReactNode;
  right?: ReactNode;
  withSubtitle?: boolean;
  centerAlign?: "center" | "left";
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const symmetric = centerAlign !== "left";

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (!symmetric) {
      bar.style.removeProperty(SECTOR_HEADER_SIDE_VAR);
      return;
    }
    const apply = () => {
      const side = resolveSectorHeaderSideWidthPx(
        leftRef.current?.offsetWidth ?? 0,
        rightRef.current?.offsetWidth ?? 0
      );
      if (side == null) {
        bar.style.removeProperty(SECTOR_HEADER_SIDE_VAR);
      } else {
        bar.style.setProperty(SECTOR_HEADER_SIDE_VAR, `${side}px`);
      }
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    if (leftRef.current) ro.observe(leftRef.current);
    if (rightRef.current) ro.observe(rightRef.current);
    return () => ro.disconnect();
  }, [symmetric]);

  return (
    <div className={SECTOR_HEADER_BAR_WRAP_CLASS}>
      <div
        ref={barRef}
        data-sector-header-align={symmetric ? "center" : "left"}
        className={[
          SECTOR_HEADER_BAR_CLASS,
          symmetric ? "" : SECTOR_HEADER_BAR_LEFT_TITLE_CLASS,
          withSubtitle ? SECTOR_HEADER_BAR_WITH_SUBTITLE_CLASS : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <div ref={leftRef} className="sector-header-bar__left">
          {left ?? (symmetric ? null : <span aria-hidden className="block w-full" />)}
        </div>
        <div
          className={[
            "sector-header-bar__center",
            centerAlign === "left" ? "sector-header-bar__center--left" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {center}
        </div>
        <div ref={rightRef} className="sector-header-bar__right">
          {right ?? null}
        </div>
      </div>
    </div>
  );
}
