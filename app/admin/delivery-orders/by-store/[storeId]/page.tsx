import { DeliveryOrdersByStoreClient } from "@/components/admin/delivery-orders/DeliveryOrdersByStoreClient";

export default async function AdminDeliveryOrdersByStorePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  return <DeliveryOrdersByStoreClient storeId={storeId} />;
}
