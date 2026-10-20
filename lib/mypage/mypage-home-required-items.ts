/**
 * 내정보 홈 필수정보(1-a) — **미완료 항목만** 1줄씩 (최종 설계 H0 필수정보 · IA 계약 §2).
 *
 * - 아이디: 값 자체가 없을 때(복구 필요)만. 1회 변경 가능 상태는 요구사항이 아님 → 홈에서 표시 안 함(S03 담당).
 * - 전화: `!phone.verified` 일 때만. 인증 완료면 줄 자체 없음 → 「등록된 번호 없음」+「인증 완료」 모순 경로 제거.
 * - 주소: `!address.registered` 일 때만. 등록 완료면 줄 없음 → 「변경」 2중 표기 제거(주소 변경은 계정 그룹 「주소관리」 행 하나).
 * - 상태 미확정(unknown)·프로필 없음 = 아무것도 그리지 않음(완료 회원이 대부분이라 자리 예약 시 흔들림).
 */

import type { MemberAccountStatus } from "@/lib/profile/member-account-status";
import type { RequiredInfoStatus } from "@/lib/mypage/mypage-home-snapshot";

export type MypageHomeRequiredItem = "handle" | "phone" | "address";

export function resolveMypageHomeRequiredItems(input: {
  status: MemberAccountStatus | null;
  phoneStatus: RequiredInfoStatus;
  addressStatus: RequiredInfoStatus;
}): MypageHomeRequiredItem[] {
  const { status, phoneStatus, addressStatus } = input;
  if (!status) return [];
  if (phoneStatus === "unknown" || addressStatus === "unknown") return [];
  const items: MypageHomeRequiredItem[] = [];
  const handleMissing = !status.handle.atDisplay && !status.handle.value;
  if (handleMissing) items.push("handle");
  if (!status.phone.verified) items.push("phone");
  if (!status.address.registered) items.push("address");
  return items;
}
