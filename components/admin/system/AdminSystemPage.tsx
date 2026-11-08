"use client";

import { useAdminSyncLoad } from "@/components/admin/useAdminSyncLoad";
import { AdminSyncLoadGate } from "@/components/admin/AdminSyncLoadGate";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminActionLink } from "@/components/admin/ui/AdminActionButton";
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
  const { state: loadState, reload } = useAdminSyncLoad(loadSystemOpsFromServer);
  const hydrated = loadState.status === "ready";

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
        <AdminPageHeader titleKey="admin_menu_dev_system_status" />
        <AdminSyncLoadGate state={loadState} onRetry={reload} />
      </>
    );
  }

  return (
    <div className="space-y-4" data-admin-system-control="1">
      <AdminPageHeader titleKey="admin_menu_dev_system_status" />
      <p className="sam-text-body-secondary text-sam-muted">
        {t("admin_system_system_control_separates_permissions_settings_data")}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-admin-system-sections="1">
        {CONTROL_LINKS.map((c) => (
          <Link
            key={c.id}
            href={c.href}
            className="rounded-ui-rect border border-sam-border bg-sam-surface px-4 py-3 hover:border-signature/40"
            data-admin-system-link={c.id}
          >
            <p className="text-[14px] font-semibold text-sam-fg">{ko ? c.titleKo : c.titleEn}</p>
            <p className="mt-1 sam-text-helper text-sam-muted">{ko ? c.descKo : c.descEn}</p>
          </Link>
        ))}
      </div>

      <div
        className="rounded-ui-rect border-2 border-sam-danger bg-sam-danger-soft px-4 py-4"
        data-admin-system-danger="1"
      >
        <p className="text-[14px] font-bold text-sam-danger">Danger Zone · Data Reset</p>
        <p className="mt-1 sam-text-body-secondary text-sam-danger">
          {t("admin_system_destructive_reset_separate_from_normal_delete")}
        </p>
        <AdminActionLink href="/admin/system/data-reset" variant="secondary" className="mt-3">
          {t("admin_system_open_data_reset")}
        </AdminActionLink>
      </div>

      <AdminTabs
        tabs={tabs.map((tab) => ({ id: tab.id, label: t(tab.labelKey) }))}
        ariaLabel="화면 탭"
        value={activeTab}
        onChange={(id) => setActiveTab(id as typeof activeTab)}
        syncUrl={false}
        className="mb-4"
      />
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
