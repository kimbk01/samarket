import { Suspense } from "react";
import { OwnerStoreOrderChatsView } from "@/components/business/owner/OwnerStoreOrderChatsView";
import { OwnerOrderChatsPageFallback } from "@/components/business/owner/OwnerOrderChatsPageFallback";

export default function OwnerStoreOrderChatsPage() {
  return (
    <Suspense fallback={<OwnerOrderChatsPageFallback />}>
      <OwnerStoreOrderChatsView />
    </Suspense>
  );
}
