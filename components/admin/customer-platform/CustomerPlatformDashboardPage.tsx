"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionQueueCardGrid } from "@/components/admin/action-queue/AdminActionQueueCardGrid";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";

/** Overview supplies Monitoring only; Action Queue reads the same Bell payload (provider). */
type OverviewPayload = {
  ok?: boolean;
  monitoring?: {
    /** null = could not load */
    member_inbox_threads: number | null;
    app_notices_active: number | null;
    notification_campaigns: number | null;
  };
};

type LoadState = "loading" | "ready" | "error";

export function CustomerPlatformDashboardPage() {
  const { safeT } = useI18n();
  const [payload, setPayload] = useState<OverviewPayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const res = await fetch("/api/admin/customer-platform/overview", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as OverviewPayload;
      if (!res.ok || !json.ok) {
        setPayload(null);
        setLoadState("error");
        return;
      }
      setPayload(json);
      setLoadState("ready");
    } catch {
      setPayload(null);
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mon = payload?.monitoring;
  const {
    adminBellCount,
    queueCategories,
    queueTotalComplete,
    queueLoadState,
  } = useAdminStorePointPendingCount();
  const queueLoading = queueLoadState === "loading";
  const monValue = (n: number | null | undefined) =>
    loadState === "loading" ? "…" : n == null ? "—" : n;

  return (
    <div className="sam-page-stack">
      <AdminPageHeader
        titleKey="admin_menu_customer_platform"
        descriptionKey="admin_cp_dashboard_intro"
      />

      <p className="sam-text-body-secondary text-sam-muted">
        {safeT("admin_cp_dashboard_intro", {
          fallbackKo:
            "회원(Member)과 매장(Store) 고객지원·포인트·알림을 한곳에서 운영합니다. 아래 큐에서 즉시 처리하세요.",
          fallbackEn:
            "Operate Member and Store support, points, and notifications in one place. Start from the action queue below.",
        })}
      </p>

      {loadState === "error" ? (
        <div
          className="rounded-ui-rect border border-sam-warning/15 bg-sam-warning-soft px-4 py-3 sam-text-body-secondary text-sam-warning"
          role="alert"
        >
          <p className="font-medium">
            {safeT("admin_cp_dashboard_load_error", {
              fallbackKo: "운영 현황을 불러오지 못했습니다.",
              fallbackEn: "Could not load Customer Platform overview.",
            })}
          </p>
          <button type="button" onClick={() => void load()} className="sam-btn sam-btn--outline sam-btn--sm mt-3">
            {safeT("admin_dashboard_retry", { fallbackKo: "다시 시도", fallbackEn: "Retry" })}
          </button>
        </div>
      ) : null}

      <section id="action-queue" className="space-y-3 scroll-mt-20">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="sam-text-section-title font-semibold text-sam-fg">
            {safeT("admin_menu_cp_action_queue", {
              fallbackKo: "Action Queue",
              fallbackEn: "Action Queue",
            })}
          </h2>
          <p className="sam-text-helper text-sam-muted tabular-nums" data-testid="admin-cp-action-queue-total">
            {queueLoading
              ? "…"
              : `${safeT("admin_cp_action_queue_total", {
                  fallbackKo: "대기",
                  fallbackEn: "Pending",
                })} ${queueTotalComplete ? adminBellCount : `${adminBellCount}+`}`}
          </p>
        </div>
        <p className="sam-text-helper text-sam-muted">
          {safeT("admin_cp_action_queue_meaning", {
            fallbackKo: "벨 숫자 = 관리자가 지금 처리해야 할 업무 건수입니다 (알림 미읽음 수가 아닙니다).",
            fallbackEn: "Bell number = admin tasks to handle now (not unread notifications).",
          })}
        </p>
        {!queueTotalComplete ? (
          <p className="sam-text-helper text-sam-warning" role="status">
            {safeT("admin_cp_action_queue_incomplete", {
              fallbackKo: "일부 항목을 불러오지 못해 합계가 불완전합니다.",
              fallbackEn: "Some categories failed to load, so the total is incomplete.",
            })}
          </p>
        ) : null}
        {queueLoadState === "error" ? (
          <p className="sam-text-helper text-sam-warning" role="status">
            {safeT("admin_cp_action_queue_stale", {
              fallbackKo: "최근 갱신에 실패했습니다. 마지막으로 불러온 값입니다.",
              fallbackEn: "The latest refresh failed. Showing the last loaded values.",
            })}
          </p>
        ) : null}
        <AdminActionQueueCardGrid categories={queueCategories} loading={queueLoading} />
      </section>

      <section id="monitoring" className="space-y-3 scroll-mt-20">
        <h2 className="sam-text-section-title font-semibold text-sam-fg">
          {safeT("admin_menu_cp_monitoring", {
            fallbackKo: "Monitoring",
            fallbackEn: "Monitoring",
          })}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/admin/app/notices"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 hover:border-signature/40"
          >
            <p className="sam-text-body font-semibold text-sam-fg">
              {safeT("admin_menu_notices", { fallbackKo: "공지", fallbackEn: "Notices" })}
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-sam-fg">
              {monValue(mon?.app_notices_active)}
            </p>
            <p className="sam-text-helper text-sam-muted">
              {safeT("admin_cp_mon_notices_hint", {
                fallbackKo: "활성 공지",
                fallbackEn: "Active notices",
              })}
            </p>
          </Link>
          <Link
            href="/admin/member-notes?kind=inbox"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 hover:border-signature/40"
          >
            <p className="sam-text-body font-semibold text-sam-fg">
              {safeT("admin_menu_cp_member_inbox", {
                fallbackKo: "회원 쪽지",
                fallbackEn: "Member inbox",
              })}
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-sam-fg">
              {monValue(mon?.member_inbox_threads)}
            </p>
          </Link>
          <Link
            href="/admin/notifications"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 hover:border-signature/40"
          >
            <p className="sam-text-body font-semibold text-sam-fg">
              {safeT("admin_menu_dibay_notification_campaigns", {
                fallbackKo: "알림 엔진",
                fallbackEn: "Notification Engine",
              })}
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-sam-fg">
              {monValue(mon?.notification_campaigns)}
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}
