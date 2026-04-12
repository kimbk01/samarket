"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppSettings } from "@/lib/types/admin-settings";
import { getAppSettings, updateSettings, resetSettingsSection } from "@/lib/admin-settings/mock-app-settings";
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
import Link from "next/link";
import { SettingChangeLogList } from "./SettingChangeLogList";

function getDisplaySettings(
  settings: AppSettings,
  draft: Partial<AppSettings>
): AppSettings {
  return { ...settings, ...draft };
}

export function AdminSettingsPage() {
  // localStorage는 클라 전용이라 SSR·첫 클램프와 값이 달라지면 하이드레이션 오류가 난다.
  // 기본값으로 첫 페인트를 맞춘 뒤 마운트 후에만 저장본을 불러온다.
  const [settings, setSettings] = useState<AppSettings>(() => ({ ...DEFAULT_APP_SETTINGS }));
  const [draft, setDraft] = useState<Partial<AppSettings>>({});
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("general");
  const [logRefreshKey, setLogRefreshKey] = useState(0);

  useEffect(() => {
    setSettings(getAppSettings());
  }, []);

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

  const handleSave = useCallback(() => {
    const toSave: Partial<AppSettings> = {};
    sectionKeys.forEach((k) => {
      if (draft[k] === undefined) return;
      // sectionKeys가 keyof AppSettings 유니온이라 인덱스 대입 시 TS 한계
      (toSave as Record<string, string | number | boolean | undefined>)[k] = draft[k];
    });
    if (Object.keys(toSave).length > 0) {
      updateSettings(toSave);
      setSettings(getAppSettings());
      setDraft((prev) => {
        const next = { ...prev };
        sectionKeys.forEach((k) => delete next[k]);
        return next;
      });
      setLogRefreshKey((k) => k + 1);
    }
  }, [sectionKeys, draft]);

  const handleReset = useCallback(() => {
    resetSettingsSection(sectionKeys);
    setSettings(getAppSettings());
    setDraft((prev) => {
      const next = { ...prev };
      sectionKeys.forEach((k) => delete next[k]);
      return next;
    });
    setLogRefreshKey((k) => k + 1);
  }, [sectionKeys]);

  return (
    <div className="space-y-4">
      <AdminPageHeader title="운영설정" />

      <AdminCard title="알림·알림음 (도메인)">
        <p className="text-[14px] text-sam-fg">
          거래 채팅·커뮤니티·주문·매장 알림을 분리해 알림음·쿨다운·반복을 설정합니다.
        </p>
        <Link
          href="/admin/settings/notifications"
          className="mt-3 inline-block rounded-ui-rect bg-signature px-4 py-2 text-[14px] font-medium text-white"
        >
          도메인별 알림 설정 열기
        </Link>
      </AdminCard>

      <AdminSettingsTabs active={activeSection} onChange={setActiveSection} />

      <AdminCard title={undefined}>
        {activeSection === "general" && (
          <>
            <GeneralSettingsForm values={display} onChange={handleChange} />
            <OpsTradePolicyPanel />
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
            <p className="text-[14px] text-sam-fg">
              카테고리(거래/서비스/커뮤니티/기능) 및 기능 토글은 전용 페이지에서 관리합니다.
            </p>
            <Link
              href="/admin/categories"
              className="mt-3 inline-block rounded-ui-rect bg-signature px-4 py-2 text-[14px] font-medium text-white"
            >
              카테고리 관리로 이동
            </Link>
          </div>
        )}

        {activeSection !== "categories" && (
        <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-sam-border-soft pt-4">
          {isDirty && (
            <span className="text-[13px] text-amber-600">저장하지 않은 변경이 있습니다</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty}
            className="rounded border border-sam-border bg-sam-surface px-4 py-2 text-[14px] font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50 disabled:cursor-not-allowed"
          >
            저장
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="rounded border border-sam-border bg-sam-surface px-4 py-2 text-[14px] font-medium text-sam-fg hover:bg-sam-app"
          >
            초기화
          </button>
        </div>
        )}
      </AdminCard>

      <AdminCard title="설정 변경 이력">
        <SettingChangeLogList refreshKey={logRefreshKey} />
      </AdminCard>
    </div>
  );
}
