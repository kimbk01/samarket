"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { DrScenarioTable } from "./DrScenarioTable";
import { loadDrOpsFromServer } from "@/lib/dr/dr-sync-client";

export function AdminDrPage() {
  const { t } = useI18n();
  const [hydrated, setHydrated] = useState(false);
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  useEffect(() => {
    void loadDrOpsFromServer().then((r) => {
      if (!r.ok) setHydrateError(r.error ?? "load_failed");
      setHydrated(true);
    });
  }, []);

  if (!hydrated) {
    return (
      <>
        <AdminPageHeader titleKey="admin_dr_kfa6d586a" />
        <AdminCard>
          <p className="py-8 text-center sam-text-body text-sam-muted">
            {t("admin_loading_ops_settings")}
          </p>
        </AdminCard>
      </>
    );
  }

  return (
    <>
      <AdminPageHeader titleKey="admin_dr_kfa6d586a" />
      {hydrateError ? (
        <div
          className="mb-4 rounded-ui-rect border border-amber-500/40 bg-amber-500/10 px-4 py-3 sam-text-body-secondary text-sam-fg"
          role="alert"
        >
          서버에서 DR 설정을 불러오지 못했습니다. 기본값으로 표시 중입니다. ({hydrateError})
        </div>
      ) : null}
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
