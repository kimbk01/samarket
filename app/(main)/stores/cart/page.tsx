import { Suspense } from "react";
import { StoreGlobalCartEntry } from "@/components/stores/StoreGlobalCartEntry";

export default function StoresCartEntryPage() {
  return (
    <Suspense fallback={null}>
      <StoreGlobalCartEntry />
    </Suspense>
  );
}

