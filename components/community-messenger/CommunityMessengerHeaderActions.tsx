"use client";

import Link from "next/link";
import { Phone } from "lucide-react";
import { Sam } from "@/lib/ui/sam-component-classes";
import {
  SAM_TIER1_HEADER_ICON_GLYPH_CLASS,
  SAM_TIER1_HEADER_ICON_STROKE_WIDTH,
  samTier1HeaderIconBadge,
  samTier1HeaderIconCluster,
  samTier1HeaderIconMicro,
} from "@/lib/ui/tier1-header-icon";
import {
  Tier1HeaderBellGlyph,
  Tier1HeaderSearchGlyph,
  Tier1HeaderSettingsGlyph,
} from "@/lib/ui/tier1-header-glyphs";

/**
 * 메신저 홈 상단 우측 액션: 검색 / 통화 기록 / 알림 / 설정.
 * 새 대화는 하단 FAB 한 곳만 사용(중복 CTA 제거).
 *
 * 거래·필라이프 1단 우측과 동일 타입: `sam-header-action` + 40×40 히트, 글리프 `h-6 w-6`,
 * 클러스터 간격 `samTier1HeaderIconCluster` — 원형 배경 셸 없음.
 */
export function CommunityMessengerHeaderActions({
  incomingRequestCount,
  onOpenSearch,
  onOpenRequestList,
  onOpenSettings,
}: {
  incomingRequestCount: number;
  onOpenSearch: () => void;
  onOpenRequestList: () => void;
  onOpenSettings: () => void;
}) {
  const iconBtn = `${Sam.headerAction} relative h-10 w-10 shrink-0 text-sam-fg ${samTier1HeaderIconMicro}`;

  return (
    <div className={samTier1HeaderIconCluster}>
      <button type="button" onClick={onOpenSearch} className={iconBtn} aria-label="메신저 검색">
        <Tier1HeaderSearchGlyph />
      </button>
      <Link href="/community-messenger/calls/logs" className={iconBtn} aria-label="통화 기록">
        <Phone className={SAM_TIER1_HEADER_ICON_GLYPH_CLASS} strokeWidth={SAM_TIER1_HEADER_ICON_STROKE_WIDTH} aria-hidden />
      </Link>
      <button
        type="button"
        onClick={onOpenRequestList}
        className={iconBtn}
        aria-label={`알림${incomingRequestCount > 0 ? ` · 친구 요청 대기 ${incomingRequestCount}건` : ""}`}
      >
        <Tier1HeaderBellGlyph />
        {incomingRequestCount > 0 ? (
          <span className={samTier1HeaderIconBadge}>
            {incomingRequestCount > 99 ? "99+" : incomingRequestCount}
          </span>
        ) : null}
      </button>
      <button type="button" onClick={onOpenSettings} className={iconBtn} aria-label="메신저 설정">
        <Tier1HeaderSettingsGlyph />
      </button>
    </div>
  );
}
