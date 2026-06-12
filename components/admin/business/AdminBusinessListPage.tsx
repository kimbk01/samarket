"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  filterBusinessProfiles,
  type AdminBusinessFilters,
} from "@/lib/business/business-utils";
import { mapAdminStoreRowToBusinessProfile } from "@/lib/admin-business/map-admin-store-to-business";
import type { StoreRow } from "@/lib/stores/db-store-mapper";
import type { BusinessProfile } from "@/lib/types/business";
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
  const [profiles, setProfiles] = useState<BusinessProfile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stores", { cache: "no-store", credentials: "include" });
      const j = (await res.json()) as {
        ok?: boolean;
        stores?: Array<StoreRow & { applicant_nickname?: string | null }>;
      };
      const rows = j.ok && Array.isArray(j.stores) ? j.stores : [];
      setProfiles(
        rows.map((row) =>
          mapAdminStoreRowToBusinessProfile(
            row as StoreRow & Record<string, unknown>,
            String(row.applicant_nickname ?? "")
          )
        )
      );
    } catch {
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => filterBusinessProfiles(profiles, filters), [profiles, filters]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_biz_page_list" />
      <AdminBusinessFilterBar filters={filters} onChange={setFilters} />
      {loading ? (
        <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_biz_empty_list")}
        </div>
      ) : (
        <AdminBusinessTable profiles={filtered} />
      )}
    </div>
  );
}
