"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { getAdminProductsFromDb } from "@/lib/admin-products/getAdminProductsFromDb";
import type { Product } from "@/lib/types/product";
import {
  filterAndSortProducts,
  type AdminProductFilters,
  type AdminProductSortKey,
} from "@/lib/admin-products/admin-product-utils";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminProductFilterBar } from "./AdminProductFilterBar";
import { AdminProductTable } from "./AdminProductTable";

const DEFAULT_FILTERS: AdminProductFilters = {
  status: "",
  category: "",
  location: "",
  sortKey: "latest" as AdminProductSortKey,
};

export function AdminProductListPage() {
  const [filters, setFilters] = useState<AdminProductFilters>(DEFAULT_FILTERS);
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { products: list } = await getAdminProductsFromDb();
    setProducts(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => filterAndSortProducts(products, filters, searchQuery),
    [products, filters, searchQuery]
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader title="상품 목록" />
      <AdminProductFilterBar
        filters={filters}
        products={products}
        searchQuery={searchQuery}
        onFiltersChange={setFilters}
        onSearchChange={setSearchQuery}
      />
      {loading ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
          불러오는 중…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-ui-rect border border-sam-border bg-sam-surface py-12 text-center text-[14px] text-sam-muted">
          조건에 맞는 상품이 없습니다.
        </div>
      ) : (
        <AdminProductTable products={filtered} />
      )}
    </div>
  );
}
