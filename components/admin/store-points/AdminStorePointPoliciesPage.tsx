"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";

type PolicyRow = {
  id: string;
  policy_name: string;
  fee_mode: string;
  fixed_point: number;
  percent_rate: number;
  is_active: boolean;
  priority: number;
};

export function AdminStorePointPoliciesPage() {
  const { t } = useI18n();
  const [rows, setRows] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/store-point-policies", { credentials: "include" });
      const json = await res.json();
      setRows(json?.policies ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_page_store_point_policies" />
      <p className="text-sm text-sam-muted">{t("admin_store_point_policies_desc")}</p>

      {loading ? (
        <p className="text-sm text-sam-muted">{t("common_loading")}</p>
      ) : (
        <div className="overflow-x-auto rounded-ui-rect border border-sam-border">
          <table className="min-w-full text-sm">
            <thead className="bg-sam-app text-left">
              <tr>
                <th className="px-3 py-2">{t("admin_store_point_policy_name")}</th>
                <th className="px-3 py-2">{t("admin_store_point_policy_mode")}</th>
                <th className="px-3 py-2">{t("admin_store_point_policy_fixed")}</th>
                <th className="px-3 py-2">{t("admin_store_point_policy_percent")}</th>
                <th className="px-3 py-2">{t("admin_store_point_policy_priority")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-sam-border-soft">
                  <td className="px-3 py-2">{r.policy_name}</td>
                  <td className="px-3 py-2">{r.fee_mode}</td>
                  <td className="px-3 py-2">{r.fixed_point}</td>
                  <td className="px-3 py-2">{r.percent_rate}%</td>
                  <td className="px-3 py-2">{r.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
