"use client";

import { use } from "react";
import { AdminDeliveryAdDetailWorkspace } from "@/components/admin/stores/AdminDeliveryAdDetailWorkspace";
import { isAdminDeliveryAdProduct } from "@/lib/stores/advertising/admin-delivery-ad-contract";

export default function AdminDeliveryAdDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ campaignId: string }>;
  searchParams: Promise<{ product?: string | string[]; focus?: string | string[] }>;
}) {
  const { campaignId } = use(params);
  const sp = use(searchParams);
  const raw = Array.isArray(sp.product) ? sp.product[0] : sp.product;
  const productHint = isAdminDeliveryAdProduct(raw) ? raw : null;
  const focusRaw = Array.isArray(sp.focus) ? sp.focus[0] : sp.focus;
  const focusOperations = focusRaw === "operations";
  const focusCreative = focusRaw === "creative";
  return (
    <AdminDeliveryAdDetailWorkspace
      campaignId={campaignId}
      productHint={productHint}
      focusOperations={focusOperations}
      focusCreative={focusCreative}
    />
  );
}
