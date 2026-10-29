"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminSwitch } from "@/components/admin/ui/AdminSwitch";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { AppMetaKey } from "@/lib/admin-app-meta/app-meta-keys";
import { isAppMetaToggleKey, normalizeAppMetaValue } from "@/lib/admin-app-meta/app-meta-keys";
import type { MessageKey } from "@/lib/i18n/message-key";

type Item = { key: AppMetaKey; value: string; updatedAt: string | null };

const KEY_HELP: Record<AppMetaKey, MessageKey> = {
  app_version: "admin_app_meta_help_app_version",
  app_build: "admin_app_meta_help_app_build",
  android_min_version_code: "admin_app_meta_help_android_min_version_code",
  android_immediate_update: "admin_app_meta_help_android_immediate_update",
};

/** 앱 메타 관리 (v2.1 B2) — 버전 화면·Android 인앱 업데이트 정책 값. 빈 값 저장 = 기본 동작 */
export function AdminAppMetaPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [items, setItems] = useState<Item[] | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<AppMetaKey, string>>>({});
  const [loadError, setLoadError] = useState(false);
  const [busyKey, setBusyKey] = useState<AppMetaKey | null>(null);
  const [message, setMessage] = useState<{ key: AppMetaKey; ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await fetch("/api/admin/app-meta", { credentials: "include", cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; items?: Item[] };
      if (!res.ok || !json.ok || !Array.isArray(json.items)) throw new Error("load_failed");
      setItems(json.items);
      setDrafts({});
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (key: AppMetaKey, raw: string) => {
    const value = normalizeAppMetaValue(key, raw);
    if (value === null) {
      setMessage({ key, ok: false, text: t("admin_app_meta_invalid") });
      return;
    }
    // 설정 저장 = L1 확인 (§2.8 CTA 등급) — 앱 버전 화면·인앱 업데이트 정책에 바로 반영된다.
    const toggle = isAppMetaToggleKey(key);
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? `${key} 저장` : `Save ${key}`,
      description: toggle
        ? t(value === "true" ? "admin_app_meta_immediate_confirm_on" : "admin_app_meta_immediate_confirm_off")
        : ko
          ? `값: ${value === "" ? "(빈 값 — 기본 동작)" : value}`
          : `Value: ${value === "" ? "(empty — default behavior)" : value}`,
      confirmLabel: t("common_save"),
    });
    if (!confirmed.ok) return;
    setBusyKey(key);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/app-meta", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (!res.ok || !json.ok) throw new Error("save_failed");
      setItems((prev) => prev?.map((it) => (it.key === key ? { ...it, value, updatedAt: new Date().toISOString() } : it)) ?? prev);
      setDrafts((prev) => ({ ...prev, [key]: undefined }));
      setMessage({ key, ok: true, text: t("admin_app_meta_saved") });
    } catch {
      setMessage({ key, ok: false, text: t("admin_app_meta_save_failed") });
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <AdminPageHeader titleKey="admin_menu_app_meta" />
      <p className="mb-4 sam-text-body-secondary text-sam-muted">{t("admin_app_meta_intro")}</p>
      {loadError ? (
        <AdminErrorState ko={ko} code="load_failed" onRetry={() => void load()} />
      ) : items == null ? (
        <AdminLoadingState ko={ko} />
      ) : items.length === 0 ? (
        <AdminEmptyState ko={ko} />
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const draft = drafts[it.key] ?? it.value;
            const toggle = isAppMetaToggleKey(it.key);
            // 켜기/끄기 항목: 켜짐 = "true", 꺼짐 = 빈 값(행 삭제 → 기본 동작). 예전 "false" 행도 꺼짐.
            const draftOn = draft.trim().toLowerCase() === "true";
            const savedOn = it.value.trim().toLowerCase() === "true";
            const dirty = toggle ? draftOn !== savedOn : draft.trim() !== it.value;
            return (
              <li key={it.key} className="rounded-ui-rect bg-sam-surface p-4" data-app-meta-key={it.key}>
                {toggle ? (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="font-medium text-sam-fg">{t("admin_app_meta_immediate_label")}</span>
                      <span className="mt-0.5 block sam-text-helper text-sam-muted">{t(KEY_HELP[it.key])}</span>
                      <span
                        className={`mt-1 block sam-text-helper ${savedOn ? "text-sam-success" : "text-sam-meta"}`}
                        data-app-meta-saved-state={savedOn ? "on" : "off"}
                      >
                        {t(savedOn ? "admin_app_meta_state_on" : "admin_app_meta_state_off")}
                      </span>
                    </div>
                    <AdminSwitch
                      checked={draftOn}
                      disabled={busyKey === it.key}
                      label={t("admin_app_meta_immediate_label")}
                      onChange={(next) => setDrafts((prev) => ({ ...prev, [it.key]: next ? "true" : "" }))}
                    />
                  </div>
                ) : (
                  <label className="block">
                    <span className="font-medium text-sam-fg">{it.key}</span>
                    <span className="mt-0.5 block sam-text-helper text-sam-muted">{t(KEY_HELP[it.key])}</span>
                    <input
                      className="sam-input mt-2 w-full"
                      value={draft}
                      inputMode={it.key === "app_version" ? "decimal" : "numeric"}
                      placeholder={t("admin_app_meta_empty_placeholder")}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [it.key]: e.target.value }))}
                    />
                  </label>
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span
                    className={`sam-text-helper ${message?.key === it.key ? (message.ok ? "text-sam-success" : "text-sam-danger") : "text-sam-meta"}`}
                  >
                    {message?.key === it.key
                      ? message.text
                      : it.updatedAt
                        ? formatAdminManilaDateTime(it.updatedAt)
                        : t("admin_app_meta_default")}
                  </span>
                  <AdminActionButton
                    variant="primary"
                    size="sm"
                    disabled={!dirty || busyKey === it.key}
                    onClick={() => void save(it.key, toggle ? (draftOn ? "true" : "") : draft)}
                  >
                    {t("common_save")}
                  </AdminActionButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
