/**
 * 방 bump 수신 시 "내가 일으킨 변경" 처리 규칙.
 *
 * 이전 규칙(fromUserId === viewer 이면 무조건 스킵)은 서버가 viewer 명의로 만든 메시지
 * (통화 기록 call_stub · 그룹 관리 system 등)와 같은 계정 다른 기기의 전송을 작성자 화면에서 영구 누락시켰다
 * (발신자 취소 통화 기록이 발신자 방에 안 보이던 원인).
 *
 * 그 다음 규칙(같은 clientMessageId 로컬 행이 있으면 스킵)은 HTTP 로 받은 확정 행도 항상 cid 를 갖기 때문에
 * (service 가 metadata.client_message_id 를 매핑, 수정은 기존 metadata 유지) 같은 계정 **다른 기기의 수정·삭제**
 * bump 를 이 기기에서 영구 스킵시켰다(postgres_changes 에만 의존).
 *
 * - `replace_pending`: 같은 cid 의 **낙관(pending) 행**만 로컬에 있음 — 이 기기가 보낸 메시지가 아직 ACK 전.
 *   검증된 스냅샷이 있으면 병합해 pending 을 확정 행으로 교체(`mergeRoomMessages` 가 cid 로 pending 제거),
 *   스냅샷이 없으면 HTTP ACK 를 기다린다(추가 GET 금지 — 송신 경로가 정합 SSOT).
 *   미디어 ACK 는 업로드 후라 느리거나 유실될 수 있어 스킵보다 교체가 안전하다.
 * - `merge_only`: 같은 cid 또는 같은 id 의 **확정 행**이 로컬에 있음 — 스냅샷 병합(제자리 갱신),
 *   스냅샷이 없으면 messages/{id} 단건 정합.
 * - `apply`: 로컬에 없음 — 타인 bump 와 동일하게 스냅샷 병합 + catch-up.
 */
export type OwnRoomBumpLocalMessage = {
  id?: string | null;
  clientMessageId?: string | null;
  pending?: boolean;
};

export type OwnRoomBumpDecision = "replace_pending" | "merge_only" | "apply";

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

function isLocalPendingRow(m: OwnRoomBumpLocalMessage): boolean {
  if (m.pending === true) return true;
  const id = typeof m.id === "string" ? m.id.trim() : "";
  /** 낙관 행 id 규칙(`pending:…`) — pending 플래그를 잃은 레거시 행도 미확정으로 본다. */
  return m.pending !== false && id.startsWith("pending:");
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
  let confirmedMatch = false;
  let pendingCidMatch = false;
  for (const m of input.localMessages) {
    const localCid = typeof m.clientMessageId === "string" ? m.clientMessageId.trim() : "";
    const localId = typeof m.id === "string" ? m.id.trim() : "";
    const pending = isLocalPendingRow(m);
    if (mid && localId && localId === mid && !pending) {
      confirmedMatch = true;
      continue;
    }
    if (cid && localCid && localCid === cid) {
      if (pending) pendingCidMatch = true;
      else confirmedMatch = true;
    }
  }
  /** 확정 행이 이미 있으면 제자리 갱신(다른 기기의 수정·삭제 포함). */
  if (confirmedMatch) return "merge_only";
  if (pendingCidMatch) return "replace_pending";
  return "apply";
}
