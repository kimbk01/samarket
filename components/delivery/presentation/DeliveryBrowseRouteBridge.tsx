"use client";

import { useLayoutEffect } from "react";
import { useDeliveryPresentationApi } from "@/components/delivery/presentation/DeliveryPresentationShell";

/** Browse route page → shell owns the single BrowseSurface instance. */
export function DeliveryBrowseRouteBridge({
  primarySlug,
  initialSubSlug,
}: {
  primarySlug: string;
  initialSubSlug: string | null;
}) {
  const api = useDeliveryPresentationApi();
  /** useLayoutEffect runs before paint; do not update the shell during bridge render. */
  useLayoutEffect(() => {
    api.ensureBrowse({ primarySlug, initialSubSlug });
  }, [api, primarySlug, initialSubSlug]);
  return null;
}
