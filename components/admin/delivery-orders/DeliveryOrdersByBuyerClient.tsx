"use client";

import { useMemo } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { listDeliveryOrdersByBuyer } from "@/lib/admin/delivery-orders-mock/mock-store";
import { useDeliveryMockVersion } from "@/lib/admin/delivery-orders-mock/use-delivery-mock-store";
import { OrderTable } from "./OrderTable";

export function DeliveryOrdersByBuyerClient({ buyerUserId }: { buyerUserId: string }) {
  const v = useDeliveryMockVersion();
  const rows = useMemo(() => {
    void v;
    return listDeliveryOrdersByBuyer(buyerUserId);
  }, [buyerUserId, v]);

  const label = rows[0]?.buyerName ?? buyerUserId;

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title={`회원 주문 이력 · ${label}`} backHref="/admin/delivery-orders" />
      <p className="mb-2 text-xs text-gray-500">
        buyerUserId: <span className="font-mono">{buyerUserId}</span>
      </p>
      <AdminCard title="주문 목록">
        <OrderTable rows={rows} />
      </AdminCard>
    </div>
  );
}
