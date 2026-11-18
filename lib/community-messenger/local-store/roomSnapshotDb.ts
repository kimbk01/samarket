import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";
import { idbDel, idbGet, idbGetAllKeys, idbPut, openIdb } from "@/lib/community-messenger/local-store/idb";

const DB_NAME = "samarket.cm.roomSnapshots.v1";
const DB_VERSION = 1;

const STORE_ROOMS = "rooms";

type RoomRow = {
  roomId: string;
  at: number; // last write (ms)
  lastAccessAt: number; // LRU touch (ms)
  snapshot: CommunityMessengerRoomSnapshot;
  /** 기기 저장공간 S1 — 저장 시점에 잰 크기(JSON 문자 수). 이전 행에는 없음 → 정리 때 1회 계산 */
  chars?: number;
};

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d
const MAX_ROOMS = 200;
/**
 * 기기 저장공간 S1 (2026-11-19) — 바이트 상한. 이전에는 방 200개·7일 상한만 있고 크기 상한이 없었다.
 * 크기는 JSON 문자 수로 잰다(근사). 방 1개가 상한을 넘으면 저장하지 않는다(다음 진입은 서버에서 받음).
 * 전체가 상한을 넘으면 오래 안 연 방부터 지운다(LRU).
 * 근거: docs/audit/device-storage-legacy-design-2026-11-19.md §4 S1
 */
export const ROOM_SNAPSHOT_MAX_ROW_CHARS = 2_000_000;
export const ROOM_SNAPSHOT_MAX_TOTAL_CHARS = 20_000_000;

export function roomSnapshotRowChars(snapshot: unknown): number {
  try {
    return JSON.stringify(snapshot)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/** 남길 방을 고른다 — 개수(MAX_ROOMS)·전체 크기(MAX_TOTAL) 상한 안에서 최근 사용 순으로. 지울 roomId 를 돌려준다. */
export function selectRoomSnapshotEvictions(
  rows: ReadonlyArray<{ roomId: string; lastAccessAt: number; chars: number }>,
  limits: { maxRooms: number; maxTotalChars: number } = {
    maxRooms: MAX_ROOMS,
    maxTotalChars: ROOM_SNAPSHOT_MAX_TOTAL_CHARS,
  }
): string[] {
  const newestFirst = [...rows].sort((a, b) => b.lastAccessAt - a.lastAccessAt);
  const evict: string[] = [];
  let kept = 0;
  let total = 0;
  for (const r of newestFirst) {
    if (kept < limits.maxRooms && total + r.chars <= limits.maxTotalChars) {
      kept += 1;
      total += r.chars;
    } else {
      evict.push(r.roomId);
    }
  }
  return evict;
}

let dbPromise: Promise<IDBDatabase> | null = null;
let lastPruneAt = 0;

async function getDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = openIdb({
    name: DB_NAME,
    version: DB_VERSION,
    onUpgrade(db) {
      if (!db.objectStoreNames.contains(STORE_ROOMS)) {
        db.createObjectStore(STORE_ROOMS, { keyPath: "roomId" });
      }
    },
  });
  return dbPromise;
}

function now(): number {
  return Date.now();
}

function isExpired(row: Pick<RoomRow, "at">, nowMs: number): boolean {
  return nowMs - row.at > TTL_MS;
}

async function pruneRooms(db: IDBDatabase): Promise<void> {
  const keys = (await idbGetAllKeys(db, STORE_ROOMS)).map(String);
  if (keys.length === 0) return;
  const nowMs = now();
  const rows: Array<{ roomId: string; lastAccessAt: number; chars: number }> = [];
  for (const k of keys) {
    const row = await idbGet<RoomRow>(db, STORE_ROOMS, k);
    if (!row) continue;
    if (isExpired(row, nowMs)) {
      await idbDel(db, STORE_ROOMS, k);
      continue;
    }
    const chars = typeof row.chars === "number" ? row.chars : roomSnapshotRowChars(row.snapshot);
    rows.push({ roomId: row.roomId, lastAccessAt: row.lastAccessAt, chars });
  }
  for (const roomId of selectRoomSnapshotEvictions(rows)) {
    await idbDel(db, STORE_ROOMS, roomId);
  }
}

export async function getLocalRoomSnapshot(
  roomId: string,
  viewerUserId?: string | null
): Promise<CommunityMessengerRoomSnapshot | null> {
  const id = String(roomId ?? "").trim();
  if (!id) return null;
  const viewer = (viewerUserId ?? "").trim();
  if (!viewer) return null;
  try {
    const db = await getDb();
    const row = await idbGet<RoomRow>(db, STORE_ROOMS, id);
    if (!row) return null;
    const nowMs = now();
    if (isExpired(row, nowMs)) {
      await idbDel(db, STORE_ROOMS, id);
      return null;
    }
    const snap = row.snapshot ?? null;
    if (!snap || String(snap.viewerUserId ?? "").trim() !== viewer) {
      return null;
    }
    // touch (best-effort)
    void idbPut(db, STORE_ROOMS, { ...row, lastAccessAt: nowMs });
    return snap;
  } catch {
    return null;
  }
}

export async function putLocalRoomSnapshot(roomId: string, snapshot: CommunityMessengerRoomSnapshot): Promise<void> {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  try {
    const db = await getDb();
    const nowMs = now();
    /** 방 1개 상한 초과 — 저장하지 않고 이전 사본도 지운다(옛 사본으로 그리지 않게) */
    const chars = roomSnapshotRowChars(snapshot);
    if (chars > ROOM_SNAPSHOT_MAX_ROW_CHARS) {
      await idbDel(db, STORE_ROOMS, id);
      return;
    }
    const row: RoomRow = { roomId: id, at: nowMs, lastAccessAt: nowMs, snapshot, chars };
    await idbPut(db, STORE_ROOMS, row);
    if (nowMs - lastPruneAt >= 60_000) {
      lastPruneAt = nowMs;
      void pruneRooms(db);
    }
  } catch {
    // ignore quota/private mode
  }
}

export async function invalidateLocalRoomSnapshot(roomId: string): Promise<void> {
  const id = String(roomId ?? "").trim();
  if (!id) return;
  try {
    const db = await getDb();
    await idbDel(db, STORE_ROOMS, id);
  } catch {
    // ignore
  }
}

/** 로그아웃·계정 전환 — IndexedDB room snapshot DB 전체 삭제 */
export async function clearAllLocalRoomSnapshots(): Promise<void> {
  dbPromise = null;
  lastPruneAt = 0;
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

