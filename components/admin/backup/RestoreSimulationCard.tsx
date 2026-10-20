"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getBackupSnapshots, getBackupRestores } from "@/lib/backup/backup-state";
import {
  BACKUP_RESTORE_STATUS_LABEL_KEYS,
  BACKUP_RESTORE_TYPE_LABEL_KEYS,
} from "@/lib/backup/backup-i18n-keys";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

export function RestoreSimulationCard() {
  const { t } = useI18n();
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>("");
  const [simulateResult, setSimulateResult] = useState<string | null>(null);

  const snapshots = useMemo(() => getBackupSnapshots({ status: "completed" }), []);
  const restores = useMemo(() => getBackupRestores(), []);

  const handleSimulate = () => {
    if (!selectedSnapshotId) return;
    setSimulateResult(
      t("admin_backup_restore_simulate_result", { id: selectedSnapshotId })
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">
          {t("admin_backup_restore_snapshot_label")}
        </span>
        <select
          value={selectedSnapshotId}
          onChange={(e) => {
            setSelectedSnapshotId(e.target.value);
            setSimulateResult(null);
          }}
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          <option value="">{t("admin_backup_restore_select")}</option>
          {snapshots.map((s) => (
            <option key={s.id} value={s.id}>
              {s.snapshotName} ({s.size})
            </option>
          ))}
        </select>
        <AdminActionButton variant="secondary" size="sm" onClick={handleSimulate} disabled={!selectedSnapshotId}>
          {t("admin_backup_restore_simulate_btn")}
        </AdminActionButton>
      </div>
      {simulateResult ? (
        <div className="rounded-ui-rect border border-sam-success bg-sam-success-soft p-4 sam-text-body-secondary text-sam-fg">
          {simulateResult}
        </div>
      ) : null}
      <div className="rounded-ui-rect border border-sam-border bg-sam-app/50 p-4">
        <p className="sam-text-body-secondary font-medium text-sam-fg">
          {t("admin_backup_restore_recent_log")}
        </p>
        {restores.length === 0 ? (
          <p className="mt-2 sam-text-body-secondary text-sam-muted">
            {t("admin_backup_restore_log_empty")}
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {restores.slice(0, 5).map((r) => (
              <li key={r.id} className="sam-text-body-secondary text-sam-muted">
                {t("admin_backup_restore_log_snapshot", { snapshotId: r.snapshotId })} ·{" "}
                {t(BACKUP_RESTORE_TYPE_LABEL_KEYS[r.restoreType])} ·{" "}
                {t(BACKUP_RESTORE_STATUS_LABEL_KEYS[r.restoreStatus])} ·{" "}
                {r.completedAt
                  ? formatAdminManilaDateTime(r.completedAt)
                  : t("admin_backup_restore_in_progress")}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
