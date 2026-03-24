"use client";

import { useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { getDeliveryOrders, getDeliveryReports } from "@/lib/admin/delivery-orders-mock/mock-store";
import { useDeliveryMockVersion } from "@/lib/admin/delivery-orders-mock/use-delivery-mock-store";
import type { OrderReport } from "@/lib/admin/delivery-orders-mock/types";
import { OrderReportTable } from "./OrderReportTable";
import { OrderReportDetail } from "./OrderReportDetail";
import { DisputeActionPanel } from "./DisputeActionPanel";

export function DeliveryReportsClient() {
  const v = useDeliveryMockVersion();
  const { reports, orderNoById, storeNameByOrderId } = useMemo(() => {
    void v;
    const orders = getDeliveryOrders();
    const orderNoById: Record<string, string> = {};
    const storeNameByOrderId: Record<string, string> = {};
    for (const o of orders) {
      orderNoById[o.id] = o.orderNo;
      storeNameByOrderId[o.id] = o.storeName;
    }
    return { reports: getDeliveryReports(), orderNoById, storeNameByOrderId };
  }, [v]);

  const [selectedId, setSelectedId] = useState<string | null>(reports[0]?.id ?? null);

  const selected: OrderReport | null = useMemo(
    () => reports.find((r) => r.id === selectedId) ?? null,
    [reports, selectedId]
  );

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title="신고·분쟁" backHref="/admin/delivery-orders" />
      <AdminCard title="신고 목록">
        <OrderReportTable
          rows={reports}
          orderNoById={orderNoById}
          storeNameByOrderId={storeNameByOrderId}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </AdminCard>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <AdminCard title="상세">
          <OrderReportDetail
            report={selected}
            orderNo={selected ? orderNoById[selected.orderId] ?? selected.orderId : "—"}
            storeName={selected ? storeNameByOrderId[selected.orderId] ?? "" : ""}
          />
        </AdminCard>
        <AdminCard title="조치">
          <DisputeActionPanel report={selected} />
        </AdminCard>
      </div>
    </div>
  );
}
