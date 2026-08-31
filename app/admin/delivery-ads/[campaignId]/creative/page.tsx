"use client";

import { use } from "react";
import { AdminDeliveryAdBannerStudioView } from "@/components/admin/stores/AdminDeliveryAdBannerStudioView";

export default function AdminDeliveryAdCreativeStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ product?: string | string[] }>;
}) {
  const { campaignId } = use(params);
  const sp = use(searchParams);
  const raw = Array.isArray(sp.product) ? sp.product[0] : sp.product;
  const productHint = raw === "banner" ? "banner" : "banner";
  return <AdminDeliveryAdBannerStudioView campaignId={campaignId} productHint={productHint} />;
}
