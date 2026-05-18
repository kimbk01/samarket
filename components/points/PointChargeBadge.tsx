"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { PointChargeRequestStatus } from "@/lib/types/point";

const STATUS_KEYS: Record<PointChargeRequestStatus, MessageKey> = {
  pending: "points_ui_badge_pending",
  waiting_confirm: "point_status_waiting_confirm",
  on_hold: "point_status_on_hold",
  approved: "points_ui_badge_approved",
  rejected: "point_status_rejected",
  cancelled: "point_status_cancelled",
};

const STYLES: Record<PointChargeRequestStatus, string> = {
  pending: "bg-blue-100 text-blue-800",
  waiting_confirm: "bg-amber-100 text-amber-800",
  on_hold: "bg-sam-surface-muted text-sam-muted",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-sam-surface-muted text-sam-meta",
};

export function PointChargeBadge({ status }: { status: PointChargeRequestStatus }) {
  const { t } = useI18n();

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 sam-text-xxs font-semibold ${STYLES[status]}`}>
      {t(STATUS_KEYS[status])}
    </span>
  );
}
