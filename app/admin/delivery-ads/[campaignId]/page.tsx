"use client";

import { use } from "react";
import { AdminDeliveryAdDetailWorkspace } from "@/components/admin/stores/AdminDeliveryAdDetailWorkspace";
import { isAdminDeliveryAdProduct } from "@/lib/stores/advertising/admin-delivery-ad-contract";

export default function AdminDeliveryAdDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ product?: string | string[] }>;
}) {
  const { campaignId } = use(params);
  const sp = use(searchParams);
  const raw = Array.isArray(sp.product) ? sp.product[0] : sp.product;
  const productHint = isAdminDeliveryAdProduct(raw) ? raw : null;
  return (
    <AdminDeliveryAdDetailWorkspace campaignId={campaignId} productHint={productHint} />
  );
}
