"use client";


import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { DrScenarioTable } from "./DrScenarioTable";

export function AdminDrPage() {
  const { t } = useI18n();
  return (
    <>
      <AdminPageHeader titleKey="admin_dr_kfa6d586a" />
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          className="rounded border border-signature bg-signature/10 px-3 py-2 sam-text-body font-medium text-signature hover:bg-signature/20"
        >
          리허설 실행 (mock)
        </button>
        <span className="sam-text-helper text-sam-muted">
          시나리오 선택 후 상세에서 단계별 실행
        </span>
      </div>
      <AdminCard titleKey="admin_dr_kef082268">
        <DrScenarioTable />
      </AdminCard>
    </>
  );
}
