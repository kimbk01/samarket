"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import type { AppMetaKey } from "@/lib/admin-app-meta/app-meta-keys";
import { normalizeAppMetaValue } from "@/lib/admin-app-meta/app-meta-keys";
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
        <div className="rounded-ui-rect bg-sam-surface p-4" role="alert">
          <p className="sam-text-body text-sam-muted">{t("admin_app_meta_load_failed")}</p>
          <AdminActionButton variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
            {adminCta("refresh", language !== "en")}
          </AdminActionButton>
        </div>
      ) : items == null ? (
        <p className="text-sam-muted">{t("admin_dashboard_loading")}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => {
            const draft = drafts[it.key] ?? it.value;
            const dirty = draft.trim() !== it.value;
            return (
              <li key={it.key} className="rounded-ui-rect bg-sam-surface p-4" data-app-meta-key={it.key}>
                <label className="block">
                  <span className="font-medium text-sam-fg">{it.key}</span>
                  <span className="mt-0.5 block sam-text-helper text-sam-muted">{t(KEY_HELP[it.key])}</span>
                  <input
                    className="sam-input mt-2 w-full"
                    value={draft}
                    placeholder={t("admin_app_meta_empty_placeholder")}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [it.key]: e.target.value }))}
                  />
                </label>
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
                    onClick={() => void save(it.key, draft)}
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
