/**
 * 방 bump 수신 시 "내가 일으킨 변경" 처리 규칙.
 *
 * 이전 규칙(fromUserId === viewer 이면 무조건 스킵)은 서버가 viewer 명의로 만든 메시지
 * (통화 기록 call_stub · 그룹 관리 system 등)와 같은 계정 다른 기기의 전송을 작성자 화면에서 영구 누락시켰다
 * (발신자 취소 통화 기록이 발신자 방에 안 보이던 원인).
 *
 * - `skip`: 이 기기가 보낸 메시지(clientMessageId 가 로컬 낙관/ACK 행에 있음) — 이미 화면에 있다.
 * - `merge_only`: 같은 id 행이 로컬에 있음 — 스냅샷이 있으면 병합(제자리 갱신), HTTP catch-up 은 생략.
 * - `apply`: 로컬에 없음 — 타인 bump 와 동일하게 스냅샷 병합 + catch-up.
 */
export type OwnRoomBumpLocalMessage = {
  id?: string | null;
  clientMessageId?: string | null;
};

export type OwnRoomBumpDecision = "skip" | "merge_only" | "apply";

export function isOwnAuthoredRoomBump(input: {
  viewerUserId: string;
  fromUserId: string;
  rawSenderId: string;
  isStoreOrderSystemBump: boolean;
}): boolean {
  const viewer = input.viewerUserId.trim();
  const from = input.fromUserId.trim();
  if (!viewer || !from || from !== viewer) return false;
  if (input.isStoreOrderSystemBump) return false;
  const sender = input.rawSenderId.trim();
  /** Peer-mutated same-id UPDATE (fromUserId !== message.senderId) 는 내 변경이 아니다. */
  return !sender || sender === from;
}

export function resolveOwnRoomBumpDecision(input: {
  viewerUserId: string;
  fromUserId: string;
  rawSenderId: string;
  isStoreOrderSystemBump: boolean;
  messageId: string;
  clientMessageId: string;
  localMessages: ReadonlyArray<OwnRoomBumpLocalMessage>;
}): OwnRoomBumpDecision {
  if (!isOwnAuthoredRoomBump(input)) return "apply";
  const cid = input.clientMessageId.trim();
  const mid = input.messageId.trim();
  let idMatch = false;
  for (const m of input.localMessages) {
    const localCid = typeof m.clientMessageId === "string" ? m.clientMessageId.trim() : "";
    if (cid && localCid && localCid === cid) return "skip";
    const localId = typeof m.id === "string" ? m.id.trim() : "";
    if (mid && localId && localId === mid) idMatch = true;
  }
  return idMatch ? "merge_only" : "apply";
}
