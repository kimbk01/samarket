"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getBackupSnapshots } from "@/lib/backup/mock-backup-snapshots";
import { AdminTable } from "@/components/admin/AdminTable";
import {
  BACKUP_SNAPSHOT_STATUS_LABEL_KEYS,
  BACKUP_SNAPSHOT_TYPE_LABEL_KEYS,
} from "@/lib/backup/backup-i18n-keys";
import type {
  BackupSnapshotStatus,
  BackupSnapshotType,
} from "@/lib/types/backup";

function backupLocale(language: string): string {
  if (language === "en") return "en-US";
  return "ko-KR";
}

/** 서버/클라이언트 로케일 차이로 인한 hydration 방지: 마운트 후에만 날짜 표시 */
function ClientDate({ value, locale }: { value: string; locale: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <span className="invisible">-</span>;
  return <>{new Date(value).toLocaleString(locale)}</>;
}

export function BackupSnapshotTable() {
  const { t, language } = useI18n();
  const locale = backupLocale(language);
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
        <div className="rounded-ui-rect border border-dashed border-sam-border bg-sam-app/50 py-12 text-center sam-text-body text-sam-muted">
          {t("admin_backup_empty_filtered")}
        </div>
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
                      ? "bg-emerald-50 text-emerald-700"
                      : s.status === "failed"
                        ? "bg-red-100 text-red-800"
                        : s.status === "running"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-sam-surface-muted text-sam-muted"
                  }`}
                >
                  {t(BACKUP_SNAPSHOT_STATUS_LABEL_KEYS[s.status])}
                </span>
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                <ClientDate value={s.startedAt} locale={locale} />
              </td>
              <td className="px-3 py-2.5 sam-text-body-secondary text-sam-muted">
                {s.completedAt ? <ClientDate value={s.completedAt} locale={locale} /> : "-"}
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
