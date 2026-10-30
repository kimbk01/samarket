/**
 * 거래 글쓰기 — 고른 사진(아직 업로드 전 File)을 기기 IndexedDB 에 보관한다.
 * 앱 종료·문서 재시작 뒤에도 초안의 `imageRefs[].localId` 로 다시 불러온다.
 * @see trade-write-form-session-draft.ts (`imageRefs`)
 * @see docs/audit/trade-write-photo-loss-fix-design-2026-10-30.md
 *
 * - 소유자 = 기기 bound user. 다른 사용자 사진은 읽지 않고 정리 때 지운다.
 * - 삭제: 등록 성공 · 새로 작성/카테고리 변경(`discardTradeWriteStashedDraft`) · 로그아웃(DB 삭제) · 폼 마운트 정리.
 * - 실패는 조용히 null/빈 결과 — 호출자는 지금처럼 메모리 사진으로 계속 진행한다.
 */

import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import { idbDel, idbGet, idbGetAllKeys, openIdb } from "@/lib/community-messenger/local-store/idb";

const DB_NAME = "samarket-trade-write-photos";
const DB_VERSION = 1;
const STORE = "photos";

export type TradeWriteDraftPhotoRecord = {
  localId: string;
  ownerUserId: string;
  categoryId: string;
  file: File;
  createdAt: number;
};

export type TradeWriteDraftPhotoBackend = {
  put(rec: TradeWriteDraftPhotoRecord): Promise<void>;
  get(localId: string): Promise<TradeWriteDraftPhotoRecord | null>;
  del(localId: string): Promise<void>;
  all(): Promise<TradeWriteDraftPhotoRecord[]>;
  destroy(): Promise<void>;
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = openIdb({
      name: DB_NAME,
      version: DB_VERSION,
      onUpgrade: (db) => {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "localId" });
      },
    })
      .then((db) => {
        /** 다른 탭의 로그아웃 삭제(deleteDatabase)를 막지 않도록 버전 변경 요청이 오면 연결을 닫는다 */
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        return db;
      })
      .catch((e) => {
        dbPromise = null;
        throw e;
      });
  }
  return dbPromise;
}

const idbBackend: TradeWriteDraftPhotoBackend = {
  async put(rec) {
    /** 요청 성공이 아니라 트랜잭션 완료까지 기다린다 — 직후 앱이 종료돼도 기록이 남게 */
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(rec);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("indexeddb_put_failed"));
      tx.onabort = () => reject(tx.error ?? new Error("indexeddb_put_aborted"));
    });
  },
  async get(localId) {
    return idbGet<TradeWriteDraftPhotoRecord>(await openDb(), STORE, localId);
  },
  async del(localId) {
    await idbDel(await openDb(), STORE, localId);
  },
  async all() {
    const db = await openDb();
    const keys = await idbGetAllKeys(db, STORE);
    const rows: TradeWriteDraftPhotoRecord[] = [];
    for (const k of keys) {
      const rec = await idbGet<TradeWriteDraftPhotoRecord>(db, STORE, k);
      if (rec) rows.push(rec);
    }
    return rows;
  },
  async destroy() {
    if (typeof indexedDB === "undefined") return;
    const pending = dbPromise;
    dbPromise = null;
    if (pending) {
      try {
        (await pending).close();
      } catch {
        /* open 실패 — 닫을 것 없음 */
      }
    }
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  },
};

let backend: TradeWriteDraftPhotoBackend = idbBackend;

/** 테스트 전용 — 메모리 백엔드 주입. null 이면 IndexedDB 로 복귀 */
export function setTradeWriteDraftPhotoBackendForTests(next: TradeWriteDraftPhotoBackend | null): void {
  backend = next ?? idbBackend;
}

function logFailure(op: string, e: unknown): void {
  console.warn(`[trade-write-photo-stash] ${op} failed`, e instanceof Error ? e.message : e);
}

function newLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 고른 사진 1장 보관 → localId. 비로그인·저장 실패면 null */
export async function stashTradeWriteDraftPhoto(categoryId: string, file: File): Promise<string | null> {
  const owner = getBoundAuthUserId();
  const cat = categoryId.trim();
  if (!owner || !cat) return null;
  const localId = newLocalId();
  try {
    await backend.put({ localId, ownerUserId: owner, categoryId: cat, file, createdAt: Date.now() });
    return localId;
  } catch (e) {
    logFailure("put", e);
    return null;
  }
}

/** 현재 사용자·같은 카테고리 사진만 돌려준다 (없거나 다른 소유자면 빠짐) */
export async function loadTradeWriteDraftPhotos(
  categoryId: string,
  localIds: string[]
): Promise<Map<string, File>> {
  const out = new Map<string, File>();
  const owner = getBoundAuthUserId();
  const cat = categoryId.trim();
  if (!owner || !cat || localIds.length === 0) return out;
  for (const id of localIds) {
    try {
      const rec = await backend.get(id);
      if (rec && rec.ownerUserId === owner && rec.categoryId === cat && rec.file) out.set(id, rec.file);
    } catch (e) {
      logFailure("get", e);
    }
  }
  return out;
}

export async function deleteTradeWriteDraftPhotos(localIds: string[]): Promise<void> {
  for (const id of localIds) {
    try {
      await backend.del(id);
    } catch (e) {
      logFailure("del", e);
    }
  }
}

/** 이 카테고리 보관 사진 삭제 — 호출 시점 이후 새로 고른 사진은 남긴다 */
export async function clearTradeWriteDraftPhotosForCategory(categoryId: string): Promise<void> {
  const cat = categoryId.trim();
  if (!cat) return;
  const calledAt = Date.now();
  try {
    const rows = await backend.all();
    await deleteTradeWriteDraftPhotos(
      rows.filter((r) => r.categoryId === cat && r.createdAt <= calledAt).map((r) => r.localId)
    );
  } catch (e) {
    logFailure("clear", e);
  }
}

/**
 * 폼 마운트 정리 — 다른 소유자 사진 전부, 이 카테고리에서 초안이 참조하지 않는 사진 삭제.
 * `createdBefore` 이후 보관된 사진(정리 도중 새로 고른 것)은 건드리지 않는다.
 */
export async function sweepTradeWriteDraftPhotos(
  categoryId: string,
  keepLocalIds: ReadonlySet<string>,
  createdBefore: number
): Promise<void> {
  const owner = getBoundAuthUserId();
  const cat = categoryId.trim();
  /** 소유자 미상(비로그인·부팅 중)이면 판정 불가 — 지우지 않는다 */
  if (!owner || !cat) return;
  try {
    const rows = await backend.all();
    const stale = rows.filter(
      (r) =>
        r.ownerUserId !== owner ||
        (r.categoryId === cat && r.createdAt < createdBefore && !keepLocalIds.has(r.localId))
    );
    await deleteTradeWriteDraftPhotos(stale.map((r) => r.localId));
  } catch (e) {
    logFailure("sweep", e);
  }
}

/** 로그아웃·계정 전환 — 기기에 보관한 거래 글쓰기 사진 전부 삭제 */
export async function deleteTradeWriteDraftPhotoDatabase(): Promise<void> {
  try {
    await backend.destroy();
  } catch (e) {
    logFailure("destroy", e);
  }
}
