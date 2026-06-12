"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { AdApplication } from "@/lib/types/ad-application";
import {
  filterAdApplications,
  type AdminAdApplicationFilters,
} from "@/lib/ads/ad-utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminAdApplicationFilterBar } from "./AdminAdApplicationFilterBar";
import { AdminAdApplicationTable } from "./AdminAdApplicationTable";

const DEFAULT_FILTERS: AdminAdApplicationFilters = {
  applicationStatus: "",
};

export function AdminAdApplicationListPage() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<AdminAdApplicationFilters>(DEFAULT_FILTERS);
  const [applications, setApplications] = useState<AdApplication[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/ad-applications", { cache: "no-store" });
      const j = (await res.json()) as { applications?: AdApplication[] };
      setApplications(j.applications ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => filterAdApplications(applications, filters),
    [applications, filters]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_ads_application_list_title" />
      <AdminAdApplicationFilterBar filters={filters} onChange={setFilters} />
      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("common_loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_ads_application_list_empty")}
        </div>
      ) : (
        <AdminAdApplicationTable applications={filtered} />
      )}
    </div>
  );
}
