"use client";

import { useMemo, useState } from "react";
import { getBusinessProfilesForAdmin } from "@/lib/business/mock-business-profiles";
import {
  filterBusinessProfiles,
  type AdminBusinessFilters,
} from "@/lib/business/business-utils";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminBusinessFilterBar } from "./AdminBusinessFilterBar";
import { AdminBusinessTable } from "./AdminBusinessTable";

const DEFAULT_FILTERS: AdminBusinessFilters = {
  status: "",
};

export function AdminBusinessListPage() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<AdminBusinessFilters>(DEFAULT_FILTERS);
  const profiles = useMemo(() => getBusinessProfilesForAdmin(), []);
  const filtered = useMemo(
    () => filterBusinessProfiles(profiles, filters),
    [profiles, filters]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_biz_page_list" />
      <AdminBusinessFilterBar filters={filters} onChange={setFilters} />
      {filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_biz_empty_list")}
        </div>
      ) : (
        <AdminBusinessTable profiles={filtered} />
      )}
    </div>
  );
}
