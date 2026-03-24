"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getDeliveryOrders } from "@/lib/admin/delivery-orders-mock/mock-store";
import { useDeliveryMockVersion } from "@/lib/admin/delivery-orders-mock/use-delivery-mock-store";
import type { AdminDeliveryOrder } from "@/lib/admin/delivery-orders-mock/types";
import { SettlementFilterBar, type SettlementListFilters } from "./SettlementFilterBar";
import { SettlementTable } from "./SettlementTable";

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
  const v = useDeliveryMockVersion();
  const [filters, setFilters] = useState<SettlementListFilters>(defaultFilters);

  const rows = useMemo(() => {
    void v;
    return filterRows(getDeliveryOrders(), filters);
  }, [v, filters]);

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title="정산 관리" backHref="/admin/delivery-orders" />
      <p className="mb-3 text-sm text-gray-600">
        보류·해제·정산완료는 각 주문 상세의 운영 액션에서 처리합니다.
      </p>
      <SettlementFilterBar filters={filters} onChange={setFilters} />
      <div className="mt-4">
        <AdminCard title="정산 행 (주문 단위)">
          <SettlementTable rows={rows} />
        </AdminCard>
      </div>
    </div>
  );
}
