/**
 * 54단계: 백업 / 복구 타입
 */

export type BackupSnapshotType =
  | "manual"
  | "scheduled"
  | "pre-release"
  | "emergency";

export type BackupSnapshotStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed";

export interface BackupSnapshot {
  id: string;
  snapshotName: string;
  snapshotType: BackupSnapshotType;
  status: BackupSnapshotStatus;
  startedAt: string;
  completedAt: string | null;
  size: string;
  createdByAdminId: string | null;
  note: string;
}

export interface BackupItem {
  id: string;
  snapshotId: string;
  tableName: string;
  rowCount: number;
  size: string;
  status: BackupSnapshotStatus;
}

export type RestoreStatus = "pending" | "running" | "completed" | "failed";

export type RestoreType = "full" | "partial";

export interface BackupRestore {
  id: string;
  snapshotId: string;
  restoreStatus: RestoreStatus;
  startedAt: string;
  completedAt: string | null;
  restoreType: RestoreType;
  note: string;
}
