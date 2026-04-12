"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import { listDeliveryOrdersByStore } from "@/lib/admin/delivery-orders-mock/mock-store";
import { useDeliveryMockVersion } from "@/lib/admin/delivery-orders-mock/use-delivery-mock-store";
import { OrderTable } from "./OrderTable";

export function DeliveryOrdersByStoreClient({ storeId }: { storeId: string }) {
  const v = useDeliveryMockVersion();
  const rows = useMemo(() => {
    void v;
    return listDeliveryOrdersByStore(storeId);
  }, [storeId, v]);

  const title = rows[0]?.storeName ?? storeId;

  return (
    <div className="p-4 md:p-6">
      <AdminPageHeader title={`매장 주문 이력 · ${title}`} backHref="/admin/delivery-orders" />
      <p className="mb-2 text-xs text-sam-muted">
        storeId: <span className="font-mono">{storeId}</span> ·{" "}
        <Link href="/admin/stores" className="text-signature underline">
          매장 심사
        </Link>
      </p>
      <AdminCard title="주문 목록">
        <OrderTable rows={rows} />
      </AdminCard>
    </div>
  );
}
