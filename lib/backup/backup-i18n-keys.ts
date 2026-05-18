import type { MessageKey } from "@/lib/i18n/messages";
import type {
  BackupSnapshotStatus,
  BackupSnapshotType,
  RestoreStatus,
  RestoreType,
} from "@/lib/types/backup";

export const BACKUP_SNAPSHOT_TYPE_LABEL_KEYS: Record<
  BackupSnapshotType,
  MessageKey
> = {
  manual: "admin_backup_type_manual",
  scheduled: "admin_backup_type_scheduled",
  "pre-release": "admin_backup_type_pre_release",
  emergency: "admin_backup_type_emergency",
};

export const BACKUP_SNAPSHOT_STATUS_LABEL_KEYS: Record<
  BackupSnapshotStatus,
  MessageKey
> = {
  pending: "admin_backup_status_pending",
  running: "admin_backup_status_running",
  completed: "admin_backup_status_completed",
  failed: "admin_backup_status_failed",
};

export const BACKUP_RESTORE_STATUS_LABEL_KEYS: Record<RestoreStatus, MessageKey> =
  {
    pending: "admin_backup_status_pending",
    running: "admin_backup_status_running",
    completed: "admin_backup_status_completed",
    failed: "admin_backup_status_failed",
  };

export const BACKUP_RESTORE_TYPE_LABEL_KEYS: Record<RestoreType, MessageKey> = {
  full: "admin_backup_restore_type_full",
  partial: "admin_backup_restore_type_partial",
};
