/**
 * P1 (Owner 2026-11-18 「권장안대로 반영」): 결과 불명(indeterminate) 실패 글 행을 방을 나갔다 와도 유지한다.
 * 레거시(Telegram) 근거: SendMessagesHelper 가 실패 상태를 메시지에 저장해 다시 열어도 실패 말풍선(재전송)이 남는다.
 *
 * - 기기 저장소(localStorage) 1개 키에 방별 목록 — 모든 접근은 try/catch. 쓰기가 거부되면(사생활 모드·용량 초과·차단)
 *   `saveMessengerFailedTextSend` 가 false 를 돌려주고(호출부가 사유 스낵바), 같은 항목을 **앱 실행 중 메모리 보관소**에 둔다
 *   (PR #442 감사 D1 — 앱이 실행 중인 동안은 방을 나갔다 와도 실패 행으로 복원, 앱 종료·새로고침 때만 사라진다).
 * - 재전송은 같은 clientMessageId(서버 UNIQUE 멱등) → 같은 cid 확정 행이 오면 보관에서 제거.
 * - 로그아웃 시 지움(`lib/auth/client-session-wipe.ts`).
 *
 * F1 (설계 2026-11-18 PR-1 「사용자 조작 없이 글이 사라지는 경로 0」): 보관분은 **사용자 「삭제」 또는 같은 cid 확정 행**으로만
 * 지운다. 예전의 7일 만료·방당 20건/전체 200건 초과 시 오래된 것 삭제는 사용자 모르게 글을 지우는 경로라 없앴다
 * (7일 만료의 근거였던 진입 자동 재전송도 F1 에서 삭제). 저장소가 쓰기를 거부하면(용량 초과 등) 새 보관만 실패하고
 * 기존 보관분은 그대로 남는다 — 새 글은 메모리 보관소에 두고, 호출부가 i18n 사유 스낵바로 알린다(PR-1 검토 #3·감사 D1).
 * 서버 글 길이 상한: 전송 RPC·route 모두 「빈 글」만 거절하고 길이 상한이 없다(2026-11-18 코드 확인) → 길이로 거르지 않는다.
 */

export const MESSENGER_FAILED_TEXT_STORAGE_KEY = "samarket:cm:failed-text-sends:v1";

export type MessengerFailedTextSend = {
  clientMessageId: string;
  content: string;
  replyToMessageId: string | null;
  /** 낙관 행 시각(ISO) — 복원 시 타임라인 위치 */
  createdAt: string;
  /** 보관 시각(ms) — 복원 순서 */
  savedAt: number;
  /**
   * PR #442 감사 D-3: 보낸 사용자 id — 이 값이 있는 항목은 같은 사용자에게만 복원한다(요청 중 로그아웃·계정 전환 뒤
   * 늦은 실패 응답이 다른 계정 화면에 「내 실패 행」으로 보이지 않게). 키 형식은 그대로.
   * 이 값이 없는 옛 항목(main 이 이미 저장한 것)은 main 과 같이 현재 사용자에게 복원하고, 사용자 id 를 채워 다시 저장하지 않는다
   * — 계정 섞임 방지는 이 값을 넣기 시작한 뒤 저장되는 항목부터 적용된다.
   */
  senderUserId?: string | null;
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
    (e.replyToMessageId === null || typeof e.replyToMessageId === "string") &&
    (e.senderUserId === undefined || e.senderUserId === null || typeof e.senderUserId === "string")
  );
}

/**
 * 감사 D-3: 이 항목을 지금 사용자에게 복원해도 되는가.
 * - 보낸 사용자 id 가 있으면 같을 때만
 * - 없으면(옛 항목) main 과 같이 복원 — 사용자 구분 없음
 */
export function isMessengerFailedTextSendOwnedBy(entry: MessengerFailedTextSend, viewerUserId: string): boolean {
  const owner = typeof entry.senderUserId === "string" ? entry.senderUserId.trim() : "";
  if (!owner) return true;
  const viewer = viewerUserId.trim();
  return Boolean(viewer && owner === viewer);
}

/** 감사 D-2: 기기 저장소(localStorage)에 그 cid 보관분이 이미 있는가 — 메모리 보관소는 보지 않는다 */
export function hasMessengerFailedTextSendInDeviceStorage(roomId: string, clientMessageId: string): boolean {
  const id = roomId.trim();
  const cid = clientMessageId.trim();
  if (!id || !cid) return false;
  return (readAll()[id] ?? []).some((e) => e.clientMessageId === cid);
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

/** 저장 성공 여부 — 저장소 없음·사생활 모드·용량 초과면 false(호출부가 사용자에게 알린다, PR-1 검토 #3) */
function writeAll(all: StoreShape): boolean {
  const s = storage();
  if (!s) return false;
  try {
    const rooms = Object.keys(all).filter((k) => all[k] && all[k]!.length > 0);
    if (rooms.length === 0) {
      s.removeItem(MESSENGER_FAILED_TEXT_STORAGE_KEY);
      return true;
    }
    const compact: StoreShape = {};
    for (const r of rooms) compact[r] = all[r]!;
    s.setItem(MESSENGER_FAILED_TEXT_STORAGE_KEY, JSON.stringify(compact));
    return true;
  } catch {
    return false;
  }
}

/**
 * 감사 D1: 기기 저장소가 쓰기를 거부한 글의 메모리 보관소(방 id → 항목). 앱 실행 중에만 유지.
 * 읽기·지우기는 기기 저장소와 같은 규칙으로 함께 다룬다(같은 cid 는 기기 저장소 쪽 우선).
 */
const memoryFallbackByRoom = new Map<string, MessengerFailedTextSend[]>();

function memoryRemove(roomId: string, cids: ReadonlySet<string>): string[] {
  const list = memoryFallbackByRoom.get(roomId);
  if (!list?.length) return [];
  const removed = list.filter((e) => cids.has(e.clientMessageId)).map((e) => e.clientMessageId);
  if (!removed.length) return [];
  const kept = list.filter((e) => !cids.has(e.clientMessageId));
  if (kept.length) memoryFallbackByRoom.set(roomId, kept);
  else memoryFallbackByRoom.delete(roomId);
  return removed;
}

/** 방 진입 복원용 — 기기 저장소 + 메모리 보관소(cid 중복 제외), 오래된 순(보관 시각) */
export function listMessengerFailedTextSends(roomId: string): MessengerFailedTextSend[] {
  const id = roomId.trim();
  if (!id) return [];
  const all = readAll();
  const stored = all[id] ?? [];
  const storedCids = new Set(stored.map((e) => e.clientMessageId));
  const memory = (memoryFallbackByRoom.get(id) ?? []).filter((e) => !storedCids.has(e.clientMessageId));
  return [...stored, ...memory].sort((a, b) => a.savedAt - b.savedAt);
}

/** 보관 성공 여부 반환 — false 면 기기 저장소가 거부(용량 초과·사생활 모드). 화면 행은 그대로 둔다. */
export function saveMessengerFailedTextSend(
  roomId: string,
  entry: Omit<MessengerFailedTextSend, "savedAt"> & { savedAt?: number }
): boolean {
  const id = roomId.trim();
  const cid = entry.clientMessageId.trim();
  if (!id || !cid) return false;
  const all = readAll();
  /** 같은 cid 재저장(재전송 실패)은 처음 보관 시각을 유지 — 복원 순서가 바뀌지 않게 */
  const previous =
    (all[id] ?? []).find((e) => e.clientMessageId === cid) ??
    (memoryFallbackByRoom.get(id) ?? []).find((e) => e.clientMessageId === cid);
  const record: MessengerFailedTextSend = {
    clientMessageId: cid,
    content: entry.content,
    replyToMessageId: entry.replyToMessageId ?? null,
    createdAt: entry.createdAt,
    savedAt: entry.savedAt ?? previous?.savedAt ?? Date.now(),
    ...(entry.senderUserId ? { senderUserId: entry.senderUserId } : {}),
  };
  const list = (all[id] ?? []).filter((e) => e.clientMessageId !== cid);
  list.push(record);
  all[id] = list;
  if (writeAll(all)) {
    memoryRemove(id, new Set([cid]));
    return true;
  }
  /** 감사 D1: 기기 저장소 거부 — 앱 실행 중 메모리 보관소에 같은 형식으로 둔다(false 반환 → 호출부 스낵바) */
  const mem = (memoryFallbackByRoom.get(id) ?? []).filter((e) => e.clientMessageId !== cid);
  mem.push(record);
  memoryFallbackByRoom.set(id, mem);
  return false;
}

export function removeMessengerFailedTextSend(roomId: string, clientMessageId: string): void {
  const id = roomId.trim();
  const cid = clientMessageId.trim();
  if (!id || !cid) return;
  memoryRemove(id, new Set([cid]));
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
  const removedMemory = memoryRemove(id, confirmedClientMessageIds);
  const all = readAll();
  const list = all[id];
  if (!list?.length) return removedMemory;
  const removed = list.filter((e) => confirmedClientMessageIds.has(e.clientMessageId)).map((e) => e.clientMessageId);
  if (!removed.length) return removedMemory;
  all[id] = list.filter((e) => !confirmedClientMessageIds.has(e.clientMessageId));
  writeAll(all);
  return [...new Set([...removed, ...removedMemory])];
}

/** 로그아웃·계정 전환 — 기기 저장소와 메모리 보관소 모두 */
export function clearMessengerFailedTextSends(): void {
  memoryFallbackByRoom.clear();
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(MESSENGER_FAILED_TEXT_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
