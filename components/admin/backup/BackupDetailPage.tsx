"use client";

import { useMemo } from "react";
import { getBackupSnapshotById } from "@/lib/backup/mock-backup-snapshots";
import { getBackupItems } from "@/lib/backup/mock-backup-items";
import { getBackupRestores } from "@/lib/backup/mock-backup-restores";
import { getSnapshotTypeLabel, getSnapshotStatusLabel } from "@/lib/backup/backup-utils";
import { getRestoreStatusLabel, getRestoreTypeLabel } from "@/lib/backup/backup-utils";
import { AdminTable } from "@/components/admin/AdminTable";

interface BackupDetailPageProps {
  snapshotId: string;
}

export function BackupDetailPage({ snapshotId }: BackupDetailPageProps) {
  const snapshot = useMemo(
    () => getBackupSnapshotById(snapshotId),
    [snapshotId]
  );
  const items = useMemo(() => getBackupItems(snapshotId), [snapshotId]);
  const restores = useMemo(
    () => getBackupRestores({ snapshotId }),
    [snapshotId]
  );

  if (!snapshot) {
    return (
      <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center text-[14px] text-sam-muted">
        백업 스냅샷을 찾을 수 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-sam-muted">
          <span>{getSnapshotTypeLabel(snapshot.snapshotType)}</span>
          <span
            className={`rounded px-1.5 py-0.5 ${
              snapshot.status === "completed"
                ? "bg-emerald-50 text-emerald-700"
                : snapshot.status === "failed"
                  ? "bg-red-100 text-red-800"
                  : "bg-sam-surface-muted text-sam-muted"
            }`}
          >
            {getSnapshotStatusLabel(snapshot.status)}
          </span>
        </div>
        <h2 className="mt-2 text-[18px] font-semibold text-sam-fg">
          {snapshot.snapshotName}
        </h2>
        <p className="mt-2 text-[14px] text-sam-fg">
          크기 {snapshot.size} · 시작{" "}
          {new Date(snapshot.startedAt).toLocaleString()}
          {snapshot.completedAt &&
            ` · 완료 ${new Date(snapshot.completedAt).toLocaleString()}`}
        </p>
        {snapshot.note && (
          <p className="mt-2 text-[13px] text-sam-muted">{snapshot.note}</p>
        )}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="text-[15px] font-medium text-sam-fg">백업 항목</h3>
        {items.length === 0 ? (
          <p className="mt-2 text-[13px] text-sam-muted">항목 없음</p>
        ) : (
          <AdminTable headers={["테이블", "행 수", "크기", "상태"]}>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-sam-border-soft">
                <td className="px-3 py-2.5 font-medium text-sam-fg">
                  {i.tableName}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                  {i.rowCount}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                  {i.size}
                </td>
                <td className="px-3 py-2.5 text-[13px] text-sam-muted">
                  {snapshot.status}
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="text-[15px] font-medium text-sam-fg">복구 실행 로그</h3>
        {restores.length === 0 ? (
          <p className="mt-2 text-[13px] text-sam-muted">복구 이력 없음</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {restores.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 text-[13px] text-sam-muted"
              >
                <span
                  className={`rounded px-1.5 py-0.5 text-[12px] ${
                    r.restoreStatus === "completed"
                      ? "bg-emerald-50 text-emerald-700"
                      : r.restoreStatus === "failed"
                        ? "bg-red-100 text-red-800"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {getRestoreStatusLabel(r.restoreStatus)}
                </span>
                {getRestoreTypeLabel(r.restoreType)} ·{" "}
                {new Date(r.startedAt).toLocaleString()}
                {r.completedAt &&
                  ` → ${new Date(r.completedAt).toLocaleString()}`}
                {r.note && ` · ${r.note}`}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[12px] text-sam-muted">
          실제 복구 실행은 mock. 프로덕션에서는 별도 절차 필요.
        </p>
      </div>
    </div>
  );
}
