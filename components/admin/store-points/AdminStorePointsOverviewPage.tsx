"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type BlockedStore = {
  id: string;
  store_name: string;
  point_balance: number;
};

type Summary = {
  blocked_store_count?: number;
  pending_charge_count?: number;
  blocked_stores?: BlockedStore[];
};

export function AdminStorePointsOverviewPage() {
  const { t } = useI18n();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/store-points/summary", { credentials: "include" });
      const json = await res.json();
      setSummary(json?.summary ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_points" />

      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-center">
              <p className="text-2xl font-bold text-amber-700">
                {summary?.blocked_store_count ?? 0}
              </p>
              <p className="text-xs text-sam-muted">{t("admin_store_points_blocked_count")}</p>
            </div>
            <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-center">
              <p className="text-2xl font-bold text-[#006241]">
                {summary?.pending_charge_count ?? 0}
              </p>
              <p className="text-xs text-sam-muted">{t("admin_store_points_pending_charges")}</p>
            </div>
          </div>

          <section className="rounded-ui-rect border border-sam-border bg-sam-surface p-4">
            <h2 className="font-semibold text-sam-fg">{t("admin_store_points_blocked_list")}</h2>
            {(summary?.blocked_stores ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-sam-muted">{t("admin_store_points_blocked_empty")}</p>
            ) : (
              <ul className="mt-2 divide-y divide-sam-border-soft">
                {(summary?.blocked_stores ?? []).map((s) => (
                  <li key={s.id} className="flex justify-between py-2 text-sm">
                    <span>{s.store_name}</span>
                    <span className="font-semibold tabular-nums">{s.point_balance}P</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
