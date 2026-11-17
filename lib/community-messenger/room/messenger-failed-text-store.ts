/**
 * P1 (Owner 2026-11-18 「권장안대로 반영」): 결과 불명(indeterminate) 실패 글 행을 방을 나갔다 와도 유지한다.
 * 레거시(Telegram) 근거: SendMessagesHelper 가 실패 상태를 메시지에 저장해 다시 열어도 실패 말풍선(재전송)이 남는다.
 *
 * - 기기 저장소(localStorage) 1개 키에 방별 목록 — 모든 접근은 try/catch(사생활 모드·용량 초과·차단 시 조용히 무시).
 * - 방당 20건 · 전체 200건 상한, 넘으면 오래된 것부터 삭제.
 * - 재전송은 같은 clientMessageId(서버 UNIQUE 멱등) → 같은 cid 확정 행이 오면 보관에서 제거.
 * - 로그아웃 시 지움(`lib/auth/client-session-wipe.ts`).
 */

export const MESSENGER_FAILED_TEXT_STORAGE_KEY = "samarket:cm:failed-text-sends:v1";
export const MESSENGER_FAILED_TEXT_PER_ROOM_MAX = 20;
export const MESSENGER_FAILED_TEXT_TOTAL_MAX = 200;
/**
 * 보관 7일 — 시간 초과 뒤 서버가 실제로 저장했는데 확정 행이 첫 화면 창 밖이라 확인 못 한 경우에도
 * 실패 행이 영구히 남지 않게(리뷰 #1). 진입 시 자동 재전송(같은 cid)이 1차 정리, 이 값은 최종 상한.
 */
export const MESSENGER_FAILED_TEXT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type MessengerFailedTextSend = {
  clientMessageId: string;
  content: string;
  replyToMessageId: string | null;
  /** 낙관 행 시각(ISO) — 복원 시 타임라인 위치 */
  createdAt: string;
  /** 보관 시각(ms) — 상한 초과 시 오래된 것부터 삭제 */
  savedAt: number;
};

type StoreShape = Record<string, MessengerFailedTextSend[]>;

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function isEntry(v: unknown): v is MessengerFailedTextSend {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return (
    typeof e.clientMessageId === "string" &&
    e.clientMessageId.trim().length > 0 &&
    typeof e.content === "string" &&
    typeof e.createdAt === "string" &&
    typeof e.savedAt === "number" &&
    (e.replyToMessageId === null || typeof e.replyToMessageId === "string")
  );
}

function readAll(): StoreShape {
  const s = storage();
  if (!s) return {};
  try {
    const raw = s.getItem(MESSENGER_FAILED_TEXT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: StoreShape = {};
    for (const [roomId, list] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const entries = list.filter(isEntry);
      if (entries.length) out[roomId] = entries;
    }
    return out;
  } catch {
    return {};
  }
}

function writeAll(all: StoreShape): void {
  const s = storage();
  if (!s) return;
  try {
    const rooms = Object.keys(all).filter((k) => all[k] && all[k]!.length > 0);
    if (rooms.length === 0) {
      s.removeItem(MESSENGER_FAILED_TEXT_STORAGE_KEY);
      return;
    }
    const compact: StoreShape = {};
    for (const r of rooms) compact[r] = all[r]!;
    s.setItem(MESSENGER_FAILED_TEXT_STORAGE_KEY, JSON.stringify(compact));
  } catch {
    /* 사생활 모드·용량 초과 — 보관 없이 진행(화면의 실패 행은 그대로) */
  }
}

/** 상한 적용 — 방당 20 · 전체 200, 오래된(savedAt 작은) 것부터 삭제 */
export function trimMessengerFailedTextStore(all: StoreShape): StoreShape {
  const out: StoreShape = {};
  for (const [roomId, list] of Object.entries(all)) {
    const sorted = [...list].sort((a, b) => a.savedAt - b.savedAt);
    out[roomId] = sorted.slice(Math.max(0, sorted.length - MESSENGER_FAILED_TEXT_PER_ROOM_MAX));
  }
  const flat: Array<{ roomId: string; entry: MessengerFailedTextSend }> = [];
  for (const [roomId, list] of Object.entries(out)) for (const entry of list) flat.push({ roomId, entry });
  if (flat.length > MESSENGER_FAILED_TEXT_TOTAL_MAX) {
    flat.sort((a, b) => a.entry.savedAt - b.entry.savedAt);
    const drop = flat.slice(0, flat.length - MESSENGER_FAILED_TEXT_TOTAL_MAX);
    for (const d of drop) {
      out[d.roomId] = (out[d.roomId] ?? []).filter((e) => e !== d.entry);
    }
  }
  for (const k of Object.keys(out)) if (!out[k]!.length) delete out[k];
  return out;
}

/** 만료분(보관 7일 초과) 제거 — 바뀐 게 있으면 true */
export function dropExpiredMessengerFailedTextSends(all: StoreShape, now: number): boolean {
  let changed = false;
  for (const roomId of Object.keys(all)) {
    const list = all[roomId]!;
    const kept = list.filter((e) => now - e.savedAt <= MESSENGER_FAILED_TEXT_TTL_MS);
    if (kept.length !== list.length) {
      changed = true;
      if (kept.length) all[roomId] = kept;
      else delete all[roomId];
    }
  }
  return changed;
}

/** 방 진입 복원용 — 7일 지난 보관분은 조용히 지우고 나머지를 오래된 순으로 */
export function listMessengerFailedTextSends(roomId: string, now: number = Date.now()): MessengerFailedTextSend[] {
  const id = roomId.trim();
  if (!id) return [];
  const all = readAll();
  if (dropExpiredMessengerFailedTextSends(all, now)) writeAll(all);
  return [...(all[id] ?? [])].sort((a, b) => a.savedAt - b.savedAt);
}

export function saveMessengerFailedTextSend(
  roomId: string,
  entry: Omit<MessengerFailedTextSend, "savedAt"> & { savedAt?: number }
): void {
  const id = roomId.trim();
  const cid = entry.clientMessageId.trim();
  if (!id || !cid) return;
  const all = readAll();
  /** 같은 cid 재저장(자동·수동 재전송 실패)은 처음 보관 시각을 유지 — 7일 만료 기준이 밀리지 않게 */
  const previous = (all[id] ?? []).find((e) => e.clientMessageId === cid);
  const list = (all[id] ?? []).filter((e) => e.clientMessageId !== cid);
  list.push({
    clientMessageId: cid,
    content: entry.content,
    replyToMessageId: entry.replyToMessageId ?? null,
    createdAt: entry.createdAt,
    savedAt: entry.savedAt ?? previous?.savedAt ?? Date.now(),
  });
  all[id] = list;
  writeAll(trimMessengerFailedTextStore(all));
}

export function removeMessengerFailedTextSend(roomId: string, clientMessageId: string): void {
  const id = roomId.trim();
  const cid = clientMessageId.trim();
  if (!id || !cid) return;
  const all = readAll();
  const list = all[id];
  if (!list || !list.some((e) => e.clientMessageId === cid)) return;
  all[id] = list.filter((e) => e.clientMessageId !== cid);
  writeAll(all);
}

/** 확정 행(같은 cid)이 화면에 있으면 보관에서 제거 — 제거한 cid 목록 반환 */
export function pruneMessengerFailedTextSendsConfirmed(
  roomId: string,
  confirmedClientMessageIds: ReadonlySet<string>
): string[] {
  const id = roomId.trim();
  if (!id || confirmedClientMessageIds.size === 0) return [];
  const all = readAll();
  const list = all[id];
  if (!list?.length) return [];
  const removed = list.filter((e) => confirmedClientMessageIds.has(e.clientMessageId)).map((e) => e.clientMessageId);
  if (!removed.length) return [];
  all[id] = list.filter((e) => !confirmedClientMessageIds.has(e.clientMessageId));
  writeAll(all);
  return removed;
}

/** 로그아웃·계정 전환 */
export function clearMessengerFailedTextSends(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(MESSENGER_FAILED_TEXT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
