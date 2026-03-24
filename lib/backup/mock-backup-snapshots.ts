/**
 * 54단계: 백업 스냅샷 mock
 */

import type {
  BackupSnapshot,
  BackupSnapshotStatus,
  BackupSnapshotType,
} from "@/lib/types/backup";

const now = new Date().toISOString();

const SNAPSHOTS: BackupSnapshot[] = [
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
