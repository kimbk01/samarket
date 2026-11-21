/**
 * 중앙 쓰기 게이트 — 가입(전화 인증 + 대표 주소) 검사 대상 판정.
 * 판정은 회원 쓰기 규칙 표 하나(`member-action-registry`)만 읽는다 (설계 2026-11-21 §5-1).
 * - "new" → 가입 필요
 * - "manage" → 가입 없이 통과
 * - "split" → 중앙에서는 통과, 라우트가 새 행동 분기에서만 `requireRegistrationForAction`
 * - 표에 없는 경로 → 가입 필요(통과로 간주하지 않음). 계약 테스트가 표 누락을 CI 에서 막는다.
 */
import { normalizeApiPath } from "@/lib/auth/member-action-policy";
import { findMemberWriteEntry } from "@/lib/auth/member-action-registry";

export type MemberRegistrationMutationClass = "REGISTRATION_REQUIRED" | "REGISTRATION_EXEMPT";

export function resolveMemberRegistrationClassForApiMutation(
  method: string,
  pathname: string,
): MemberRegistrationMutationClass {
  const entry = findMemberWriteEntry(method, normalizeApiPath(pathname));
  if (entry && entry.kind !== "new") return "REGISTRATION_EXEMPT";
  return "REGISTRATION_REQUIRED";
}
