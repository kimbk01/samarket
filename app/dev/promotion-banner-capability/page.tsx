import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PromotionBannerCapabilityProofClient } from "@/components/dev/PromotionBannerCapabilityProofClient";

export const dynamic = "force-dynamic";

/** Local visual proof only — unavailable in production builds. */
export default function PromotionBannerCapabilityProofPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={<p className="p-4 text-sm">Loading proof…</p>}>
      <PromotionBannerCapabilityProofClient />
    </Suspense>
  );
}
