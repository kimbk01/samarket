"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminAdsExposureControlPlane } from "@/components/admin/ads/AdminAdsExposureControlPlane";
import { DELIVERY_AD_ADMIN_ROUTES } from "@/lib/stores/advertising/delivery-ad-routes";

/**
 * Ads 관제 — Control Plane ONLY.
 * Delivery hub lives at /admin/delivery-ads/manage (no dual stack).
 * Legacy ?view=&inventory= deep links redirect to manage with query preserved.
 */
function AdminAdsControlEntry() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldHandoffToDeliveryHub =
    Boolean(searchParams.get("view")?.trim()) ||
    Boolean(searchParams.get("inventory")?.trim()) ||
    Boolean(searchParams.get("primarySlug")?.trim()) ||
    Boolean(searchParams.get("primary")?.trim()) ||
    Boolean(searchParams.get("subSlug")?.trim()) ||
    Boolean(searchParams.get("sub")?.trim()) ||
    Boolean(searchParams.get("storeId")?.trim()) ||
    Boolean(searchParams.get("product")?.trim());

  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace(/^#/, "");
      if (hash === "action-required" || hash === "collision") {
        router.replace(`${DELIVERY_AD_ADMIN_ROUTES.hub}#${hash}`);
        return;
      }
    }
    if (!shouldHandoffToDeliveryHub) return;
    const qs = searchParams.toString();
    router.replace(
      qs ? `${DELIVERY_AD_ADMIN_ROUTES.hub}?${qs}` : DELIVERY_AD_ADMIN_ROUTES.hub
    );
  }, [shouldHandoffToDeliveryHub, router, searchParams]);

  if (shouldHandoffToDeliveryHub) {
    return (
      <p className="sam-text-body text-sam-muted" data-admin-ads-control-handoff="delivery-hub">
        Redirecting to Delivery ads ops…
      </p>
    );
  }

  return <AdminAdsExposureControlPlane />;
}

export default function AdminAdsControlPage() {
  return (
    <Suspense fallback={null}>
      <AdminAdsControlEntry />
    </Suspense>
  );
}
