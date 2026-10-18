import { AdminOrderDetailPage } from "@/components/admin/store-orders/AdminOrderDetailPage";

export default async function AdminStoreOrderDetailPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <AdminOrderDetailPage orderId={orderId} />;
}
