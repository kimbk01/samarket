"use client";

import { Suspense, use } from "react";
import { OwnerDeliveryAdDetailPageBody } from "@/components/support/OwnerDeliveryAdDetailSupportShell";

export default function OwnerDeliveryAdDetailPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = use(params);
  return <OwnerDeliveryAdDetailPageBody campaignId={campaignId} />;
}
