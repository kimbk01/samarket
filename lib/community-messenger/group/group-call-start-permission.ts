/**
 * 그룹 통화 시작 권한 SSOT — 클라이언트(`use-messenger-room-phase2-room-presentation` canStartGroupCall)와
 * 서버(`startCommunityMessengerCallSession`)가 같은 규칙을 쓴다.
 *
 * 규칙: owner / admin 은 항상 허용, 일반 member 는 방 설정 `allowMemberCall` 이 켜져 있을 때만 허용.
 * (`allowMemberCall` 은 스냅샷에서 `allow_member_call !== false` 로 정규화된 값)
 * 1:1(direct) 방에는 적용하지 않는다.
 */

/** 서버 거부 코드 — `call_denied_` 접두라 calls route 에서 403 으로 응답된다 */
export const GROUP_MEMBER_CALL_FORBIDDEN_API_ERROR = "call_denied_group_member_call" as const;

export function canRoleStartGroupCall(input: {
  myRole: string | null | undefined;
  allowMemberCall: boolean | null | undefined;
}): boolean {
  return input.myRole === "owner" || input.myRole === "admin" || Boolean(input.allowMemberCall);
}
