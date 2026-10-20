"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import { useMemo } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  getBackupSnapshotById,
  getBackupItems,
  getBackupRestores,
} from "@/lib/backup/backup-state";
import { loadBackupFromServer } from "@/lib/backup/backup-sync-client";
import {
  BACKUP_RESTORE_STATUS_LABEL_KEYS,
  BACKUP_RESTORE_TYPE_LABEL_KEYS,
  BACKUP_SNAPSHOT_STATUS_LABEL_KEYS,
  BACKUP_SNAPSHOT_TYPE_LABEL_KEYS,
} from "@/lib/backup/backup-i18n-keys";
import { AdminTable } from "@/components/admin/AdminTable";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

interface BackupDetailPageProps {
  snapshotId: string;
}

export function BackupDetailPage({ snapshotId }: BackupDetailPageProps) {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const { state: loadState, reload } = useAdminSyncLoad(loadBackupFromServer);
  const hydrated = loadState.status === "ready";

  const snapshot = useMemo(
    () => (hydrated ? getBackupSnapshotById(snapshotId) : undefined),
    [hydrated, snapshotId]
  );
  const items = useMemo(
    () => (hydrated ? getBackupItems(snapshotId) : []),
    [hydrated, snapshotId]
  );
  const restores = useMemo(
    () => (hydrated ? getBackupRestores({ snapshotId }) : []),
    [hydrated, snapshotId]
  );

  if (!hydrated) {
    return <AdminSyncLoadGate state={loadState} onRetry={reload} />;
  }

  if (!snapshot) {
    return (
      <AdminEmptyState ko={ko} message={t("admin_backup_snapshot_not_found")} />
    );
  }

  const startedAt = formatAdminManilaDateTime(snapshot.startedAt);
  const completedAt = snapshot.completedAt ? formatAdminManilaDateTime(snapshot.completedAt) : null;

  return (
    <div className="space-y-6">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
          <span>{t(BACKUP_SNAPSHOT_TYPE_LABEL_KEYS[snapshot.snapshotType])}</span>
          <span
            className={`rounded px-1.5 py-0.5 ${
              snapshot.status === "completed"
                ? "bg-sam-success-soft text-sam-success"
                : snapshot.status === "failed"
                  ? "bg-sam-danger-soft text-sam-danger"
                  : "bg-sam-surface-muted text-sam-muted"
            }`}
          >
            {t(BACKUP_SNAPSHOT_STATUS_LABEL_KEYS[snapshot.status])}
          </span>
        </div>
        <h2 className="mt-2 sam-text-page-title font-semibold text-sam-fg">
          {snapshot.snapshotName}
        </h2>
        <p className="mt-2 sam-text-body text-sam-fg">
          {t("admin_backup_meta_size_started", { size: snapshot.size, started: startedAt })}
          {completedAt ? t("admin_backup_meta_completed", { completed: completedAt }) : null}
        </p>
        {snapshot.note ? (
          <p className="mt-2 sam-text-body-secondary text-sam-muted">{snapshot.note}</p>
        ) : null}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-medium text-sam-fg">{t("admin_backup_items_title")}</h3>
        {items.length === 0 ? (
          <p className="mt-2 sam-text-body-secondary text-sam-muted">
            {t("admin_backup_items_empty")}
          </p>
        ) : (
          <AdminTable
            headers={[
              t("admin_backup_th_table"),
              t("admin_backup_th_row_count"),
              t("admin_backup_th_size"),
              t("admin_backup_th_status"),
            ]}
          >
            {items.map((i) => (
              <tr key={i.id} className="border-b border-sam-border-soft">
                <td className="px-3 py-2.5 font-medium text-sam-fg">{i.tableName}</td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {i.rowCount}
                </td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">{i.size}</td>
                <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                  {t(BACKUP_SNAPSHOT_STATUS_LABEL_KEYS[snapshot.status])}
                </td>
              </tr>
            ))}
          </AdminTable>
        )}
      </div>

      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <h3 className="sam-text-body font-medium text-sam-fg">
          {t("admin_backup_restore_log_title")}
        </h3>
        {restores.length === 0 ? (
          <p className="mt-2 sam-text-body-secondary text-sam-muted">
            {t("admin_backup_restore_log_empty")}
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {restores.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 sam-text-body-secondary text-sam-muted"
              >
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    r.restoreStatus === "completed"
                      ? "bg-sam-success-soft text-sam-success"
                      : r.restoreStatus === "failed"
                        ? "bg-sam-danger-soft text-sam-danger"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {t(BACKUP_RESTORE_STATUS_LABEL_KEYS[r.restoreStatus])}
                </span>
                {t(BACKUP_RESTORE_TYPE_LABEL_KEYS[r.restoreType])} ·{" "}
                {formatAdminManilaDateTime(r.startedAt)}
                {r.completedAt ? ` → ${formatAdminManilaDateTime(r.completedAt)}` : null}
                {r.note ? ` · ${r.note}` : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 sam-text-helper text-sam-muted">{t("admin_backup_restore_mock_note")}</p>
      </div>
    </div>
  );
}
