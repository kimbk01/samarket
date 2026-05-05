import { Suspense } from "react";
import { DeliverySearchPage } from "@/components/delivery/search/DeliverySearchPage";

export default function StoresSearchRoutePage() {
  return (
    <Suspense fallback={null}>
      <DeliverySearchPage />
    </Suspense>
  );
}

