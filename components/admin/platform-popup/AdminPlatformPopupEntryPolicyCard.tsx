"use client";

/**
 * 진입 감사 PO-8·PO-2·PO-4 (2026-11-17) — 팝업 전체 설정(켜기/끄기 · 진입당 최대 개수 · 가로 화면).
 * 저장 = 읽은 판(revision) 기준. 다른 관리자가 먼저 저장했으면 409 → 덮어쓰지 않고 새 값을 다시 불러온다.
 */

import { useCallback, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  PLATFORM_POPUP_MAX_PER_ENTRY_LIMIT,
  type PlatformPopupEntryPolicy,
} from "@/lib/platform-popup/entry-policy";

const API = "/api/admin/platform-popup-campaigns/entry-policy";

export function AdminPlatformPopupEntryPolicyCard({ canWrite }: { canWrite: boolean }) {
  const { t } = useI18n();
  const [policy, setPolicy] = useState<PlatformPopupEntryPolicy | null>(null);
  const [revision, setRevision] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(API, { credentials: "same-origin" });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        policy?: PlatformPopupEntryPolicy;
        revision?: string | null;
      };
      if (!res.ok || !json.ok || !json.policy) throw new Error("load");
      setPolicy(json.policy);
      setRevision(json.revision ?? null);
    } catch {
      setNotice({ tone: "error", text: t("admin_platform_popup_entry_policy_load_failed") });
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!policy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(API, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy, expectedRevision: revision }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; revision?: string | null };
      if (res.status === 409) {
        setNotice({ tone: "error", text: t("admin_platform_popup_entry_policy_stale") });
        await load();
        return;
      }
      if (!res.ok || !json.ok) throw new Error("save");
      setRevision(json.revision ?? null);
      setNotice({ tone: "ok", text: t("admin_platform_popup_entry_policy_saved") });
    } catch {
      setNotice({ tone: "error", text: t("admin_platform_popup_entry_policy_failed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard>
      <div data-admin-popup-entry-policy="1" className="space-y-3">
        <h2 className="text-sm font-semibold">{t("admin_platform_popup_entry_policy_title")}</h2>
        {policy ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={policy.enabled}
                disabled={!canWrite || busy}
                onChange={(e) => setPolicy({ ...policy, enabled: e.target.checked })}
                data-admin-popup-entry-enabled="1"
              />
              {t("admin_platform_popup_entry_policy_enabled")}
            </label>
            <label className="block text-sm">
              {t("admin_platform_popup_entry_policy_max")}
              <select
                className="mt-1 w-full rounded-ui-rect border border-sam-border px-2 py-1.5"
                value={String(policy.maxPerEntry)}
                disabled={!canWrite || busy}
                onChange={(e) => setPolicy({ ...policy, maxPerEntry: Number(e.target.value) })}
                data-admin-popup-entry-max="1"
              >
                {Array.from({ length: PLATFORM_POPUP_MAX_PER_ENTRY_LIMIT }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={policy.allowLandscape}
                disabled={!canWrite || busy}
                onChange={(e) => setPolicy({ ...policy, allowLandscape: e.target.checked })}
                data-admin-popup-entry-landscape="1"
              />
              {t("admin_platform_popup_entry_policy_landscape")}
            </label>
          </div>
        ) : null}
        {notice ? (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={notice.tone === "error" ? "text-sm text-sam-danger" : "text-sm text-sam-fg"}
          >
            {notice.text}
          </p>
        ) : null}
        <div className="flex justify-end">
          <AdminActionButton
            variant="primary"
            disabled={!canWrite || busy || !policy}
            onClick={() => void save()}
            data-admin-popup-entry-save="1"
          >
            {t("admin_platform_popup_entry_policy_save")}
          </AdminActionButton>
        </div>
      </div>
    </AdminCard>
  );
}
