/**
 * 통화 시트 「휴대폰 전화」 번호 — 이 기기 연락처(연락처 동기화)에서만 찾는다. 번호는 기기 밖으로 보내지 않는다.
 * 통화 시트를 열 때만 부른다 (번호표는 크다).
 */
import {
  findLocalNumberByRef,
  readContactsLocalState,
  readContactsNumbers,
} from "@/lib/community-messenger/contacts/contacts-local-store";

/**
 * 방 안 통화 선택 시트·통화 상대 상세 「휴대폰 전화」 번호 (통화 버튼 통합 2판 · Owner 2026-11-12).
 * 이 기기 연락처에 상대 번호가 있으면 E.164, 없으면 null(회색). 기본 통화 방식 설정은 보지 않는다 — 방에서는 항상 선택 시트.
 * 친구(`friendRefs`) → 이 기기 연락처 회원(`members` · on_this_device) 순. 번호는 기기 안에서만 쓰고 서버로 보내지 않는다.
 * 시트를 열 때만 부른다 (번호표는 크다).
 */
export function resolveContactsPeerNumber(viewerUserId: string, peerUserId: string): string | null {
  if (!viewerUserId || !peerUserId) return null;
  const state = readContactsLocalState(viewerUserId);
  if (!state.consented) return null;
  const ref =
    state.friendRefs[peerUserId] ??
    state.members.find((m) => m.user_id === peerUserId && m.on_this_device && m.client_ref)?.client_ref ??
    null;
  return ref ? findLocalNumberByRef(readContactsNumbers(viewerUserId), ref) : null;
}
