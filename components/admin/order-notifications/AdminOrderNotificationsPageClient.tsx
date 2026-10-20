"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionQueueCardGrid } from "@/components/admin/action-queue/AdminActionQueueCardGrid";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import { ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY } from "@/lib/admin/admin-action-queue-registry";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";

/**
 * /admin/order-notifications — Admin ops Action Queue surface (URL kept for compatibility).
 * Data = the Bell payload (/api/admin/admin-bell via AdminOpsRealtimeBridge) rendered from the
 * Action Queue registry, so this page, the Bell and the CP Action Queue always agree.
 * DO NOT read Member me-notifications inbox as Admin ops authority.
 */
export function AdminOrderNotificationsPageClient() {
  const { language, safeT } = useI18n();
  const ko = language !== "en";
  const { adminBellCount, queueCategories, queueTotalComplete, queueLoadState, refresh } =
    useAdminStorePointPendingCount();
  const loading = queueLoadState === "loading";
  /** 카드 그리드가 실제로 그리는 카드 수 (그리드와 같은 조건 — 권한 없음·보관·링크 없음 제외). */
  const visibleCards = queueCategories.filter(
    (c) =>
      c.status !== "forbidden" &&
      c.listHref &&
      ADMIN_ACTION_QUEUE_REGISTRY_BY_KEY.get(c.key)?.lifecycle === "active"
  ).length;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AdminPageHeader
        titleKey="admin_menu_order_notifications"
        descriptionKey="admin_action_queue_page_desc"
      />
      <p className="text-sm text-sam-muted tabular-nums" data-testid="admin-order-notifications-total">
        {safeT("admin_cp_action_queue_total", { fallbackKo: "대기 항목", fallbackEn: "Pending items" })}{" "}
        {loading ? "…" : queueTotalComplete ? formatAdminNumber(adminBellCount) : `${formatAdminNumber(adminBellCount)}+`}
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
        visibleCards > 0 ? (
          <p className="text-sm text-sam-danger" role="status">
            {safeT("admin_cp_action_queue_stale", {
              fallbackKo: "최근 갱신에 실패했습니다. 마지막으로 불러온 값입니다.",
              fallbackEn: "The latest refresh failed. Showing the last loaded values.",
            })}
          </p>
        ) : (
          <AdminErrorState ko={ko} code="load_failed" onRetry={() => void refresh()} />
        )
      ) : null}
      {/* 화면 상태 (R7 · 6): 첫 로딩 = 로딩 상태 · 처리할 카드 0 = 빈 상태 · 직전 카드는 실패해도 유지 */}
      {loading && visibleCards === 0 ? (
        <AdminLoadingState ko={ko} />
      ) : visibleCards === 0 ? (
        queueLoadState === "error" ? null : (
          <AdminEmptyState
            ko={ko}
            message={ko ? "지금 처리할 업무가 없습니다." : "Nothing to handle right now."}
          />
        )
      ) : (
        <AdminActionQueueCardGrid categories={queueCategories} loading={loading} />
      )}
      <p className="text-xs text-sam-muted">
        <Link href="/admin/order-notifications/settings" className="text-signature underline">
          {language === "en" ? "Notification sound settings" : "알림음 설정"}
        </Link>
      </p>
    </div>
  );
}
