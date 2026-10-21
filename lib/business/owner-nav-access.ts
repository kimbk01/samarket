/**
 * 4단계 IA-21 — 오너 메뉴·화면 접근 열거형 ↔ 1-B 게이트 단일 판정.
 *
 * 서버 쓰기 게이트(`owner-product-gate.ts`)의 같은 함수로 판정한다 (재정의 금지):
 * - `approved`        = `ownerStoreOperationalWriteBlock` 통과 (승인 매장만)
 * - `preApproval`     = `ownerStoreProfileWriteBlock` 통과 (승인 + 심사 중·보완 요청 온보딩)
 * - `suspendedAllowed`= 승인 + 정지(DEF-71 · D-16: 진행 주문·주문 채팅·조회)
 * - `any`             = 상태 무관 (허브·알림·플랫폼 고객센터·입점 신청)
 *
 * 드로어 노출(`owner-nav-registry`)과 `StoreBusinessGuard` 화면 허용이 이 함수 하나를 쓴다 —
 * 「보이면 들어갈 수 있다」.
 */

import {
  ownerStoreOperationalWriteBlock,
  ownerStoreProfileWriteBlock,
} from "@/lib/stores/owner-product-gate";

export type OwnerNavAccess = "approved" | "preApproval" | "suspendedAllowed" | "any";

export function ownerNavAccessAllows(
  access: OwnerNavAccess,
  approvalStatus: string | null | undefined
): boolean {
  if (access === "any") return true;
  if (access === "approved") return ownerStoreOperationalWriteBlock(approvalStatus) === null;
  if (access === "preApproval") return ownerStoreProfileWriteBlock(approvalStatus) === null;
  const st = String(approvalStatus ?? "").trim();
  return ownerStoreOperationalWriteBlock(st) === null || st === "suspended";
}
