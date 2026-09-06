"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { OperationStatusCards } from "./OperationStatusCards";
import { SystemHealthList } from "./SystemHealthList";
import type { MessageKey } from "@/lib/i18n/messages";
import { loadSystemOpsFromServer } from "@/lib/system/system-ops-sync-client";

type TabId = "overview" | "services";

const CONTROL_LINKS = [
  {
    id: "permissions",
    href: "/admin/settings/auth",
    titleKo: "관리자 / 권한",
    titleEn: "Admins / permissions",
    descKo: "역할·권한·최근 변경",
    descEn: "Roles, permissions, recent changes",
  },
  {
    id: "ops-settings",
    href: "/admin/settings",
    titleKo: "운영 설정",
    titleEn: "Operations settings",
    descKo: "플랫폼 운영 설정 (콘텐츠 대시보드 아님)",
    descEn: "Platform ops settings (not a content dashboard)",
  },
  {
    id: "data",
    href: "/admin/operations",
    titleKo: "데이터 관리",
    titleEn: "Data management",
    descKo: "운영 데이터·도구 진입",
    descEn: "Operational data tools",
  },
  {
    id: "audit",
    href: "/admin/security",
    titleKo: "감사 로그",
    titleEn: "Audit log",
    descKo: "보안·감사 기록",
    descEn: "Security and audit records",
  },
] as const;

export function AdminSystemPage() {
  const { t, language } = useI18n();
  const ko = language !== "en";
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void loadSystemOpsFromServer().then(() => setHydrated(true));
  }, []);

  const tabs = useMemo(
    (): { id: TabId; labelKey: MessageKey }[] => [
      { id: "overview", labelKey: "admin_system_tab_overview" },
      { id: "services", labelKey: "admin_system_tab_services" },
    ],
    []
  );

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_page_system_stability" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">{t("admin_rec_mon_loading_settings")}</p>
        </AdminCard>
      </>
    );
  }

  return (
    <div className="space-y-4" data-admin-system-control="1">
      <AdminPageHeader titleKey="admin_page_system_stability" />
      <p className="sam-text-body-secondary text-sam-muted">
        {ko
          ? "시스템 통제는 권한·설정·데이터·감사·Danger Zone으로 분리됩니다. 콘텐츠 대시보드가 아닙니다."
          : "System control separates permissions, settings, data, audit, and Danger Zone. Not a content dashboard."}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-admin-system-sections="1">
        {CONTROL_LINKS.map((c) => (
          <Link
            key={c.id}
            href={c.href}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 hover:border-signature/40"
            data-admin-system-link={c.id}
          >
            <p className="text-[15px] font-semibold text-sam-fg">{ko ? c.titleKo : c.titleEn}</p>
            <p className="mt-1 sam-text-helper text-sam-muted">{ko ? c.descKo : c.descEn}</p>
          </Link>
        ))}
      </div>

      <div
        className="rounded-ui-rect border-2 border-red-400 bg-red-50 px-4 py-4"
        data-admin-system-danger="1"
      >
        <p className="text-sm font-bold text-red-950">Danger Zone · Prelaunch Reset</p>
        <p className="mt-1 sam-text-body-secondary text-red-900">
          {ko
            ? "일반 삭제와 분리된 파괴적 리셋입니다. 운영 목록·콘텐츠 관리와 섞지 마세요."
            : "Destructive reset, separate from normal delete. Keep out of content ops lists."}
        </p>
        <Link
          href="/admin/prelaunch-reset"
          className="mt-3 inline-flex rounded-ui-rect bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800"
        >
          {ko ? "Prelaunch Reset 열기" : "Open Prelaunch Reset"}
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-sam-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 sam-text-body font-medium ${
              activeTab === tab.id
                ? "border-signature text-signature"
                : "border-transparent text-sam-muted hover:text-sam-fg"
            }`}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>
      {activeTab === "overview" && (
        <AdminCard titleKey="admin_system_card_overview">
          <OperationStatusCards />
        </AdminCard>
      )}
      {activeTab === "services" && (
        <AdminCard titleKey="admin_system_card_services">
          <SystemHealthList />
        </AdminCard>
      )}
    </div>
  );
}
