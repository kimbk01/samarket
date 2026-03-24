/**
 * 54단계: 복구 실행 로그 mock
 */

import type { BackupRestore, RestoreStatus } from "@/lib/types/backup";

const now = new Date().toISOString();

const RESTORES: BackupRestore[] = [
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
