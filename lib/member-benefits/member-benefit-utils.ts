/**
 * 27단계: 회원 혜택 유틸 (라벨, 회원 유형 옵션)
 */

import type { MemberType } from "@/lib/types/admin-user";
import type { MemberBenefitLogActionType } from "@/lib/types/member-benefit";

export const MEMBER_TYPE_LABELS: Record<MemberType, string> = {
  normal: "일반회원",
  premium: "특별회원",
  admin: "관리자",
};

export const MEMBER_BENEFIT_LOG_ACTION_LABELS: Record<
  MemberBenefitLogActionType,
  string
> = {
  assign: "부여",
  update: "변경",
  revoke: "회수",
  apply_priority: "우선노출적용",
  apply_bonus: "보너스적용",
};

export const MEMBER_TYPE_OPTIONS: { value: MemberType; label: string }[] = [
  { value: "normal", label: "일반회원" },
  { value: "premium", label: "특별회원" },
  { value: "admin", label: "관리자" },
];
