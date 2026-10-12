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

const catchUpInflight = new Map<string, Promise<unknown>>();

/** Same room+cursor concurrent catch-up shares one GET (or one bounded page loop). */
export function runMessengerRoomCatchUpSingleFlight<T = boolean>(
  roomId: string,
  afterMessageId: string,
  run: () => Promise<T>
): Promise<T> {
  const key = `${roomId.trim()}:${afterMessageId.trim()}`;
  const existing = catchUpInflight.get(key);
  if (existing) return existing as Promise<T>;
  const pending: Promise<T> = run().finally(() => {
    if (catchUpInflight.get(key) === pending) catchUpInflight.delete(key);
  });
  catchUpInflight.set(key, pending);
  return pending;
}

/** `after=` 한 페이지 크기(route 상한 100 이하). */
export const MESSENGER_ROOM_CATCHUP_PAGE_LIMIT = 80;
/** 한 번의 catch-up 이 따라갈 최대 페이지 수(= 최대 400행). 초과분은 갭으로 남기고 다음 트리거가 이어 받는다. */
export const MESSENGER_ROOM_CATCHUP_MAX_PAGES = 5;

export type MessengerRoomAfterCatchUpPage<T> = {
  ok: boolean;
  /** HTTP status (실패 분류용 — 404 = 앵커 행 없음). */
  status?: number;
  messages: T[];
  hasMore: boolean;
};

export type MessengerRoomAfterCatchUpResult = {
  /** 첫 페이지가 성공했는지 (false 면 아무것도 병합 안 됨). */
  ok: boolean;
  /** 첫 페이지 실패 시 HTTP status. */
  firstStatus?: number;
  mergedCount: number;
  pages: number;
  /** 서버가 `hasMore: false` 를 돌려 앵커 이후 전부를 받았는지. */
  complete: boolean;
  /** 마지막으로 성공 병합한 페이지의 최신 확정 id (미완료 시 다음 이어받기 앵커). */
  lastAnchorId: string;
  lastAnchorCreatedAt: string | null;
  receivedIds: Set<string>;
};

/**
 * `after=` 증분을 `hasMore` 를 따라 페이지 단위로 이어 받는다 (상한 `maxPages`).
 * 순수 함수 — fetch/merge 는 주입. 커서는 각 페이지의 최신 확정 id (hidden 행 필터로 페이지가 짧아도 진행).
 */
export async function runMessengerRoomAfterCatchUpPages<T extends MessengerCatchUpAnchorMessage>(args: {
  startAnchorId: string;
  maxPages?: number;
  fetchPage: (afterMessageId: string) => Promise<MessengerRoomAfterCatchUpPage<T>>;
  onPage: (messages: T[]) => void;
}): Promise<MessengerRoomAfterCatchUpResult> {
  const maxPages = Math.max(1, Math.floor(args.maxPages ?? MESSENGER_ROOM_CATCHUP_MAX_PAGES));
  const receivedIds = new Set<string>();
  let cursor = args.startAnchorId.trim();
  let cursorCreatedAt: string | null = null;
  let mergedCount = 0;
  let pages = 0;
  let complete = false;
  let firstStatus: number | undefined;
  for (let p = 0; p < maxPages; p++) {
    let page: MessengerRoomAfterCatchUpPage<T>;
    try {
      page = await args.fetchPage(cursor);
    } catch {
      page = { ok: false, messages: [], hasMore: false };
    }
    if (!page.ok) {
      if (p === 0) firstStatus = page.status;
      break;
    }
    pages += 1;
    const rows = Array.isArray(page.messages) ? page.messages : [];
    if (rows.length > 0) {
      args.onPage(rows);
      mergedCount += rows.length;
      for (const r of rows) {
        const rid = String(r?.id ?? "").trim();
        if (rid) receivedIds.add(rid);
      }
    }
    if (!page.hasMore) {
      complete = true;
      break;
    }
    const next = selectNewestConfirmedMessageAnchor(rows);
    if (!next || next === cursor) break;
    cursor = next;
    const nextRow = rows.find((r) => String(r?.id ?? "").trim() === next);
    cursorCreatedAt = nextRow?.createdAt ? String(nextRow.createdAt) : null;
  }
  return {
    ok: pages > 0,
    ...(firstStatus !== undefined ? { firstStatus } : {}),
    mergedCount,
    pages,
    complete,
    lastAnchorId: cursor,
    lastAnchorCreatedAt: cursorCreatedAt,
    receivedIds,
  };
}

/**
 * 타임라인 창 갭 감지 — 서버 창(최신 N)의 가장 오래된 확정 행이 로컬에 없고,
 * 로컬에 그보다 오래된 확정 행이 있으면 그 사이가 비어 있을 수 있다.
 * 반환: 갭 메우기 `after=` 앵커(서버 창 oldest 보다 오래된 로컬 확정 중 최신), 없으면 null.
 * (로컬이 서버 oldest 를 포함 = 연속 → null. 로컬이 비었거나 전부 서버 창 안쪽 → null.)
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

type MessengerRoomTimelineGap = { anchorId: string; anchorTimeMs: number };
const timelineGapByRoom = new Map<string, MessengerRoomTimelineGap>();
const timelineGapListeners = new Set<(roomId: string) => void>();
const TIMELINE_GAP_MAX_ROOMS = 64;

/**
 * 방별 미해결 갭 앵커 등록. 기존 갭보다 오래된 앵커만 교체(더 넓게 덮음).
 * `notify` 시 구독자(열린 방 catch-up)가 이벤트 기반으로 `after=` 를 1회 수행 — 폴링 아님.
 * @returns 등록 상태가 바뀌었는지.
 */
export function noteMessengerRoomTimelineGap(
  roomId: string,
  anchorId: string,
  anchorCreatedAt: string | null | undefined,
  opts?: { notify?: boolean }
): boolean {
  const rid = roomId.trim();
  const aid = anchorId.trim();
  if (!rid || !aid || !isUuidLikeString(aid)) return false;
  const t = new Date(String(anchorCreatedAt ?? "")).getTime();
  const anchorTimeMs = Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  const prev = timelineGapByRoom.get(rid);
  if (prev && (prev.anchorId === aid || prev.anchorTimeMs <= anchorTimeMs)) return false;
  timelineGapByRoom.delete(rid);
  timelineGapByRoom.set(rid, { anchorId: aid, anchorTimeMs });
  while (timelineGapByRoom.size > TIMELINE_GAP_MAX_ROOMS) {
    const oldest = timelineGapByRoom.keys().next().value;
    if (oldest === undefined) break;
    timelineGapByRoom.delete(oldest);
  }
  if (opts?.notify !== false) {
    for (const l of [...timelineGapListeners]) {
      try {
        l(rid);
      } catch {
        /* listener isolation */
      }
    }
  }
  return true;
}

/** 감지 + 등록 — bootstrap/seed merge 지점에서 호출. 앵커 행의 createdAt 을 같이 기록. */
export function noteMessengerRoomTimelineGapFromWindows(
  roomId: string,
  local: Array<MessengerCatchUpAnchorMessage & { id?: string | null }>,
  serverWindow: MessengerCatchUpAnchorMessage[]
): boolean {
  const rid = roomId.trim();
  if (!rid || local.length === 0 || serverWindow.length === 0) return false;
  const anchor = detectMessengerTimelineWindowGapAnchor(local, serverWindow);
  if (!anchor) return false;
  const row = local.find((m) => String(m?.id ?? "").trim() === anchor);
  return noteMessengerRoomTimelineGap(rid, anchor, row?.createdAt ?? null);
}

export function peekMessengerRoomTimelineGap(roomId: string): string | null {
  return timelineGapByRoom.get(roomId.trim())?.anchorId ?? null;
}

/** `anchorId` 가 주어지면 그 앵커가 현재 등록값일 때만 해제(경합 중 더 오래된 갭 보존). */
export function clearMessengerRoomTimelineGap(roomId: string, anchorId?: string): void {
  const rid = roomId.trim();
  const cur = timelineGapByRoom.get(rid);
  if (!cur) return;
  if (anchorId && cur.anchorId !== anchorId.trim()) return;
  timelineGapByRoom.delete(rid);
}

/** 이어받기: 미완료 catch-up 이 진행한 지점으로 갭 앵커를 전진 (알림 없음). */
export function advanceMessengerRoomTimelineGap(
  roomId: string,
  fromAnchorId: string,
  toAnchorId: string,
  toCreatedAt: string | null | undefined
): void {
  const rid = roomId.trim();
  const cur = timelineGapByRoom.get(rid);
  const to = toAnchorId.trim();
  if (!rid || !to || !isUuidLikeString(to)) return;
  /** 그 사이 더 오래된 갭이 등록됐으면 그것을 보존. */
  if (cur && cur.anchorId !== fromAnchorId.trim()) return;
  const t = new Date(String(toCreatedAt ?? "")).getTime();
  timelineGapByRoom.delete(rid);
  timelineGapByRoom.set(rid, { anchorId: to, anchorTimeMs: Number.isFinite(t) ? t : Number.POSITIVE_INFINITY });
}

export function subscribeMessengerRoomTimelineGap(listener: (roomId: string) => void): () => void {
  timelineGapListeners.add(listener);
  return () => {
    timelineGapListeners.delete(listener);
  };
}

export function resetMessengerRoomTimelineGapsForTests(): void {
  timelineGapByRoom.clear();
  timelineGapListeners.clear();
}
