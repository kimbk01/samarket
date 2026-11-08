"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdminPersonStoreRow, AdminUserDetailPayload } from "@/components/admin/users/AdminTestUserDetail";

export function AdminMemberAlertStrip({
  user,
  stores,
}: {
  user: AdminUserDetailPayload;
  stores: AdminPersonStoreRow[];
}) {
  const { safeT } = useI18n();
  const alerts: string[] = [];
  if (user.phone_verified !== true) {
    alerts.push(
      safeT("admin_users_alert_phone_unverified"),
    );
  }
  const moderation = String(user.moderation_status ?? "").toLowerCase();
  const status = String(user.status ?? "").toLowerCase();
  if (moderation === "suspended" || status === "suspended") {
    alerts.push(
      safeT("admin_users_alert_suspended"),
    );
  }
  if (moderation === "banned" || status === "banned") {
    alerts.push(
      safeT("admin_users_alert_banned"),
    );
  }
  if (stores.some((store) => String(store.approval_status ?? "").toLowerCase() === "pending")) {
    alerts.push(
      safeT("admin_users_alert_store_pending"),
    );
  }
  if (alerts.length === 0) return null;
  return (
    <div className="rounded-md border border-sam-warning bg-sam-warning-soft px-3 py-2 text-[13px] font-semibold text-sam-warning">
      {alerts.map((text) => (
        <p key={text}>⚠ {text}</p>
      ))}
    </div>
  );
}
