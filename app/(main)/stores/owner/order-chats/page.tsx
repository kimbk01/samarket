import { Suspense } from "react";
import { OwnerStoreOrderChatsView } from "@/components/business/owner/OwnerStoreOrderChatsView";

export default function OwnerStoreOrderChatsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[12rem] items-center justify-center bg-[#F3F4F6] text-sm text-[#8C8C8C]">
          불러오는 중…
        </div>
      }
    >
      <OwnerStoreOrderChatsView />
    </Suspense>
  );
}
