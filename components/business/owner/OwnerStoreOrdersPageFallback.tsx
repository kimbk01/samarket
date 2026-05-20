"use client";

import { OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS } from "@/lib/stores/owner-mobile-ui-tokens";

/** Suspense fallback — body skeleton only; shell owns the header */
export function OwnerStoreOrdersPageFallback() {
  return (
    <div
      className={`flex h-full min-h-0 w-full flex-col bg-[#F3F4F6] ${OWNER_MOBILE_BOTTOM_NAV_PAD_CLASS}`}
    >
      <div className="min-h-0 flex-1 animate-pulse px-2 pt-2">
        <div className="h-11 rounded-[4px] bg-white" />
        <div className="mt-2 space-y-2">
          <div className="h-24 rounded-[4px] bg-white" />
          <div className="h-24 rounded-[4px] bg-white" />
        </div>
      </div>
    </div>
  );
}
