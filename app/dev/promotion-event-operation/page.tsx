import { notFound } from "next/navigation";
import { PromotionEventOperationProofClient } from "@/components/dev/PromotionEventOperationProofClient";

export const dynamic = "force-dynamic";

/** Local visual proof only — unavailable in production builds. */
export default function PromotionEventOperationProofPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PromotionEventOperationProofClient />;
}
