"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import type { ModerationStatus } from "@/lib/types/report";

const LABEL_KEYS: Record<ModerationStatus, MessageKey> = {
  normal: "admin_user_mod_normal",
  warned: "admin_user_mod_warned",
  suspended: "admin_user_mod_suspended",
  banned: "admin_user_mod_badge_banned",
};

const CLASSES: Record<ModerationStatus, string> = {
  normal: "bg-emerald-50 text-emerald-800",
  warned: "bg-amber-100 text-amber-800",
  suspended: "bg-orange-100 text-orange-800",
  banned: "bg-red-50 text-red-700",
};

interface AdminModerationStatusBadgeProps {
  status: ModerationStatus;
  className?: string;
}

export function AdminModerationStatusBadge({
  status,
  className = "",
}: AdminModerationStatusBadgeProps) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 sam-text-helper font-medium ${CLASSES[status]} ${className}`}
    >
      {t(LABEL_KEYS[status])}
    </span>
  );
}
