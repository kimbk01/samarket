"use client";

import { MyInfoAssetMenuSection } from "@/components/mypage/myinfo/MyInfoHomeMenuSections";

/**
 * Logged-in /mypage — 자산 그룹 (최종 설계 H0 #4).
 * `MyGroup`+`MyRow`(= `MyInfoMenuSection`+`MyInfoMenuItem`) 로 그린다 — 행을 직접 그리지 않음.
 * 포인트 잔액 등 값은 `GET /api/me/mypage-summary` 1회(홈 Provider)에서만 받는다 — 이 컴포넌트는 조회하지 않음.
 * 포인트는 금액이라 0·음수 그대로, 모름(실패) = "—" (0 으로 대체 금지).
 * Revenue Hub entry 「내 홍보 / 광고」(/mypage/ads) testid `mypage-revenue-hub-entry` 유지.
 */
export function MypagePointsAssetSummary() {
  return (
    <div className="w-full self-start" data-testid="mypage-points-asset-summary">
      <MyInfoAssetMenuSection />
    </div>
  );
}
