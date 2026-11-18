import type { MutableRefObject } from "react";

/**
 * 보내는 중(낙관) 행 id `pending:<…>:<n>` 의 순번 — **앱 실행 전체에서 하나**(PR-1 재검토 차단 결함).
 *
 * 예전에는 방 화면(phase1 인스턴스)마다 `useRef(0)` 이라 같은 방을 나갔다 다시 열면 0부터 다시 시작했다.
 * 옛 화면의 요청이 늦게 끝나 실패 행 핸들러(전역 레지스트리, tempId 키)를 등록하면 새 화면의 다른 글 행과 tempId 가
 * 겹쳐 「삭제」·「재전송」이 엉뚱한 글에 적용됐다.
 *
 * - 형식(`pending:` 접두 + 끝 숫자)은 그대로 — 서버로 가지 않는 화면 전용 id(서버 계약은 clientMessageId),
 *   같은 시각 보내는 중 행 정렬(`communityMessengerOptimisticSeq`, 끝 숫자 오름차순)도 그대로이며 이제 전역 단조 증가.
 * - 모든 화면이 같은 ref 객체를 받으므로 기존 `pendingMessageIdRef.current++` 호출부를 바꾸지 않는다.
 */
const MESSENGER_PENDING_ROW_SEQ_REF: MutableRefObject<number> = { current: 0 };

/** 방 화면이 쓰는 순번 ref — 모든 인스턴스가 같은 객체(전역 유일 tempId) */
export function useMessengerPendingRowSeqRef(): MutableRefObject<number> {
  return MESSENGER_PENDING_ROW_SEQ_REF;
}
