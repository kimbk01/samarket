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
};

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d
const MAX_ROOMS = 200;

let dbPromise: Promise<IDBDatabase> | null = null;

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
  const rows: RoomRow[] = [];
  for (const k of keys) {
    const row = await idbGet<RoomRow>(db, STORE_ROOMS, k);
    if (!row) continue;
    if (isExpired(row, nowMs)) {
      await idbDel(db, STORE_ROOMS, k);
      continue;
    }
    rows.push(row);
  }
  if (rows.length <= MAX_ROOMS) return;
  rows.sort((a, b) => a.lastAccessAt - b.lastAccessAt); // oldest first
  const overflow = rows.length - MAX_ROOMS;
  for (let i = 0; i < overflow; i += 1) {
    await idbDel(db, STORE_ROOMS, rows[i]!.roomId);
  }
}

export async function getLocalRoomSnapshot(roomId: string): Promise<CommunityMessengerRoomSnapshot | null> {
  const id = String(roomId ?? "").trim();
  if (!id) return null;
  try {
    const db = await getDb();
    const row = await idbGet<RoomRow>(db, STORE_ROOMS, id);
    if (!row) return null;
    const nowMs = now();
    if (isExpired(row, nowMs)) {
      await idbDel(db, STORE_ROOMS, id);
      return null;
    }
    // touch (best-effort)
    void idbPut(db, STORE_ROOMS, { ...row, lastAccessAt: nowMs });
    return row.snapshot ?? null;
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
    const row: RoomRow = { roomId: id, at: nowMs, lastAccessAt: nowMs, snapshot };
    await idbPut(db, STORE_ROOMS, row);
    void pruneRooms(db);
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

