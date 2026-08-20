"use client";

/**
 * ORPHAN / QUARANTINE (Slice 4 Delivery vertical).
 * Not mounted by any route. Real settlement authority = AdminStoreSettlementsPage
 * at /admin/store-settlements. Do not rewire this hollow store_orders projection
 * as settlement ops. Legacy path stores/orders/settlements redirects permanently.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { fetchAdminStoreOrdersListDeduped } from "@/lib/admin/fetch-admin-store-orders-deduped";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-admin/types";
import { parseAdminStoreOrdersResponse } from "@/lib/admin/fetch-admin-store-orders-scoped";
import { SettlementFilterBar, type SettlementListFilters } from "./SettlementFilterBar";
import { SettlementTable } from "./SettlementTable";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

const defaultFilters: SettlementListFilters = {
  settlementStatus: "",
  storeQuery: "",
  heldOnly: false,
};

function filterRows(all: AdminDeliveryOrder[], f: SettlementListFilters): AdminDeliveryOrder[] {
  return all.filter((o) => {
    if (f.settlementStatus && o.settlementStatus !== f.settlementStatus) return false;
    if (f.heldOnly && o.settlementStatus !== "held") return false;
    if (f.storeQuery.trim() && !o.storeName.toLowerCase().includes(f.storeQuery.trim().toLowerCase()))
      return false;
    return true;
  });
}

export function DeliverySettlementsClient() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<SettlementListFilters>(defaultFilters);
  const [orders, setOrders] = useState<AdminDeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status, json } = await fetchAdminStoreOrdersListDeduped();
      const j = json as { ok?: boolean; error?: string };
      if (status < 200 || status >= 300 || j.ok === false) {
        setOrders([]);
        setError(typeof j.error === "string" ? j.error : `HTTP ${status}`);
        return;
      }
      setOrders(parseAdminStoreOrdersResponse(json));
    } catch {
      setOrders([]);
      setError("network_error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => filterRows(orders, filters), [orders, filters]);

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader titleKey="admin_do_settlements_title" backHref="/admin/stores/orders" />
      <p className="mb-2 sam-text-body-secondary text-sam-muted">
        {t("admin_do_settlements_intro")}{" "}
        <Link href="/admin/store-settlements" className="text-signature underline">
          {t("admin_do_settlements_store_link")}
        </Link>
        {t("admin_do_settlements_intro_mid")}{" "}
        <Link href="/admin/store-orders" className="text-signature underline">
          {t("admin_do_nav_store_orders")}
        </Link>
        {t("admin_do_settlements_intro_suffix")}
      </p>
      {error ? (
        <p className="mb-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
          {t("admin_do_settlements_list_failed", { error })}
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
      <SettlementFilterBar filters={filters} onChange={setFilters} />
      <div className="mt-4">
        <AdminCard titleKey="admin_do_settlements_card">
          {loading ? <p className="text-sm text-sam-muted">{t("admin_dashboard_loading")}</p> : <SettlementTable rows={rows} />}
        </AdminCard>
      </div>
    </div>
  );
}
