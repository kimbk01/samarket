/**
 * 27단계: 회원 혜택 유틸 (라벨, 회원 유형 옵션)
 */

import type { MemberType } from "@/lib/types/admin-user";
import type { MemberBenefitLogActionType } from "@/lib/types/member-benefit";
import type { MessageKey } from "@/lib/i18n/messages";

export const MEMBER_TYPE_LABELS: Record<MemberType, string> = {
  normal: "일반회원",
  premium: "특별회원",
  admin: "관리자",
};

/**
 * 고객 화면(회원 혜택 카드)용 — 회원 유형 → 문구 키 (언어 재감사 2026-11-27).
 * `MEMBER_TYPE_LABELS` 는 관리자 화면 호출처 호환용으로 남긴다.
 */
export const MEMBER_TYPE_LABEL_KEYS: Record<MemberType, MessageKey> = {
  normal: "member_type_normal",
  premium: "member_type_premium",
  admin: "member_type_admin",
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
