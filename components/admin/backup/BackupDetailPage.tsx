"use client";

import { useEffect, useMemo, useState } from "react";
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

interface BackupDetailPageProps {
  snapshotId: string;
}

function backupLocale(language: string): string {
  if (language === "en") return "en-US";
  return "ko-KR";
}

export function BackupDetailPage({ snapshotId }: BackupDetailPageProps) {
  const { t, language } = useI18n();
  const locale = backupLocale(language);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadBackupFromServer().then(() => setHydrated(true));
  }, []);

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
    return (
      <div className="py-12 text-center sam-text-body text-sam-muted">
        {t("admin_loading_ops_settings")}
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
        {t("admin_backup_snapshot_not_found")}
      </div>
    );
  }

  const startedAt = new Date(snapshot.startedAt).toLocaleString(locale);
  const completedAt = snapshot.completedAt
    ? new Date(snapshot.completedAt).toLocaleString(locale)
    : null;

  return (
    <div className="space-y-6">
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
        <div className="flex flex-wrap items-center gap-2 sam-text-helper text-sam-muted">
          <span>{t(BACKUP_SNAPSHOT_TYPE_LABEL_KEYS[snapshot.snapshotType])}</span>
          <span
            className={`rounded px-1.5 py-0.5 ${
              snapshot.status === "completed"
                ? "bg-emerald-50 text-emerald-700"
                : snapshot.status === "failed"
                  ? "bg-red-100 text-red-800"
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
                  {snapshot.status}
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
                      ? "bg-emerald-50 text-emerald-700"
                      : r.restoreStatus === "failed"
                        ? "bg-red-100 text-red-800"
                        : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {t(BACKUP_RESTORE_STATUS_LABEL_KEYS[r.restoreStatus])}
                </span>
                {t(BACKUP_RESTORE_TYPE_LABEL_KEYS[r.restoreType])} ·{" "}
                {new Date(r.startedAt).toLocaleString(locale)}
                {r.completedAt ? ` → ${new Date(r.completedAt).toLocaleString(locale)}` : null}
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
