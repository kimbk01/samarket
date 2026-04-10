"use client";

import Link from "next/link";
import { useRegion } from "@/contexts/RegionContext";
import {
  neighborhoodLocationLabelFromRegion,
  neighborhoodLocationMetaFromRegion,
  formatNeighborhoodRegionSubtitle,
} from "@/lib/neighborhood/location-key";
import { useRepresentativeAddressLine } from "@/hooks/use-representative-address-line";

/** 필라이프·거래 홈 상단 동네 줄 — 주소 관리(대표 주소)로 이동 */
const ADDRESS_MANAGEMENT_HREF = "/mypage/addresses";

type Tier1ExplorationTitleRowProps = {
  /** 탐색 피드 화면 명 — 예: 필라이프, 홈 */
  segmentTitle: string;
};

/**
 * 메인 1단 중앙 타이틀 — `페이지명 · (지역·동네…)` 형태, 주소 탭 시 주소 관리로 이동.
 * `MySubpageHeader`·`RegionBar`(/home)에서 필라이프와 동일 톤으로 사용.
 */
export function Tier1ExplorationTitleRow({ segmentTitle }: Tier1ExplorationTitleRowProps) {
  const { currentRegion } = useRegion();
  const rep = useRepresentativeAddressLine();
  const meta = neighborhoodLocationMetaFromRegion(currentRegion);
  const label = neighborhoodLocationLabelFromRegion(currentRegion);
  const fallback = formatNeighborhoodRegionSubtitle(meta, (label || currentRegion?.label || "").trim());
  /** 대표 주소 로드 후 전체 한 줄 — 로딩 중엔 폴백 쓰지 않음(이전 Manila 깜빡임 방지) */
  const addressLine =
    rep.status === "loading"
      ? "…"
      : rep.line?.trim() || fallback;

  return (
    <span className="flex w-full min-w-0 max-w-full items-center justify-center gap-1.5 overflow-hidden">
      <span className="shrink-0 text-[16px] font-semibold leading-none text-foreground">{segmentTitle}</span>
      <span className="shrink-0 text-[15px] leading-none text-[var(--text-muted)]" aria-hidden>
        ·
      </span>
      <Link
        href={ADDRESS_MANAGEMENT_HREF}
        className="min-w-0 flex-1 truncate text-[13px] font-normal leading-none text-[var(--text-muted)] hover:text-foreground hover:underline"
        aria-label={`내 동네 ${addressLine}, 주소 관리에서 대표 주소 변경`}
      >
        {addressLine}
      </Link>
    </span>
  );
}
