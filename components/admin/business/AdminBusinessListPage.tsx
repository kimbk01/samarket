"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminBusinessFilterBar, type AdminBusinessListFilters } from "./AdminBusinessFilterBar";
import { AdminBusinessTable, type AdminBusinessListRow } from "./AdminBusinessTable";

const DEFAULT_FILTERS: AdminBusinessListFilters = {
  status: "all",
  q: "",
};

export function AdminBusinessListPage() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<AdminBusinessListFilters>(DEFAULT_FILTERS);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [rows, setRows] = useState<AdminBusinessListRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(filters.q.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [filters.q]);

  const qs = useMemo(() => {
    const parts: string[] = [];
    if (filters.status && filters.status !== "all") {
      parts.push(`status=${encodeURIComponent(filters.status)}`);
    }
    if (debouncedQ) parts.push(`q=${encodeURIComponent(debouncedQ)}`);
    return parts.length ? `?${parts.join("&")}` : "";
  }, [filters.status, debouncedQ]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stores${qs}`, {
        cache: "no-store",
        credentials: "include",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        stores?: AdminBusinessListRow[];
      };
      setRows(j.ok && Array.isArray(j.stores) ? j.stores : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_biz_page_list" />
      <AdminBusinessFilterBar
        filters={filters}
        onChange={setFilters}
        resultCount={rows.length}
        loading={loading}
      />
      {loading ? (
        <p className="sam-text-body text-sam-muted">{t("common_loading")}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_biz_empty_list")}
        </div>
      ) : (
        <AdminBusinessTable rows={rows} />
      )}
    </div>
  );
}
