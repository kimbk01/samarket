/**
 * ORD-C-09 — 주문 요청사항(buyer_note)·줄 메모(line_note) 최대 길이.
 * 클라이언트 입력 `maxLength` 와 서버 거절 기준이 같은 값을 쓴다(UTF-16 길이 = textarea maxLength 기준).
 * 초과 시 서버는 자르지 않고 거절한다.
 */
export const STORE_ORDER_NOTE_MAX_LENGTH = 500;

export function exceedsStoreOrderNoteMaxLength(note: string | null | undefined): boolean {
  return typeof note === "string" && note.length > STORE_ORDER_NOTE_MAX_LENGTH;
}
