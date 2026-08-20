/**
 * ORPHAN / QUARANTINED — not mounted by any live Admin route.
 * Product list SSOT = `/admin/posts-management` (`AdminPostsManagementPage`).
 * Do not re-wire this page into Trade NAV without a new cut.
 */
"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import type { Product } from "@/lib/types/product";
import {
  filterAndSortProducts,
  type AdminProductFilters,
  type AdminProductSortKey,
} from "@/lib/admin-products/admin-product-utils";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminProductFilterBar } from "./AdminProductFilterBar";
import { getSupabaseClient } from "@/lib/supabase/client";
import { fetchTradeHomeRootCategories } from "@/lib/categories/trade-home-root-query";
import type { CategoryWithSettings } from "@/lib/categories/types";
import { AdminProductTable } from "./AdminProductTable";
import { fetchAdminPostsManagementDeduped } from "@/lib/admin/fetch-admin-posts-management-deduped";

const DEFAULT_FILTERS: AdminProductFilters = {
  status: "",
  category: "",
  location: "",
  sortKey: "latest" as AdminProductSortKey,
};

export function AdminProductListPage() {
  const { t } = useI18n();
  const [filters, setFilters] = useState<AdminProductFilters>(DEFAULT_FILTERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [supabaseAvailable, setSupabaseAvailable] = useState<boolean | null>(null);
  const [tradeMenuRoots, setTradeMenuRoots] = useState<CategoryWithSettings[]>([]);
  const [tradeMenuRootId, setTradeMenuRootId] = useState("");
  const [tradeExpandIds, setTradeExpandIds] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const { status, json: raw } = await fetchAdminPostsManagementDeduped();
      const data =
        status >= 200 && status < 300 && raw && typeof raw === "object"
          ? (raw as { products?: Product[]; queryError?: string | null })
          : {};
      if (status < 200 || status >= 300) {
        setProducts([]);
        setListError(data.queryError ?? `${t("admin_products_list_load_failed")} (${status})`);
        return;
      }
      setProducts(Array.isArray(data.products) ? data.products : []);
      if (data.queryError) setListError(data.queryError);
    } catch {
      setProducts([]);
      setListError(t("admin_products_list_load_failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const sb = getSupabaseClient();
    setSupabaseAvailable(sb !== null);
    if (!sb) {
      setTradeMenuRoots([]);
      return;
    }
    void fetchTradeHomeRootCategories(sb as any).then(setTradeMenuRoots);
  }, []);

  useEffect(() => {
    if (!tradeMenuRootId.trim()) {
      setTradeExpandIds(null);
      return;
    }
    let cancelled = false;
    void fetch(`/api/categories/trade-expand-ids?rootId=${encodeURIComponent(tradeMenuRootId.trim())}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; ids?: string[] }>)
      .then((j) => {
        if (cancelled) return;
        setTradeExpandIds(Array.isArray(j.ids) ? j.ids : []);
      })
      .catch(() => {
        if (!cancelled) setTradeExpandIds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tradeMenuRootId]);

  const filtered = useMemo(() => {
    let list = filterAndSortProducts(products, filters, searchQuery);
    if (tradeExpandIds && tradeExpandIds.length > 0) {
      const allow = new Set(tradeExpandIds);
      list = list.filter((p) => {
        const tid = p.tradeCategoryId ?? null;
        return tid != null && String(tid).trim() !== "" && allow.has(String(tid));
      });
    }
    return list;
  }, [products, filters, searchQuery, tradeExpandIds]);

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_products_list_title" />
      {supabaseAvailable === false && (
        <div className="rounded-ui-rect border border-amber-200 bg-amber-50 px-4 py-3 sam-text-body-secondary text-amber-800">
          <p className="font-medium">{t("admin_products_supabase_warn_title")}</p>
          <p className="mt-1 text-amber-700">{t("admin_products_supabase_warn_body")}</p>
        </div>
      )}
      <AdminProductFilterBar
        filters={filters}
        products={products}
        searchQuery={searchQuery}
        onFiltersChange={setFilters}
        onSearchChange={setSearchQuery}
        tradeMenuRoots={tradeMenuRoots}
        tradeMenuRootId={tradeMenuRootId}
        onTradeMenuRootIdChange={setTradeMenuRootId}
      />
      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {t("admin_dashboard_loading")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center sam-text-body text-sam-muted">
          {listError ? (
            <p className="whitespace-pre-wrap text-sam-danger">{listError}</p>
          ) : (
            t("admin_products_list_empty_filtered")
          )}
        </div>
      ) : (
        <AdminProductTable products={filtered} />
      )}
    </div>
  );
}
