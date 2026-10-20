"use client";

import { useCallback, useMemo, useState } from "react";
import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import type { AppSettings } from "@/lib/types/admin-settings";
import {
  getAppSettings,
  loadAppSettingsFromServer,
  persistAppSettingsToServer,
  resetAppSettingsSectionOnServer,
} from "@/lib/admin-settings/app-settings-client";
import {
  DEFAULT_APP_SETTINGS,
  SECTION_KEYS,
  type SettingsSectionKey,
} from "@/lib/admin-settings/admin-settings-utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminSettingsTabs } from "./AdminSettingsTabs";
import { GeneralSettingsForm } from "./GeneralSettingsForm";
import { OpsTradePolicyPanel } from "./OpsTradePolicyPanel";
import { ProductPolicyForm } from "./ProductPolicyForm";
import { ChatPolicyForm } from "./ChatPolicyForm";
import { ReportPolicyForm } from "./ReportPolicyForm";
import { TrustPolicyForm } from "./TrustPolicyForm";
import { RegionPolicyForm } from "./RegionPolicyForm";
import { SettingChangeLogList } from "./SettingChangeLogList";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";

function getDisplaySettings(
  settings: AppSettings,
  draft: Partial<AppSettings>
): AppSettings {
  return { ...settings, ...draft };
}

export function AdminSettingsPage() {
  const { t, language } = useI18n();
  const ko = language === "ko";
  // localStorage는 클라 전용이라 SSR·첫 클램프와 값이 달라지면 하이드레이션 오류가 난다.
  // 기본값으로 첫 페인트를 맞춘 뒤 마운트 후에만 저장본을 불러온다.
  const [settings, setSettings] = useState<AppSettings>(() => ({ ...DEFAULT_APP_SETTINGS }));
  const [draft, setDraft] = useState<Partial<AppSettings>>({});
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("general");
  const [logRefreshKey, setLogRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ ok: true; message: string } | { ok: false; code: string } | null>(null);

  /** 서버 설정 조회 — 실패를 기본값 표시로 숨기지 않고 오류 상태 + [새로고침] (R6). */
  const loadSettings = useCallback(async () => {
    const r = await loadAppSettingsFromServer();
    if (r.ok) setSettings(getAppSettings());
    return r;
  }, []);
  const { state: loadState, reload } = useAdminSyncLoad(loadSettings);

  const display = useMemo(
    () => getDisplaySettings(settings, draft),
    [settings, draft]
  );

  const sectionKeys = SECTION_KEYS[activeSection];
  const isDirty = useMemo(
    () => sectionKeys.some((k) => draft[k] !== undefined),
    [sectionKeys, draft]
  );

  const handleChange = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async () => {
    const toSave: Partial<AppSettings> = {};
    sectionKeys.forEach((k) => {
      if (draft[k] === undefined) return;
      // sectionKeys가 keyof AppSettings 유니온이라 인덱스 대입 시 TS 한계
      (toSave as Record<string, string | number | boolean | undefined>)[k] = draft[k];
    });
    if (Object.keys(toSave).length === 0) return;
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko,
      title: ko ? "설정 저장" : "Save settings",
      description: ko ? "변경한 설정을 서비스에 반영합니다." : "Applies the changed settings to the service.",
      confirmLabel: adminCta("save", ko),
    });
    if (!confirmed.ok) return;
    setSaving(true);
    setResult(null);
    const r = await persistAppSettingsToServer(toSave);
    setSaving(false);
    setResult(r.ok ? { ok: true, message: ko ? "저장했습니다." : "Saved." } : { ok: false, code: r.error ?? "save_failed" });
    if (r.ok) {
      setSettings(getAppSettings());
      setDraft((prev) => {
        const next = { ...prev };
        sectionKeys.forEach((k) => delete next[k]);
        return next;
      });
      setLogRefreshKey((k) => k + 1);
    }
  }, [sectionKeys, draft, ko]);

  const handleReset = useCallback(async () => {
    // 기본값 초기화 = dataReset(L3: 사유 + 「초기화」 재입력). 사유는 저장 API 본문으로 보내 감사에 남긴다.
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("dataReset"),
      ko,
      title: ko ? "이 탭 설정 초기화" : "Reset this tab's settings",
      description: ko ? "이 탭의 설정을 기본값으로 되돌립니다." : "Restores this tab's settings to defaults.",
      confirmLabel: adminCta("reset", ko),
      destructive: true,
      retypeValue: ko ? "초기화" : "reset",
    });
    if (!confirmed.ok) return;
    setSaving(true);
    setResult(null);
    const r = await resetAppSettingsSectionOnServer(sectionKeys, confirmed.reason);
    setSaving(false);
    setResult(r.ok ? { ok: true, message: ko ? "초기화했습니다." : "Reset done." } : { ok: false, code: r.error ?? "save_failed" });
    if (r.ok) {
      setSettings(getAppSettings());
      setDraft((prev) => {
        const next = { ...prev };
        sectionKeys.forEach((k) => delete next[k]);
        return next;
      });
      setLogRefreshKey((k) => k + 1);
    }
  }, [sectionKeys, ko]);

  if (loadState.status !== "ready") {
    return (
      <div className="space-y-4">
        <AdminPageHeader titleKey="admin_menu_settings_general" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_menu_settings_general" />

      <AdminSettingsTabs active={activeSection} onChange={setActiveSection} />

      <AdminCard title={undefined}>
        {activeSection === "general" && (
          <>
            <GeneralSettingsForm values={display} onChange={handleChange} />
            <OpsTradePolicyPanel saveVariant="secondary" />
          </>
        )}
        {activeSection === "product" && (
          <ProductPolicyForm values={display} onChange={handleChange} />
        )}
        {activeSection === "chat" && (
          <ChatPolicyForm values={display} onChange={handleChange} />
        )}
        {activeSection === "report" && (
          <ReportPolicyForm values={display} onChange={handleChange} />
        )}
        {activeSection === "trust" && (
          <TrustPolicyForm values={display} onChange={handleChange} />
        )}
        {activeSection === "region" && (
          <RegionPolicyForm values={display} onChange={handleChange} />
        )}
        {activeSection === "categories" && (
          <div className="rounded-ui-rect border border-sam-border bg-sam-app p-4">
            <p className="sam-text-body text-sam-fg">{t("admin_settings_categories_desc")}</p>
            <AdminActionLink href="/admin/categories" variant="primary" className="mt-3">
              {t("admin_settings_categories_link")}
            </AdminActionLink>
          </div>
        )}

        {activeSection !== "categories" && (
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-sam-border-soft pt-4">
          {isDirty && (
            <span className="sam-text-body-secondary text-sam-warning">{t("admin_settings_unsaved")}</span>
          )}
          <AdminActionButton variant="secondary" onClick={() => void handleReset()} disabled={saving}>
            {adminCta("reset", ko)}
          </AdminActionButton>
          <AdminActionButton variant="primary" onClick={() => void handleSave()} disabled={!isDirty || saving}>
            {adminCta("save", ko)}
          </AdminActionButton>
        </div>
        )}
        {result ? (
          <div className="mt-3">
            <AdminResultBanner ko={ko} result={result} onClose={() => setResult(null)} />
          </div>
        ) : null}
      </AdminCard>

      <AdminCard titleKey="admin_settings_changelog_title">
        <SettingChangeLogList refreshKey={logRefreshKey} />
      </AdminCard>
    </div>
  );
}
