/**
 * 친구 프로필·친구 행 빠른 메뉴 「음성」 통화 선택 (연락처 동기화 4단계 C1 · 영향 분석 §2·§3).
 * 이 기기 연락처에 그 친구 번호가 있고 기본 통화 방식이 「매번 묻기」일 때만 선택 시트 — 그 밖에는 지금과 완전히 같은 경로.
 * 누를 때만 불러온다 (메신저 홈 번들에 넣지 않음). 번호는 기기 안에서만 쓴다.
 */
import {
  findLocalNumberByRef,
  readContactsLocalState,
  readContactsNumbers,
} from "@/lib/community-messenger/contacts/contacts-local-store";

/** 선택 시트를 띄울 이 기기 번호(E.164) — 띄우지 않으면 null */
export function resolveContactsFriendChoiceNumber(viewerUserId: string, friendUserId: string): string | null {
  if (!viewerUserId || !friendUserId) return null;
  const state = readContactsLocalState(viewerUserId);
  if (!state.consented || state.callDefault !== "ask") return null;
  const ref = state.friendRefs[friendUserId];
  // 번호표(큰 값)는 이 친구가 이 기기 연락처에 있을 때만 읽는다
  return ref ? findLocalNumberByRef(readContactsNumbers(viewerUserId), ref) : null;
}
