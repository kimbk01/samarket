"use client";

import { StoreDetailBackLink } from "@/components/stores/StoreDetailBackRow";
import { STORE_DETAIL_SUBHEADER_STICKY } from "@/lib/stores/store-detail-ui";

/**
 * 매장 하위 화면(정보·신고) 로컬 헤더 — 뒤로 + 가운데 제목.
 * 전역 1단은 `/stores/[slug]/*` 에서 숨김이라 이 바가 safe-top·뒤로를 소유한다.
 * 뒤로 목적지 = 배달 Back SSOT(`resolveDibayBackTarget`: 정보·신고 → 매장 메뉴 PUSH) — 5a3144b0b 회귀 복원 (D-03).
 * 터치 48×48 (§12), 좌우 같은 폭 슬롯으로 제목 실제 중앙.
 */
export function StoreSubpageHeaderBar({
  title,
  storeSlug,
  as: Heading = "h2",
}: {
  title: string;
  storeSlug: string;
  as?: "h1" | "h2";
}) {
  return (
    <header className={`${STORE_DETAIL_SUBHEADER_STICKY} grid grid-cols-[48px_minmax(0,1fr)_48px] items-center px-1`}>
      <StoreDetailBackLink
        storeSlug={storeSlug}
        className="flex h-12 w-12 items-center justify-center rounded-ui-rect text-sam-fg active:bg-sam-surface-muted"
      />
      <Heading className="truncate text-center sam-text-body-lg font-bold text-sam-fg">{title}</Heading>
      <span aria-hidden className="h-12 w-12" />
    </header>
  );
}
