"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { useAdminListQuery } from "@/lib/admin/list-query/use-admin-list-query";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminStatusLabel } from "@/components/admin/ui/AdminStatusLabel";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { NOTIFICATIONS_PUSH_DELIVERY_STATUS_NS } from "@/lib/admin/status-labels/notifications-status-labels";

type DeviceRow = {
  id: string;
  platform: string;
  device_id: string;
  push_provider: string;
  is_active: boolean;
  last_seen_at: string | null;
  app_version: string | null;
};

type DeliveryRow = {
  id: string;
  event_type: string | null;
  status: string;
  provider_response: Record<string, unknown> | null;
  created_at: string;
};

/** `useSearchParams` 사용 — Suspense 경계 안에서 그린다. */
export function AdminPushDevicesPage() {
  return (
    <Suspense fallback={null}>
      <AdminPushDevicesPageInner />
    </Suspense>
  );
}

/**
 * 회원 푸시 기기·발송 기록 조회 (R7) — 조회 조건(회원 UUID)은 주소 `?q=` 에 남는다 (새로고침·링크 공유 유지).
 * 목록은 회원 1명의 등록 기기(소수)와 최근 발송 50건(진단용) — 서버 페이지 대상 아님.
 */
function AdminPushDevicesPageInner() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const lq = useAdminListQuery();
  const userId = lq.query.q;
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [testBusy, setTestBusy] = useState(false);
  const [err, setErr] = useState<{ code: string; httpStatus?: number } | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [sessionHint, setSessionHint] = useState<string | null>(null);

  const fillCurrentSessionUserId = useCallback(async () => {
    setSessionHint(null);
    const cached = getCurrentUser()?.id?.trim() ?? "";
    const userIdFromSession = cached || (await getCurrentUserIdForDb())?.trim() || "";
    if (!userIdFromSession) {
      setSessionHint(t("admin_push_devices_session_missing"));
      return;
    }
    lq.patch({ q: userIdFromSession });
    setSessionHint(t("admin_push_devices_session_filled"));
  }, [t, lq]);

  const refreshKey = lq.refreshKey;
  useEffect(() => {
    const uid = userId.trim();
    if (!uid) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/push/devices?userId=${encodeURIComponent(uid)}`, {
          credentials: "include",
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          devices?: DeviceRow[];
          deliveries?: DeliveryRow[];
        };
        if (cancelled) return;
        if (!res.ok || !j?.ok) {
          // 직전 정상 목록은 지우지 않는다 (§8-5).
          setErr({ code: j.error || "load_failed", httpStatus: res.status });
          return;
        }
        setErr(null);
        setDevices(j.devices ?? []);
        setDeliveries(j.deliveries ?? []);
        setLoadedFor(uid);
      } catch {
        if (!cancelled) setErr({ code: "network_error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  const sendTest = useCallback(async () => {
    const uid = userId.trim();
    if (!uid) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: t("admin_push_test_send"),
      description: ko
        ? "이 회원의 등록 기기로 테스트 푸시를 보냅니다."
        : "Sends a test push to this member's registered devices.",
      confirmLabel: t("admin_push_test_send"),
    });
    if (!confirmed.ok) return;
    setTestBusy(true);
    setTestResult(null);
    setErr(null);
    try {
      const res = await fetch("/api/admin/push/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        if (j?.error === "no_deliveries_recorded") {
          setTestResult(t("admin_push_test_no_deliveries"));
        } else {
          setTestResult(t("admin_push_test_failed"));
        }
        if (Array.isArray(j?.deliveries)) {
          setDeliveries(j.deliveries);
        }
        return;
      }
      setTestResult(t("admin_push_test_sent"));
      setDeliveries(Array.isArray(j.deliveries) ? j.deliveries : []);
    } catch {
      setTestResult(t("admin_push_test_failed"));
    } finally {
      setTestBusy(false);
    }
  }, [ko, t, userId]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_push_devices" description={t("admin_push_devices_desc")} />
      <AdminCard>
        <p className="px-4 pt-4 text-[12px] text-sam-muted">{t("admin_push_devices_query_hint")}</p>
        <div className="p-4">
          <AdminFilterBar
            ko={ko}
            draft={lq.draft}
            onDraftChange={lq.setDraft}
            onSubmit={lq.submit}
            onReset={() => {
              lq.reset();
              setDevices([]);
              setDeliveries([]);
              setLoadedFor(null);
              setErr(null);
            }}
            pending={loading}
            showPeriod={false}
            searchPlaceholder={`${t("admin_push_devices_user_id")} (UUID)`}
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <AdminActionButton variant="secondary" onClick={() => void fillCurrentSessionUserId()}>
              {t("admin_push_devices_use_session_user")}
            </AdminActionButton>
            <AdminActionButton variant="secondary" disabled={testBusy || !userId.trim()} onClick={() => void sendTest()}>
              {t("admin_push_test_send")}
            </AdminActionButton>
          </div>
        </div>
        {err ? (
          <div className="px-4 pb-3">
            <AdminErrorState ko={ko} code={err.code} httpStatus={err.httpStatus} onRetry={lq.refresh} />
          </div>
        ) : null}
        {sessionHint ? <p className="px-4 pb-2 text-[13px] text-sam-muted">{sessionHint}</p> : null}
        {testResult ? <p className="px-4 pb-2 text-[13px] text-sam-fg">{testResult}</p> : null}
      </AdminCard>

      <AdminCard title={t("admin_push_devices_list_title")}>
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[640px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-sam-border text-sam-muted">
                <th className="py-2 pr-3">{t("admin_push_col_platform")}</th>
                <th className="py-2 pr-3">{t("admin_push_col_provider")}</th>
                <th className="py-2 pr-3">{t("admin_push_col_active")}</th>
                <th className="py-2 pr-3">{t("admin_push_col_last_seen")}</th>
                <th className="py-2">{t("admin_push_col_version")}</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4">
                    {loading && loadedFor !== userId.trim() ? (
                      <AdminLoadingState ko={ko} />
                    ) : (
                      <AdminEmptyState
                        ko={ko}
                        message={userId.trim() ? t("admin_push_devices_empty") : t("admin_push_devices_user_required")}
                      />
                    )}
                  </td>
                </tr>
              ) : (
                devices.map((d) => (
                  <tr key={d.id} className="border-b border-sam-border-soft">
                    <td className="py-2 pr-3">{d.platform}</td>
                    <td className="py-2 pr-3">{d.push_provider}</td>
                    <td className="py-2 pr-3">{d.is_active ? t("admin_push_active_yes") : t("admin_push_active_no")}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatAdminManilaDateTime(d.last_seen_at)}</td>
                    <td className="py-2">{d.app_version ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>

      <AdminCard title={t("admin_push_deliveries_title")}>
        <div className="overflow-x-auto p-4">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-sam-border text-sam-muted">
                <th className="py-2 pr-3">{t("admin_push_col_event")}</th>
                <th className="py-2 pr-3">{t("admin_push_col_status")}</th>
                <th className="py-2 pr-3">{t("admin_push_col_created")}</th>
                <th className="py-2">{t("admin_push_col_response")}</th>
              </tr>
            </thead>
            <tbody>
              {deliveries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4">
                    {loading && loadedFor !== userId.trim() ? (
                      <AdminLoadingState ko={ko} />
                    ) : (
                      <AdminEmptyState ko={ko} message={t("admin_push_deliveries_empty")} />
                    )}
                  </td>
                </tr>
              ) : (
                deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-sam-border-soft">
                    <td className="py-2 pr-3">{d.event_type ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <AdminStatusLabel namespace={NOTIFICATIONS_PUSH_DELIVERY_STATUS_NS} code={d.status} ko={ko} />
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{formatAdminManilaDateTime(d.created_at)}</td>
                    <td className="py-2 font-mono text-[12px]">
                      {JSON.stringify(d.provider_response ?? {}).slice(0, 120)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </div>
  );
}
