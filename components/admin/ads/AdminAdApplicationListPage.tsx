"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { getAdApplicationsForAdmin } from "@/lib/ads/mock-ad-applications";
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
  const applications = useMemo(() => getAdApplicationsForAdmin(), []);
  const filtered = useMemo(
    () => filterAdApplications(applications, filters),
    [applications, filters]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_ads_application_list_title" />
      <AdminAdApplicationFilterBar filters={filters} onChange={setFilters} />
      {filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_ads_application_list_empty")}
        </div>
      ) : (
        <AdminAdApplicationTable applications={filtered} />
      )}
    </div>
  );
}
