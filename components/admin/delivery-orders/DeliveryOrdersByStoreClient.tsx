"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import {
  fetchAdminStoreOrdersForStore,
  parseAdminStoreOrdersResponse,
} from "@/lib/admin/fetch-admin-store-orders-scoped";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import { OrderTable } from "./OrderTable";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export function DeliveryOrdersByStoreClient({ storeId }: { storeId: string }) {
  const { t } = useI18n();
  const [rows, setRows] = useState<AdminDeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status, json } = await fetchAdminStoreOrdersForStore(storeId);
      const j = json as { ok?: boolean; error?: string };
      if (status < 200 || status >= 300 || j.ok === false) {
        setRows([]);
        setError(typeof j.error === "string" ? j.error : `HTTP ${status}`);
        return;
      }
      setRows(parseAdminStoreOrdersResponse(json));
    } catch {
      setRows([]);
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = rows[0]?.storeName?.trim() || storeId;

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title={t("admin_do_by_store_title", { title })} backHref="/admin/stores/orders" />
      <p className="mb-2 text-xs text-sam-muted">
        storeId: <span className="font-mono">{storeId}</span> ·{" "}
        <Link href="/admin/stores" className="text-signature underline">
          {t("admin_do_by_store_review")}
        </Link>{" "}
        ·{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          {t("admin_do_nav_store_orders")}
        </Link>
      </p>
      {error ? (
        <p className="mb-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
          {t("admin_do_common_load_failed", { error })}
        </p>
      ) : null}
      <div className="mb-2">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-ui-rect border border-sam-border px-3 py-1.5 text-xs text-sam-fg disabled:opacity-50"
        >
          {loading ? t("admin_do_common_refreshing") : t("admin_do_common_refresh")}
        </button>
      </div>
      <AdminCard titleKey="admin_do_orders_list_card">
        {loading ? (
          <p className="text-sm text-sam-muted">{t("admin_dashboard_loading")}</p>
        ) : (
          <OrderTable rows={rows} />
        )}
      </AdminCard>
    </div>
  );
}
