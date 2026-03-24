"use client";

import { useMemo } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getDeliveryLogs, getDeliveryOrders } from "@/lib/admin/delivery-orders-mock/mock-store";
import { useDeliveryMockVersion } from "@/lib/admin/delivery-orders-mock/use-delivery-mock-store";
import { DeliveryAuditLogTable } from "./DeliveryAuditLogTable";

export function DeliveryAuditLogsClient() {
  const v = useDeliveryMockVersion();
  const { logs, orderNoById } = useMemo(() => {
    void v;
    const orders = getDeliveryOrders();
    const orderNoById: Record<string, string> = {};
    for (const o of orders) orderNoById[o.id] = o.orderNo;
    return { logs: getDeliveryLogs(), orderNoById };
  }, [v]);

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title="주문 감사 로그" backHref="/admin/delivery-orders" />
      <AdminCard title="전체 이력 (mock · 최신순)">
        <DeliveryAuditLogTable logs={logs} orderNoById={orderNoById} />
      </AdminCard>
    </div>
  );
}
