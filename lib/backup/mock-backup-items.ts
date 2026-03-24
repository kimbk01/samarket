/**
 * 54단계: 백업 항목 mock
 */

import type { BackupItem } from "@/lib/types/backup";

const ITEMS: BackupItem[] = [
  { id: "bi-1", snapshotId: "bs-1", tableName: "products", rowCount: 12000, size: "45 MB", status: "completed" },
  { id: "bi-2", snapshotId: "bs-1", tableName: "users", rowCount: 5000, size: "12 MB", status: "completed" },
  { id: "bi-3", snapshotId: "bs-1", tableName: "chats", rowCount: 8000, size: "120 MB", status: "completed" },
  { id: "bi-4", snapshotId: "bs-2", tableName: "products", rowCount: 12100, size: "46 MB", status: "completed" },
  { id: "bi-5", snapshotId: "bs-2", tableName: "users", rowCount: 5020, size: "12 MB", status: "completed" },
];

export function getBackupItems(snapshotId: string): BackupItem[] {
  return ITEMS.filter((i) => i.snapshotId === snapshotId);
}
