/**
 * 백업·복구 — 단일 가변 상태 (관리자 UI + 유틸).
 * 영속화는 `backup-db` + `/api/admin/backup` 가 담당.
 */
import type {
  BackupItem,
  BackupRestore,
  BackupSnapshot,
  BackupSnapshotStatus,
  BackupSnapshotType,
  RestoreStatus,
} from "@/lib/types/backup";

export type BackupBundleV1 = {
  version: 1;
  snapshots: BackupSnapshot[];
  items: BackupItem[];
  restores: BackupRestore[];
};

const SNAPSHOTS: BackupSnapshot[] = [];
const ITEMS: BackupItem[] = [];
const RESTORES: BackupRestore[] = [];

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultBackupBundle(): BackupBundleV1 {
  return {
    version: 1,
    snapshots: [],
    items: [],
    restores: [],
  };
}

/** 서버에서 로드한 번들로 메모리 상태 교체 (관리자 클라이언트 hydration) */
export function importBackupBundle(bundle: BackupBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(SNAPSHOTS, (bundle.snapshots ?? []).map((s) => ({ ...s })));
  replaceArray(ITEMS, (bundle.items ?? []).map((i) => ({ ...i })));
  replaceArray(RESTORES, (bundle.restores ?? []).map((r) => ({ ...r })));
}

export function exportBackupBundle(): BackupBundleV1 {
  return {
    version: 1,
    snapshots: SNAPSHOTS.map((s) => ({ ...s })),
    items: ITEMS.map((i) => ({ ...i })),
    restores: RESTORES.map((r) => ({ ...r })),
  };
}

export function getBackupSnapshots(filters?: {
  status?: BackupSnapshotStatus;
  snapshotType?: BackupSnapshotType;
}): BackupSnapshot[] {
  let list = [...SNAPSHOTS].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  if (filters?.status) list = list.filter((s) => s.status === filters.status);
  if (filters?.snapshotType)
    list = list.filter((s) => s.snapshotType === filters.snapshotType);
  return list;
}

export function getBackupSnapshotById(id: string): BackupSnapshot | undefined {
  return SNAPSHOTS.find((s) => s.id === id);
}

export function getBackupItems(snapshotId: string): BackupItem[] {
  return ITEMS.filter((i) => i.snapshotId === snapshotId);
}

export function getBackupRestores(filters?: {
  snapshotId?: string;
  restoreStatus?: RestoreStatus;
}): BackupRestore[] {
  let list = [...RESTORES].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );
  if (filters?.snapshotId)
    list = list.filter((r) => r.snapshotId === filters.snapshotId);
  if (filters?.restoreStatus)
    list = list.filter((r) => r.restoreStatus === filters.restoreStatus);
  return list;
}
