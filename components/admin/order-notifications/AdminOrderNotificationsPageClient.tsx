"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionQueueCardGrid } from "@/components/admin/action-queue/AdminActionQueueCardGrid";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";

/**
 * /admin/order-notifications — Admin ops Action Queue surface (URL kept for compatibility).
 * Data = the Bell payload (/api/admin/admin-bell via AdminOpsRealtimeBridge) rendered from the
 * Action Queue registry, so this page, the Bell and the CP Action Queue always agree.
 * DO NOT read Member me-notifications inbox as Admin ops authority.
 */
export function AdminOrderNotificationsPageClient() {
  const { language, safeT } = useI18n();
  const { adminBellCount, queueCategories, queueTotalComplete, queueLoadState } =
    useAdminStorePointPendingCount();
  const loading = queueLoadState === "loading";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AdminPageHeader
        titleKey="admin_menu_order_notifications"
        descriptionKey="admin_action_queue_page_desc"
      />
      <p className="text-sm text-sam-muted tabular-nums" data-testid="admin-order-notifications-total">
        {safeT("admin_cp_action_queue_total", { fallbackKo: "대기 항목", fallbackEn: "Pending items" })}{" "}
        {loading ? "…" : queueTotalComplete ? adminBellCount : `${adminBellCount}+`}
      </p>
      <p className="text-xs text-sam-muted">
        {safeT("admin_cp_action_queue_meaning", {
          fallbackKo: "벨 숫자 = 관리자가 지금 처리해야 할 업무 건수입니다 (알림 미읽음 수가 아닙니다).",
          fallbackEn: "Bell number = admin tasks to handle now (not unread notifications).",
        })}
      </p>
      {!queueTotalComplete ? (
        <p className="text-sm text-sam-warning" role="status">
          {safeT("admin_cp_action_queue_incomplete", {
            fallbackKo: "일부 항목을 불러오지 못해 합계가 불완전합니다.",
            fallbackEn: "Some categories failed to load, so the total is incomplete.",
          })}
        </p>
      ) : null}
      {queueLoadState === "error" ? (
        <p className="text-sm text-red-600" role="status">
          {safeT("admin_cp_action_queue_stale", {
            fallbackKo: "최근 갱신에 실패했습니다. 마지막으로 불러온 값입니다.",
            fallbackEn: "The latest refresh failed. Showing the last loaded values.",
          })}
        </p>
      ) : null}
      <AdminActionQueueCardGrid categories={queueCategories} loading={loading} />
      <p className="text-xs text-sam-muted">
        <Link href="/admin/order-notifications/settings" className="text-signature underline">
          {language === "en" ? "Notification sound settings" : "알림음 설정"}
        </Link>
      </p>
    </div>
  );
}
