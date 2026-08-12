import { Suspense } from "react";
import { AdminTradeFlowPage } from "@/components/admin/trade-flow/AdminTradeFlowPage";

export default function AdminTradeFlowRoutePage() {
  return (
    <Suspense fallback={null}>
      <AdminTradeFlowPage />
    </Suspense>
  );
}
