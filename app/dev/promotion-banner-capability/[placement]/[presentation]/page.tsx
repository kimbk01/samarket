import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PromotionBannerCapabilityProofClient } from "@/components/dev/PromotionBannerCapabilityProofClient";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ placement: string; presentation: string }>;
};

/**
 * Path-segment proof URLs so Android Chrome must navigate between combos
 * (query-only changes are often ignored by a reused Chrome tab).
 */
export default async function PromotionBannerCapabilityProofComboPage({ params }: Props) {
  if (process.env.NODE_ENV === "production") notFound();
  const { placement, presentation } = await params;
  return (
    <Suspense fallback={<p className="p-4 text-sm">Loading proof…</p>}>
      <PromotionBannerCapabilityProofClient
        pathPlacement={placement}
        pathPresentation={presentation}
      />
    </Suspense>
  );
}
