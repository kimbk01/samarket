"use client";

import { useLayoutEffect } from "react";
import { StoreDetailPublic } from "@/components/stores/StoreDetailPublic";
import { useDeliveryPresentationApi } from "@/components/delivery/presentation/DeliveryPresentationShell";

/**
 * Soft (parked browse): shell hosts StoreDetailPublic — this bridge returns null.
 * Hard / direct: render StoreDetailPublic here (RSC page entry preserved).
 */
export function DeliveryStoreRouteBridge({ slug }: { slug: string }) {
  const api = useDeliveryPresentationApi();
  const soft = api.shouldHostStore();

  useLayoutEffect(() => {
    api.noteStoreRoute(slug);
  }, [api, slug]);

  if (soft) return null;
  return <StoreDetailPublic key={slug} slug={slug} initialApiResponse={null} />;
}
