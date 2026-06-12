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

function defaultSnapshots(): BackupSnapshot[] {
  return [
    {
      id: "bs-1",
      snapshotName: "snapshot-2024-03-17-01",
      snapshotType: "scheduled" as BackupSnapshotType,
      status: "completed" as BackupSnapshotStatus,
      startedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      completedAt: new Date(Date.now() - 2 * 86400000 + 60000).toISOString(),
      size: "1.2 GB",
      createdByAdminId: null,
      note: "",
    },
    {
      id: "bs-2",
      snapshotName: "pre-release-1.3.0",
      snapshotType: "pre-release" as BackupSnapshotType,
      status: "completed" as BackupSnapshotStatus,
      startedAt: new Date(Date.now() - 1 * 86400000).toISOString(),
      completedAt: new Date(Date.now() - 1 * 86400000 + 90000).toISOString(),
      size: "1.3 GB",
      createdByAdminId: "admin1",
      note: "1.3.0 배포 전",
    },
    {
      id: "bs-3",
      snapshotName: "manual-backup-now",
      snapshotType: "manual" as BackupSnapshotType,
      status: "running" as BackupSnapshotStatus,
      startedAt: new Date(Date.now() - 300).toISOString(),
      completedAt: null,
      size: "-",
      createdByAdminId: "admin1",
      note: "",
    },
  ];
}

function defaultItems(): BackupItem[] {
  return [
    { id: "bi-1", snapshotId: "bs-1", tableName: "products", rowCount: 12000, size: "45 MB", status: "completed" },
    { id: "bi-2", snapshotId: "bs-1", tableName: "users", rowCount: 5000, size: "12 MB", status: "completed" },
    { id: "bi-3", snapshotId: "bs-1", tableName: "chats", rowCount: 8000, size: "120 MB", status: "completed" },
    { id: "bi-4", snapshotId: "bs-2", tableName: "products", rowCount: 12100, size: "46 MB", status: "completed" },
    { id: "bi-5", snapshotId: "bs-2", tableName: "users", rowCount: 5020, size: "12 MB", status: "completed" },
  ];
}

function defaultRestores(): BackupRestore[] {
  const now = new Date().toISOString();
  return [
    {
      id: "br-1",
      snapshotId: "bs-1",
      restoreStatus: "completed" as RestoreStatus,
      startedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
      completedAt: new Date(Date.now() - 7 * 86400000 + 120000).toISOString(),
      restoreType: "full",
      note: "시뮬레이션 후 실제 복구 (mock)",
    },
    {
      id: "br-2",
      snapshotId: "bs-2",
      restoreStatus: "pending" as RestoreStatus,
      startedAt: now,
      completedAt: null,
      restoreType: "partial",
      note: "복구 시뮬레이션 대기",
    },
  ];
}

const SNAPSHOTS: BackupSnapshot[] = defaultSnapshots();
const ITEMS: BackupItem[] = defaultItems();
const RESTORES: BackupRestore[] = defaultRestores();

function replaceArray<T>(target: T[], next: T[]) {
  target.length = 0;
  target.push(...next);
}

export function createDefaultBackupBundle(): BackupBundleV1 {
  return {
    version: 1,
    snapshots: defaultSnapshots().map((s) => ({ ...s })),
    items: defaultItems().map((i) => ({ ...i })),
    restores: defaultRestores().map((r) => ({ ...r })),
  };
}

/** 서버에서 로드한 번들로 메모리 상태 교체 (관리자 클라이언트 hydration) */
export function importBackupBundle(bundle: BackupBundleV1): void {
  if (bundle.version !== 1) return;
  replaceArray(SNAPSHOTS, (bundle.snapshots ?? []).map((s) => ({ ...s })));
  replaceArray(ITEMS, (bundle.items ?? []).map((i) => ({ ...i })));
  replaceArray(RESTORES, (bundle.restores ?? []).map((r) => ({ ...r })));
  if (!SNAPSHOTS.length) replaceArray(SNAPSHOTS, defaultSnapshots());
  if (!ITEMS.length) replaceArray(ITEMS, defaultItems());
  if (!RESTORES.length) replaceArray(RESTORES, defaultRestores());
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
