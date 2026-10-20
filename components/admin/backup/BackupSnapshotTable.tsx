"use client";

import { AdminEmptyState } from "@/components/admin/ui/AdminStateViews";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getBackupSnapshots } from "@/lib/backup/backup-state";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  BACKUP_SNAPSHOT_STATUS_LABEL_KEYS,
  BACKUP_SNAPSHOT_TYPE_LABEL_KEYS,
} from "@/lib/backup/backup-i18n-keys";
import type {
  BackupSnapshotStatus,
  BackupSnapshotType,
} from "@/lib/types/backup";

import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";

/** 서버/클라이언트 로케일 차이로 인한 hydration 방지: 마운트 후에만 날짜 표시 */
function ClientDate({ value }: { value: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="invisible">-</span>;
  return <>{formatAdminManilaDateTime(value)}</>;
}

export function BackupSnapshotTable() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [statusFilter, setStatusFilter] = useState<BackupSnapshotStatus | "">("");
  const [typeFilter, setTypeFilter] = useState<BackupSnapshotType | "">("");

  const snapshots = useMemo(
    () =>
      getBackupSnapshots({
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(typeFilter ? { snapshotType: typeFilter } : {}),
      }),
    [statusFilter, typeFilter]
  );

  const statusOptions: { value: BackupSnapshotStatus | ""; label: string }[] = [
    { value: "", label: t("admin_report_filter_all") },
    { value: "pending", label: t("admin_backup_status_pending") },
    { value: "running", label: t("admin_backup_status_running") },
    { value: "completed", label: t("admin_backup_status_completed") },
    { value: "failed", label: t("admin_backup_status_failed") },
  ];

  const typeOptions: { value: BackupSnapshotType | ""; label: string }[] = [
    { value: "", label: t("admin_report_filter_all") },
    { value: "manual", label: t("admin_backup_type_manual") },
    { value: "scheduled", label: t("admin_backup_type_scheduled") },
    { value: "pre-release", label: t("admin_backup_type_pre_release") },
    { value: "emergency", label: t("admin_backup_type_emergency") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="sam-text-body-secondary text-sam-muted">
          {t("admin_backup_filter_status")}
        </span>
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter((e.target.value || "") as BackupSnapshotStatus | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value || "all"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="sam-text-body-secondary text-sam-muted">
          {t("admin_backup_filter_type")}
        </span>
        <select
          value={typeFilter}
          onChange={(e) =>
            setTypeFilter((e.target.value || "") as BackupSnapshotType | "")
          }
          className="rounded border border-sam-border px-3 py-1.5 sam-text-body-secondary text-sam-fg"
        >
          {typeOptions.map((opt) => (
            <option key={opt.value || "all-type"} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {snapshots.length === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={statusFilter || typeFilter ? undefined : t("admin_backup_empty_filtered")}
          onReset={statusFilter || typeFilter ? () => { setStatusFilter(""); setTypeFilter(""); } : undefined}
        />
      ) : (
        <AdminTable
          headers={[
            t("admin_backup_th_snapshot_name"),
            t("admin_backup_th_type"),
            t("admin_backup_th_status"),
            t("admin_backup_th_started"),
            t("admin_backup_th_completed"),
            t("admin_backup_th_size"),
            t("admin_backup_th_created_by"),
            "",
          ]}
        >
          {snapshots.map((s) => (
            <tr key={s.id} className="border-b border-sam-border-soft">
              <td className="px-3 py-2.5 font-medium text-sam-fg">{s.snapshotName}</td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {t(BACKUP_SNAPSHOT_TYPE_LABEL_KEYS[s.snapshotType])}
              </td>
              <td className="px-3 py-2.5">
                <span
                  className={`rounded px-1.5 py-0.5 sam-text-helper ${
                    s.status === "completed"
                      ? "bg-sam-success-soft text-sam-success"
                      : s.status === "failed"
                        ? "bg-sam-danger-soft text-sam-danger"
                        : s.status === "running"
                          ? "bg-sam-info-soft text-sam-info"
                          : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {t(BACKUP_SNAPSHOT_STATUS_LABEL_KEYS[s.status])}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                <ClientDate value={s.startedAt} />
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {s.completedAt ? <ClientDate value={s.completedAt} /> : "-"}
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">{s.size}</td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {s.createdByAdminId ?? t("admin_backup_system")}
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/backup/${s.id}`}
                  className="text-signature hover:underline"
                >
                  {t("admin_backup_detail_link")}
                </Link>
              </td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
