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
      safeT("admin_users_alert_phone_unverified", {
        fallbackKo: "전화 인증 미완료",
        fallbackEn: "Phone not verified",
      }),
    );
  }
  const moderation = String(user.moderation_status ?? "").toLowerCase();
  const status = String(user.status ?? "").toLowerCase();
  if (moderation === "suspended" || status === "suspended") {
    alerts.push(
      safeT("admin_users_alert_suspended", {
        fallbackKo: "계정 정지 상태",
        fallbackEn: "Account suspended",
      }),
    );
  }
  if (moderation === "banned" || status === "banned") {
    alerts.push(
      safeT("admin_users_alert_banned", {
        fallbackKo: "계정 차단 상태",
        fallbackEn: "Account banned",
      }),
    );
  }
  if (stores.some((store) => String(store.approval_status ?? "").toLowerCase() === "pending")) {
    alerts.push(
      safeT("admin_users_alert_store_pending", {
        fallbackKo: "매장 승인 대기",
        fallbackEn: "Store approval pending",
      }),
    );
  }
  if (alerts.length === 0) return null;
  return (
    <div className="rounded-md border border-[#fdead7] bg-[#fff6ed] px-3 py-2 text-[13px] font-semibold text-[#c4320a]">
      {alerts.map((text) => (
        <p key={text}>⚠ {text}</p>
      ))}
    </div>
  );
}
