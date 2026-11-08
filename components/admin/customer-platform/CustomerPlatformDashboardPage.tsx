"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionQueueCardGrid } from "@/components/admin/action-queue/AdminActionQueueCardGrid";
import { useAdminStorePointPendingCount } from "@/components/admin/store-points/AdminStorePointPendingProvider";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { adminSafeErrorCode, type AdminLoadFailure } from "@/lib/admin/admin-load-failure";

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
  const { safeT, language } = useI18n();
  const [payload, setPayload] = useState<OverviewPayload | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadErr, setLoadErr] = useState<AdminLoadFailure | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const res = await fetch("/api/admin/customer-platform/overview", {
        credentials: "include",
        cache: "no-store",
      });
      const json = (await res.json().catch(() => ({}))) as OverviewPayload & { error?: string };
      if (!res.ok || !json.ok) {
        setPayload(null);
        setLoadErr({ code: adminSafeErrorCode(json.error, "load_failed"), httpStatus: res.status });
        setLoadState("error");
        return;
      }
      setPayload(json);
      setLoadErr(null);
      setLoadState("ready");
    } catch {
      setPayload(null);
      setLoadErr({ code: "network_error" });
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
        titleKey="admin_menu_cp_dashboard"
        descriptionKey="admin_cp_dashboard_intro"
      />

      <p className="sam-text-body-secondary text-sam-muted">
        {safeT("admin_cp_dashboard_intro")}
      </p>

      {loadState === "error" ? (
        <AdminErrorState
          ko={language !== "en"}
          code={loadErr?.code ?? "load_failed"}
          httpStatus={loadErr?.httpStatus}
          onRetry={() => void load()}
        />
      ) : null}

      <section id="action-queue" className="space-y-3 scroll-mt-20">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h2 className="sam-text-section-title font-semibold text-sam-fg">
            {safeT("admin_menu_cp_action_queue")}
          </h2>
          <p className="sam-text-helper text-sam-muted tabular-nums" data-testid="admin-cp-action-queue-total">
            {queueLoading
              ? "…"
              : `${safeT("admin_cp_action_queue_total")} ${queueTotalComplete ? adminBellCount : `${adminBellCount}+`}`}
          </p>
        </div>
        <p className="sam-text-helper text-sam-muted">
          {safeT("admin_cp_action_queue_meaning")}
        </p>
        {!queueTotalComplete ? (
          <p className="sam-text-helper text-sam-warning" role="status">
            {safeT("admin_cp_action_queue_incomplete")}
          </p>
        ) : null}
        {queueLoadState === "error" ? (
          <p className="sam-text-helper text-sam-warning" role="status">
            {safeT("admin_cp_action_queue_stale")}
          </p>
        ) : null}
        <AdminActionQueueCardGrid categories={queueCategories} loading={queueLoading} />
      </section>

      <section id="monitoring" className="space-y-3 scroll-mt-20">
        <h2 className="sam-text-section-title font-semibold text-sam-fg">
          {safeT("admin_menu_cp_monitoring")}
        </h2>
        {loadState === "loading" ? <AdminLoadingState ko={language !== "en"} /> : null}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Link
            href="/admin/app/notices"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 hover:border-signature/40"
          >
            <p className="sam-text-body font-semibold text-sam-fg">
              {safeT("admin_menu_notices")}
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-sam-fg">
              {monValue(mon?.app_notices_active)}
            </p>
            <p className="sam-text-helper text-sam-muted">
              {safeT("admin_cp_mon_notices_hint")}
            </p>
          </Link>
          <Link
            href="/admin/member-notes?kind=inbox"
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 hover:border-signature/40"
          >
            <p className="sam-text-body font-semibold text-sam-fg">
              {safeT("admin_menu_cp_member_inbox")}
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
              {safeT("admin_menu_dibay_notification_campaigns")}
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
