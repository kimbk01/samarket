"use client";

import type { SVGProps } from "react";
import {
  SAM_TIER1_HEADER_ICON_GLYPH_CLASS,
  SAM_TIER1_HEADER_ICON_STROKE_WIDTH,
} from "@/lib/ui/tier1-header-icon";

type GlyphProps = { className?: string } & Omit<SVGProps<SVGSVGElement>, "children">;

const sw = SAM_TIER1_HEADER_ICON_STROKE_WIDTH;

/**
 * 거래·필라이프 1단 우측 종 — `PhilifeHeaderNotificationInbox` 와 단일 소스.
 */
export function Tier1HeaderBellGlyph({ className, ...rest }: GlyphProps) {
  const cn = className ?? SAM_TIER1_HEADER_ICON_GLYPH_CLASS;
  return (
    <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} aria-hidden {...rest}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
    </svg>
  );
}

export function Tier1HeaderBellMutedGlyph({ className, ...rest }: GlyphProps) {
  const cn = className ?? SAM_TIER1_HEADER_ICON_GLYPH_CLASS;
  return (
    <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} aria-hidden {...rest}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" strokeLinecap="round" />
      <path d="M4 4l16 16" strokeLinecap="round" />
    </svg>
  );
}

/** `RegionBar` 스토어 검색과 동일 경로 */
export function Tier1HeaderSearchGlyph({ className, ...rest }: GlyphProps) {
  const cn = className ?? SAM_TIER1_HEADER_ICON_GLYPH_CLASS;
  return (
    <svg className={cn} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={sw} aria-hidden {...rest}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}

/** 필라이프 인박스 패널 설정과 동일 기어(윤곽), 크기만 `SAM_TIER1_HEADER_ICON_GLYPH_CLASS` 로 통일 */
export function Tier1HeaderSettingsGlyph({ className, ...rest }: GlyphProps) {
  const cn = className ?? SAM_TIER1_HEADER_ICON_GLYPH_CLASS;
  return (
    <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} aria-hidden {...rest}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}
