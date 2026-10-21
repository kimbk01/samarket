import "server-only";

/**
 * A-2: 확정(finalize)되지 않은 메신저 staged upload 객체 정리 (크론 · server-only).
 *
 * 경로 SSOT: `${userId}/community/messenger-{file|image}-staging/${roomId}/${uuid}.${ext}`
 * (`lib/community-messenger/upload/messenger-direct-upload-policy.ts`).
 * - 업로드 URL 발급 때 같은 사용자·같은 방의 1시간 지난 staging 은 이미 지워진다
 *   (`purgeStaleMessengerStagingObjects`). 이 크론은 사용자가 그 방에 다시 올리지 않아 남은 것만 정리한다.
 * - 24시간 지난 staging leaf(`uuid.ext`)만 삭제. 최종 미디어 경로·다른 접두는 건드리지 않는다.
 * - 1회 실행 상한: 사용자 폴더 수 · Storage list 호출 수 · 삭제 수 · 실행 시간. 사용자 폴더는 날짜별로
 *   시작 위치를 돌려(day rotation) 여러 날에 걸쳐 전체를 훑는다.
 */
import {
  MESSENGER_LEGACY_MEDIA_BUCKET,
  MESSENGER_PRIVATE_MEDIA_BUCKET,
} from "@/lib/community-messenger/media/messenger-media-ref";
import {
  parseMessengerStagedPath,
  type MessengerStagingKind,
} from "@/lib/community-messenger/upload/messenger-direct-upload-policy";

export const MESSENGER_STAGING_GC_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type MessengerStagingGcLimits = {
  /** 이번 실행에서 훑을 사용자 폴더 수(버킷당) */
  maxUsersPerBucket: number;
  /** Storage list 호출 총 상한 */
  maxListCalls: number;
  /** 삭제 객체 총 상한 */
  maxRemovals: number;
  /** 실행 시간 상한(ms) */
  timeBudgetMs: number;
  /** 루트 폴더 페이지 상한(페이지당 LIST_PAGE) */
  maxRootPages: number;
};

export const MESSENGER_STAGING_GC_DEFAULT_LIMITS: MessengerStagingGcLimits = {
  maxUsersPerBucket: 600,
  maxListCalls: 2000,
  maxRemovals: 2000,
  timeBudgetMs: 45_000,
  maxRootPages: 50,
};

const LIST_PAGE = 1000;
const REMOVE_CHUNK = 100;
const USER_FOLDER_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STAGING_FOLDERS: Array<{ kind: MessengerStagingKind; name: string }> = [
  { kind: "file", name: "messenger-file-staging" },
  { kind: "image", name: "messenger-image-staging" },
];

type ListedObject = { name?: string | null; id?: string | null; created_at?: string | null };

/** 테스트 가능한 최소 Storage 인터페이스(supabase-js `storage` 와 호환) */
export type MessengerStagingGcStorage = {
  from(bucket: string): {
    list(
      path: string,
      options?: { limit?: number; offset?: number; sortBy?: { column: string; order: string } }
    ): Promise<{ data: ListedObject[] | null; error: { message?: string } | null }>;
    remove(paths: string[]): Promise<{ data: unknown; error: { message?: string } | null }>;
  };
};

export type MessengerStagingGcBucketResult = {
  bucket: string;
  skipped?: "list_failed";
  users_total: number;
  users_scanned: number;
  staged_objects: number;
  stale: number;
  removed: number;
  remove_failed: number;
};

export type MessengerStagingGcResult = {
  max_age_hours: number;
  list_calls: number;
  removed: number;
  remove_failed: number;
  capped: false | "list_calls" | "removals" | "time";
  buckets: MessengerStagingGcBucketResult[];
};

/** 날짜별 시작 위치 — 매일 다른 사용자 구간부터 훑는다 */
export function messengerStagingGcStartIndex(total: number, perRun: number, nowMs: number): number {
  if (total <= 0 || perRun <= 0 || total <= perRun) return 0;
  const day = Math.floor(nowMs / (24 * 60 * 60 * 1000));
  return (day * perRun) % total;
}

export function isMessengerStagingObjectStale(createdAt: string | null | undefined, nowMs: number, maxAgeMs: number): boolean {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  return Number.isFinite(t) && t < nowMs - maxAgeMs;
}

export async function runMessengerStagingGc(input: {
  storage: MessengerStagingGcStorage;
  nowMs?: number;
  maxAgeMs?: number;
  limits?: Partial<MessengerStagingGcLimits>;
  buckets?: string[];
}): Promise<MessengerStagingGcResult> {
  const nowMs = input.nowMs ?? Date.now();
  const maxAgeMs = input.maxAgeMs ?? MESSENGER_STAGING_GC_MAX_AGE_MS;
  const limits = { ...MESSENGER_STAGING_GC_DEFAULT_LIMITS, ...(input.limits ?? {}) };
  const startedAt = Date.now();
  const buckets = input.buckets ?? [MESSENGER_PRIVATE_MEDIA_BUCKET, MESSENGER_LEGACY_MEDIA_BUCKET];

  const out: MessengerStagingGcResult = {
    max_age_hours: Math.round(maxAgeMs / 3_600_000),
    list_calls: 0,
    removed: 0,
    remove_failed: 0,
    capped: false,
    buckets: [],
  };

  const budgetHit = (): boolean => {
    if (out.capped) return true;
    if (out.list_calls >= limits.maxListCalls) out.capped = "list_calls";
    else if (out.removed + out.remove_failed >= limits.maxRemovals) out.capped = "removals";
    else if (Date.now() - startedAt >= limits.timeBudgetMs) out.capped = "time";
    return Boolean(out.capped);
  };

  for (const bucketName of buckets) {
    if (budgetHit()) break;
    const bucket = input.storage.from(bucketName);
    const res: MessengerStagingGcBucketResult = {
      bucket: bucketName,
      users_total: 0,
      users_scanned: 0,
      staged_objects: 0,
      stale: 0,
      removed: 0,
      remove_failed: 0,
    };
    out.buckets.push(res);

    /** 페이지 단위 list — 실패·상한이면 null */
    const listAll = async (path: string, maxPages: number): Promise<ListedObject[] | null> => {
      const rows: ListedObject[] = [];
      for (let page = 0; page < maxPages; page += 1) {
        if (budgetHit()) return rows;
        out.list_calls += 1;
        let data: ListedObject[] | null = null;
        try {
          const r = await bucket.list(path, {
            limit: LIST_PAGE,
            offset: page * LIST_PAGE,
            sortBy: { column: "name", order: "asc" },
          });
          if (r.error) return null;
          data = r.data ?? [];
        } catch {
          return null;
        }
        rows.push(...data);
        if (data.length < LIST_PAGE) break;
      }
      return rows;
    };

    const pendingRemove: string[] = [];
    const flushRemove = async (force: boolean) => {
      while (pendingRemove.length >= (force ? 1 : REMOVE_CHUNK)) {
        const chunk = pendingRemove.splice(0, REMOVE_CHUNK);
        try {
          const { error } = await bucket.remove(chunk);
          if (error) {
            res.remove_failed += chunk.length;
            out.remove_failed += chunk.length;
          } else {
            res.removed += chunk.length;
            out.removed += chunk.length;
          }
        } catch {
          res.remove_failed += chunk.length;
          out.remove_failed += chunk.length;
        }
      }
    };

    const root = await listAll("", limits.maxRootPages);
    if (root == null) {
      res.skipped = "list_failed";
      continue;
    }
    const users = root
      .filter((f) => f && !f.id && typeof f.name === "string" && USER_FOLDER_RE.test(f.name))
      .map((f) => String(f.name));
    res.users_total = users.length;
    const perRun = Math.min(limits.maxUsersPerBucket, users.length);
    const start = messengerStagingGcStartIndex(users.length, perRun, nowMs);

    for (let i = 0; i < perRun; i += 1) {
      if (budgetHit()) break;
      const userId = users[(start + i) % users.length]!;
      res.users_scanned += 1;
      const community = await listAll(`${userId}/community`, 1);
      if (!community) continue;
      const names = new Set(community.filter((f) => f && !f.id && f.name).map((f) => String(f.name)));
      for (const folder of STAGING_FOLDERS) {
        if (!names.has(folder.name) || budgetHit()) continue;
        const stagingDir = `${userId}/community/${folder.name}`;
        const rooms = await listAll(stagingDir, 5);
        if (!rooms) continue;
        for (const room of rooms) {
          if (budgetHit()) break;
          if (!room || room.id || !room.name) continue;
          const roomId = String(room.name);
          const dir = `${stagingDir}/${roomId}`;
          const objs = await listAll(dir, 5);
          if (!objs) continue;
          for (const obj of objs) {
            if (!obj || !obj.id || !obj.name) continue;
            const path = `${dir}/${obj.name}`;
            /** staging leaf 규칙(uuid.ext)과 일치하는 것만 */
            if (!parseMessengerStagedPath({ kind: folder.kind, userId, roomId, path }).ok) continue;
            res.staged_objects += 1;
            if (!isMessengerStagingObjectStale(obj.created_at, nowMs, maxAgeMs)) continue;
            if (out.removed + out.remove_failed + pendingRemove.length >= limits.maxRemovals) {
              out.capped = "removals";
              break;
            }
            res.stale += 1;
            pendingRemove.push(path);
          }
          await flushRemove(false);
        }
      }
    }
    await flushRemove(true);
  }
  return out;
}
