import { Suspense } from "react";
import { AdminDeliveryScreensHub } from "@/components/admin/stores/delivery-screens/AdminDeliveryScreensHub";

export default function AdminDeliveryScreensPage() {
  return (
    <Suspense fallback={null}>
      <AdminDeliveryScreensHub />
    </Suspense>
  );
}
