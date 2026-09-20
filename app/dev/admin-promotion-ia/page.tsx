import { notFound } from "next/navigation";
import { AdminPromotionIaProofClient } from "@/components/dev/AdminPromotionIaProofClient";

export const dynamic = "force-dynamic";

export default function AdminPromotionIaProofPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <AdminPromotionIaProofClient />;
}
