/**
 * 입력 중 스토어 읽기 단일 정의 (P3) — 머리글·대화 목록 행이 같은 규칙을 쓴다.
 * zustand selector 는 **문자열 키**(`a|b`)를 돌려 참조 비교로 불필요한 리렌더를 막고, 소비처에서 `split`.
 */
export type TypingEntryLike = { expiresAt: number };

export function selectMessengerTypingUserIdsKey(
  byRoomId: Record<string, Record<string, TypingEntryLike>>,
  args: {
    roomId: string | null | undefined;
    viewerUserId: string | null | undefined;
    /** 1:1 이면 상대 id — 그 사람만 본다. 그룹은 빈 값(본인 제외 전원). */
    peerUserId?: string | null | undefined;
    now?: number;
  }
): string {
  const rid = String(args.roomId ?? "").trim().toLowerCase();
  if (!rid) return "";
  const bucket = byRoomId[rid];
  if (!bucket) return "";
  const now = args.now ?? Date.now();
  const viewer = String(args.viewerUserId ?? "").trim();
  const peer = String(args.peerUserId ?? "").trim();
  if (peer) {
    const e = bucket[peer];
    return e && e.expiresAt > now ? peer : "";
  }
  const ids: string[] = [];
  for (const [uid, e] of Object.entries(bucket)) {
    if (uid === viewer) continue;
    if (e.expiresAt > now) ids.push(uid);
  }
  return ids.join("|");
}

export function splitMessengerTypingUserIdsKey(key: string): string[] {
  return key ? key.split("|") : [];
}
