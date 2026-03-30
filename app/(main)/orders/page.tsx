import { Suspense } from "react";
import { OrdersHubContent } from "@/components/orders/OrdersHubContent";

function OrdersHubFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center bg-background text-sm text-gray-500">
      불러오는 중…
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<OrdersHubFallback />}>
      <OrdersHubContent />
    </Suspense>
  );
}
