"use client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

import { useLayoutEffect } from "react";
import { deliveryShellEntryMark } from "@/lib/dibay/delivery-shell-entry-trace";
import { decodeSlugSegment } from "@/lib/stores/store-consumer-route";

/** `app/(main)/stores/[slug]/page` 클라이언트 진입 시점 */
export function StoreDetailPageEnterTrace({ slug }: { slug: string }): null {
  const decoded = decodeSlugSegment(slug);

  useLayoutEffect(() => {
    if (!decoded) return;
    deliveryShellEntryMark("detail_page_enter", { slug: decoded });
  }, [decoded]);

  return null;
}
