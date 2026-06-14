"use client";

import { useCallback, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getCurrentUser, getCurrentUserIdForDb } from "@/lib/auth/get-current-user";

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

export function AdminPushDevicesPage() {
  const { t } = useI18n();
  const [userId, setUserId] = useState("");
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [testBusy, setTestBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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
    setUserId(userIdFromSession);
    setSessionHint(t("admin_push_devices_session_filled"));
  }, [t]);

  const load = useCallback(async () => {
    const uid = userId.trim();
    if (!uid) {
      setErr(t("admin_push_devices_user_required"));
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/push/devices?userId=${encodeURIComponent(uid)}`, {
        credentials: "include",
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setErr(t("admin_push_devices_load_failed"));
        return;
      }
      setDevices(j.devices ?? []);
      setDeliveries(j.deliveries ?? []);
    } catch {
      setErr(t("admin_push_devices_load_failed"));
    } finally {
      setLoading(false);
    }
  }, [t, userId]);

  const sendTest = useCallback(async () => {
    const uid = userId.trim();
    if (!uid) return;
    setTestBusy(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/push/test", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: uid }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setTestResult(t("admin_push_test_failed"));
        return;
      }
      setTestResult(t("admin_push_test_sent"));
      setDeliveries((prev) => [...(j.deliveries ?? []), ...prev].slice(0, 50));
    } catch {
      setTestResult(t("admin_push_test_failed"));
    } finally {
      setTestBusy(false);
    }
  }, [t, userId]);

  return (
    <div className="space-y-4">
      <AdminPageHeader title={t("admin_push_devices_title")} description={t("admin_push_devices_desc")} />
      <AdminCard>
        <p className="px-4 pt-4 text-[12px] text-sam-muted">{t("admin_push_devices_query_hint")}</p>
        <div className="flex flex-wrap items-end gap-2 p-4">
          <label className="flex min-w-[280px] flex-1 flex-col gap-1">
            <span className="text-[12px] font-medium text-sam-muted">{t("admin_push_devices_user_id")}</span>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="UUID"
              className="rounded-ui-rect border border-sam-border px-3 py-2 text-[13px]"
            />
          </label>
          <button
            type="button"
            onClick={() => void fillCurrentSessionUserId()}
            className="rounded-ui-rect border border-sam-border px-4 py-2 text-[13px] font-medium"
          >
            {t("admin_push_devices_use_session_user")}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="rounded-ui-rect bg-signature px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
          >
            {loading ? t("admin_push_devices_loading") : t("admin_push_devices_load")}
          </button>
          <button
            type="button"
            disabled={testBusy || !userId.trim()}
            onClick={() => void sendTest()}
            className="rounded-ui-rect border border-sam-border px-4 py-2 text-[13px] font-medium disabled:opacity-50"
          >
            {testBusy ? t("admin_push_test_busy") : t("admin_push_test_send")}
          </button>
        </div>
        {err ? <p className="px-4 pb-2 text-[13px] text-red-600">{err}</p> : null}
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
                  <td colSpan={5} className="py-4 text-sam-muted">
                    {t("admin_push_devices_empty")}
                  </td>
                </tr>
              ) : (
                devices.map((d) => (
                  <tr key={d.id} className="border-b border-sam-border-soft">
                    <td className="py-2 pr-3">{d.platform}</td>
                    <td className="py-2 pr-3">{d.push_provider}</td>
                    <td className="py-2 pr-3">{d.is_active ? t("admin_push_active_yes") : t("admin_push_active_no")}</td>
                    <td className="py-2 pr-3">{d.last_seen_at ?? "—"}</td>
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
                  <td colSpan={4} className="py-4 text-sam-muted">
                    {t("admin_push_deliveries_empty")}
                  </td>
                </tr>
              ) : (
                deliveries.map((d) => (
                  <tr key={d.id} className="border-b border-sam-border-soft">
                    <td className="py-2 pr-3">{d.event_type ?? "—"}</td>
                    <td className="py-2 pr-3">{d.status}</td>
                    <td className="py-2 pr-3">{d.created_at}</td>
                    <td className="py-2 font-mono text-[11px]">
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
