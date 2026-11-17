/**
 * L2 (P2 수신 측) — `community_messenger_participants` UPDATE 가 읽음·안 읽음 컬럼만 바꿨는지 판정.
 *
 * - 전송 RPC 는 방의 활성 참가자 행을 모두 UPDATE(unread_count) → 1:1 메시지 1건마다 양쪽 기기에 UPDATE 2건.
 * - 내 mark_read 결과도 내 행 UPDATE 로 돌아온다(PATCH 응답이 이미 반영).
 * 이런 UPDATE 는 방 메타 재조회가 필요 없다. 그 밖의 컬럼(음소거·나감·역할·보관 등)이 바뀌면 false.
 *
 * old 행이 new 행의 컬럼을 모두 갖지 않으면(PK 만 오는 경우) 판별 불가 → false(기존처럼 메타 재조회).
 * 근거: 이 경우 결과는 P2 이전과 완전히 같다(항상 meta.schedule) — 운영은 REPLICA IDENTITY FULL(2026-11-18 확인)이라
 * 전체 old 행이 와서 판별되지만, 설정이 바뀌어도 동작이 나빠지지 않고 이전으로 돌아갈 뿐이다.
 */
const READ_ONLY_PARTICIPANT_COLUMNS = new Set([
  "last_read_message_id",
  "last_read_at",
  "last_read_message_created_at",
  "unread_count",
  "updated_at",
]);

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

export function isParticipantReadOnlyUpdate(input: {
  eventType: string;
  oldRecord: unknown;
  newRecord: unknown;
}): boolean {
  if (input.eventType !== "UPDATE") return false;
  const oldR =
    input.oldRecord && typeof input.oldRecord === "object" ? (input.oldRecord as Record<string, unknown>) : null;
  const newR =
    input.newRecord && typeof input.newRecord === "object" ? (input.newRecord as Record<string, unknown>) : null;
  if (!oldR || !newR) return false;
  const keys = Object.keys(newR);
  if (keys.length === 0) return false;
  for (const key of keys) {
    if (!(key in oldR)) return false;
  }
  let changedAny = false;
  for (const key of keys) {
    if (sameValue(oldR[key], newR[key])) continue;
    if (!READ_ONLY_PARTICIPANT_COLUMNS.has(key)) return false;
    changedAny = true;
  }
  return changedAny;
}
