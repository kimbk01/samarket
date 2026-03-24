/**
 * 54단계: 백업/복구 라벨 유틸
 */

import type {
  BackupSnapshotType,
  BackupSnapshotStatus,
  RestoreStatus,
  RestoreType,
} from "@/lib/types/backup";

const SNAPSHOT_TYPE_LABELS: Record<BackupSnapshotType, string> = {
  manual: "수동",
  scheduled: "예약",
  "pre-release": "배포 전",
  emergency: "긴급",
};

const SNAPSHOT_STATUS_LABELS: Record<BackupSnapshotStatus, string> = {
  pending: "대기",
  running: "진행중",
  completed: "완료",
  failed: "실패",
};

const RESTORE_STATUS_LABELS: Record<RestoreStatus, string> = {
  pending: "대기",
  running: "진행중",
  completed: "완료",
  failed: "실패",
};

const RESTORE_TYPE_LABELS: Record<RestoreType, string> = {
  full: "전체",
  partial: "부분",
};

export function getSnapshotTypeLabel(v: BackupSnapshotType): string {
  return SNAPSHOT_TYPE_LABELS[v] ?? v;
}

export function getSnapshotStatusLabel(v: BackupSnapshotStatus): string {
  return SNAPSHOT_STATUS_LABELS[v] ?? v;
}

export function getRestoreStatusLabel(v: RestoreStatus): string {
  return RESTORE_STATUS_LABELS[v] ?? v;
}

export function getRestoreTypeLabel(v: RestoreType): string {
  return RESTORE_TYPE_LABELS[v] ?? v;
}
