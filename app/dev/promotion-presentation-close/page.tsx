import { notFound } from "next/navigation";
import { PromotionPresentationProofClient } from "@/components/dev/PromotionPresentationProofClient";

export const dynamic = "force-dynamic";

/**
 * Local visual proof only — outside `(main)` so bottom-nav chrome cannot overlay captures.
 * Unavailable in production builds.
 */
export default function PromotionPresentationProofPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PromotionPresentationProofClient />;
}
