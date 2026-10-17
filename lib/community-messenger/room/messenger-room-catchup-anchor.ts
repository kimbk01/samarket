import { communityMessengerRoomResourcePath } from "@/lib/community-messenger/messenger-room-bootstrap";
import { isUuidLikeString } from "@/lib/shared/uuid-string";

export type MessengerCatchUpAnchorMessage = {
  id?: string | null;
  createdAt?: string | null;
  pending?: boolean;
};

/** 시간상 최신 확정 UUID — `after=` catch-up 앵커. 배열 끝/가상화 순서에 의존하지 않는다. */
export function selectNewestConfirmedMessageAnchor(
  messages: MessengerCatchUpAnchorMessage[]
): string | null {
  let anchorId: string | null = null;
  let bestTime = -Infinity;
  let bestIdForTie = "";
  for (const m of messages) {
    if (m.pending) continue;
    const mid = String(m?.id ?? "").trim();
    if (!mid || mid.startsWith("pending:") || !isUuidLikeString(mid)) continue;
    const t = new Date(String(m.createdAt ?? "")).getTime();
    if (!Number.isFinite(t)) continue;
    if (t > bestTime || (t === bestTime && mid > bestIdForTie)) {
      bestTime = t;
      anchorId = mid;
      bestIdForTie = mid;
    }
  }
  return anchorId;
}

export function buildCommunityMessengerMessagesAfterPath(
  roomId: string,
  afterMessageId: string,
  limit = 80
): string {
  const id = roomId.trim();
  const after = afterMessageId.trim();
  return `${communityMessengerRoomResourcePath(id)}/messages?after=${encodeURIComponent(after)}&limit=${limit}`;
}

/** 앵커 없는 최신 페이지 — 빈 방·복귀 정합 (`after=` 가 못 보는 과거 created_at 기록·제자리 갱신). */
export const MESSENGER_ROOM_LATEST_RECONCILE_LIMIT = 40;

export function buildCommunityMessengerMessagesLatestPath(
  roomId: string,
  limit = MESSENGER_ROOM_LATEST_RECONCILE_LIMIT
): string {
  return `${communityMessengerRoomResourcePath(roomId.trim())}/messages?latest=1&limit=${limit}`;
}

/** `after=` 연속 페이지 상한 — hasMore 를 무시하던 부분 복구 방지(폭주 상한). */
export const MESSENGER_ROOM_AFTER_CATCHUP_MAX_PAGES = 5;

const catchUpInflight = new Map<string, Promise<boolean>>();

/** Same room+cursor concurrent catch-up shares one GET. */
export function runMessengerRoomCatchUpSingleFlight(
  roomId: string,
  afterMessageId: string,
  run: () => Promise<boolean>
): Promise<boolean> {
  const key = `${roomId.trim()}:${afterMessageId.trim()}`;
  const existing = catchUpInflight.get(key);
  if (existing) return existing;
  const pending = run().finally(() => {
    if (catchUpInflight.get(key) === pending) catchUpInflight.delete(key);
  });
  catchUpInflight.set(key, pending);
  return pending;
}

/**
 * 타임라인 창 갭 감지 — 서버 창(최신 N)의 가장 오래된 확정 행이 로컬에 없고,
 * 로컬에 그보다 오래된 확정 행이 있으면 그 사이가 비어 있을 수 있다(합집합만으로는 영구 중간 갭:
 * 이전 페이지 로드는 가장 오래된 id 기준, `after=` 는 가장 최신 id 기준이라 둘 다 못 메운다).
 * 반환: 갭 메우기 `after=` 앵커(서버 창 oldest 보다 오래된 로컬 확정 중 최신), 없으면 null.
 */
export function detectMessengerTimelineWindowGapAnchor(
  local: MessengerCatchUpAnchorMessage[],
  serverWindow: MessengerCatchUpAnchorMessage[]
): string | null {
  let serverOldestId = "";
  let serverOldestTime = Infinity;
  for (const m of serverWindow) {
    if (m.pending) continue;
    const mid = String(m?.id ?? "").trim();
    if (!mid || !isUuidLikeString(mid)) continue;
    const t = new Date(String(m.createdAt ?? "")).getTime();
    if (!Number.isFinite(t)) continue;
    if (t < serverOldestTime || (t === serverOldestTime && mid < serverOldestId)) {
      serverOldestTime = t;
      serverOldestId = mid;
    }
  }
  if (!serverOldestId) return null;
  const older: MessengerCatchUpAnchorMessage[] = [];
  for (const m of local) {
    if (m.pending) continue;
    const mid = String(m?.id ?? "").trim();
    if (mid === serverOldestId) return null;
    const t = new Date(String(m.createdAt ?? "")).getTime();
    if (Number.isFinite(t) && t < serverOldestTime) older.push(m);
  }
  if (older.length === 0) return null;
  return selectNewestConfirmedMessageAnchor(older);
}

/**
 * 방별 미해결 타임라인 갭 — 이 앵커 이후 행이 로컬에 없을 수 있다(`after=` 로 메울 대상).
 * 등록 경로: (1) bump 합침·취소로 앞선 bump 가 버려짐, (2) 재입장 시 로컬 창과 서버 최신 창이 겹치지 않음.
 * 소비: 열린 방 catch-up(`useMessengerRoomRemoteCatchup`)이 이벤트로 1회 수행 — 폴링 아님.
 */
type MessengerRoomTimelineGap = { anchorId: string; anchorTimeMs: number };
const timelineGapByRoom = new Map<string, MessengerRoomTimelineGap>();
const timelineGapListeners = new Set<(roomKey: string) => void>();
const TIMELINE_GAP_MAX_ROOMS = 64;

export function messengerRoomTimelineGapKey(roomId: string): string {
  return String(roomId ?? "").trim().toLowerCase();
}

/**
 * 갭 앵커 등록 — 이미 더 오래된(또는 같은) 앵커가 있으면 유지(더 넓게 덮는 쪽 보존).
 * @returns 등록 상태가 바뀌었는지
 */
export function noteMessengerRoomTimelineGap(
  roomId: string,
  anchorId: string,
  anchorCreatedAt: string | null | undefined,
  opts?: { notify?: boolean }
): boolean {
  const key = messengerRoomTimelineGapKey(roomId);
  const aid = String(anchorId ?? "").trim();
  if (!key || !aid || !isUuidLikeString(aid)) return false;
  const t = new Date(String(anchorCreatedAt ?? "")).getTime();
  const anchorTimeMs = Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  const prev = timelineGapByRoom.get(key);
  if (prev && (prev.anchorId === aid || prev.anchorTimeMs <= anchorTimeMs)) return false;
  timelineGapByRoom.delete(key);
  timelineGapByRoom.set(key, { anchorId: aid, anchorTimeMs });
  while (timelineGapByRoom.size > TIMELINE_GAP_MAX_ROOMS) {
    const oldest = timelineGapByRoom.keys().next().value;
    if (oldest === undefined) break;
    timelineGapByRoom.delete(oldest);
  }
  if (opts?.notify !== false) {
    for (const l of [...timelineGapListeners]) {
      try {
        l(key);
      } catch {
        /* listener isolation */
      }
    }
  }
  return true;
}

/** 로컬 창 ↔ 서버 창 비교 후 갭이면 등록 (bootstrap/seed 병합 지점). */
export function noteMessengerRoomTimelineGapFromWindows(
  roomId: string,
  local: MessengerCatchUpAnchorMessage[],
  serverWindow: MessengerCatchUpAnchorMessage[]
): boolean {
  if (!String(roomId ?? "").trim() || local.length === 0 || serverWindow.length === 0) return false;
  const anchor = detectMessengerTimelineWindowGapAnchor(local, serverWindow);
  if (!anchor) return false;
  const row = local.find((m) => String(m?.id ?? "").trim() === anchor);
  return noteMessengerRoomTimelineGap(roomId, anchor, row?.createdAt ?? null);
}

export function peekMessengerRoomTimelineGap(roomId: string): string | null {
  return timelineGapByRoom.get(messengerRoomTimelineGapKey(roomId))?.anchorId ?? null;
}

/** `anchorId` 가 주어지면 그 앵커가 현재 등록값일 때만 해제(경합 중 더 오래된 갭 보존). */
export function clearMessengerRoomTimelineGap(roomId: string, anchorId?: string): void {
  const key = messengerRoomTimelineGapKey(roomId);
  const cur = timelineGapByRoom.get(key);
  if (!cur) return;
  if (anchorId && cur.anchorId !== anchorId.trim()) return;
  timelineGapByRoom.delete(key);
}

export function subscribeMessengerRoomTimelineGap(listener: (roomKey: string) => void): () => void {
  timelineGapListeners.add(listener);
  return () => {
    timelineGapListeners.delete(listener);
  };
}

export function resetMessengerRoomTimelineGapsForTests(): void {
  timelineGapByRoom.clear();
  timelineGapListeners.clear();
}
