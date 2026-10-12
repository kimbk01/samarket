/**
 * M-5: 전송 결과가 불명확한 실패(fetch 예외 = 응답 유실, 서버는 커밋했을 수 있음) 후 **같은 내용을 다시 보낼 때**
 * 같은 clientMessageId 를 재사용한다. 서버 append RPC 는 (room, sender, client_message_id) 로 기존 행을 반환하고
 * DB UNIQUE `uq_cm_messages_room_sender_client_message_id` 가 1행을 보장한다 → 재전송 중복 저장 방지.
 *
 * - 명확한 실패(HTTP 응답 수신, 4xx/5xx)·성공 시에는 기억을 지운다(다음 전송은 새 id).
 * - 메모리 전용·TTL 10분·방/내용(또는 파일 서명) 단위.
 */
const OUTBOUND_RETRY_TTL_MS = 10 * 60_000;
const OUTBOUND_RETRY_MAX = 64;

const ambiguousFailures = new Map<string, { cid: string; at: number }>();

export function messengerOutboundRetryKey(roomId: string, kind: "text" | "image" | "file", signature: string): string {
  return `${String(roomId ?? "").trim().toLowerCase()}\0${kind}\0${signature}`;
}

/** 파일 서명 — 같은 파일 재선택 판별용(내용 해시 아님). */
export function messengerOutboundFileSignature(files: ReadonlyArray<Pick<File, "name" | "size" | "lastModified">>): string {
  return files.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("|");
}

export function resolveMessengerOutboundClientMessageId(key: string, create: () => string): string {
  const hit = ambiguousFailures.get(key);
  if (hit && Date.now() - hit.at < OUTBOUND_RETRY_TTL_MS) return hit.cid;
  if (hit) ambiguousFailures.delete(key);
  return create();
}

export function rememberMessengerOutboundAmbiguousFailure(key: string, cid: string): void {
  const id = String(cid ?? "").trim();
  if (!id) return;
  ambiguousFailures.delete(key);
  ambiguousFailures.set(key, { cid: id, at: Date.now() });
  while (ambiguousFailures.size > OUTBOUND_RETRY_MAX) {
    const oldest = ambiguousFailures.keys().next().value;
    if (oldest === undefined) break;
    ambiguousFailures.delete(oldest);
  }
}

export function clearMessengerOutboundRetry(key: string): void {
  ambiguousFailures.delete(key);
}

export function resetMessengerOutboundRetryForTests(): void {
  ambiguousFailures.clear();
}
