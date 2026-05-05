import { permanentRedirect } from "next/navigation";

export default async function AdminDeliveryOrdersByStorePage({
  params,
}: {
  params: Promise<{ storeId: string }>;
}) {
  const { storeId } = await params;
  permanentRedirect(`/admin/stores/orders/by-store/${encodeURIComponent(storeId)}`);
}
