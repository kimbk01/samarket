"use client";

import { useLayoutEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  isCommerceHubTab,
  translateLegacyCouponsSearchParams,
  translateLegacyGiftWalletSearchParams,
  translateLegacyOrdersSearchParams,
} from "@/lib/delivery/customer/commerce-hub-nav";

type LegacyAliasKind = "orders" | "coupons" | "gifts" | "activity";

/** Ensures URL carries canonical hub query on legacy alias paths (G2 — same body, no redirect loop). */
export function CommerceHubLegacyUrlSync({ alias }: { alias: LegacyAliasKind }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useLayoutEffect(() => {
    const current = new URLSearchParams(searchParams.toString());
    let canonical: URLSearchParams;
    if (alias === "coupons") {
      canonical = translateLegacyCouponsSearchParams(current);
    } else if (alias === "gifts") {
      canonical = translateLegacyGiftWalletSearchParams(current);
    } else {
      canonical = translateLegacyOrdersSearchParams(current);
    }

    const tabOk = isCommerceHubTab(current.get("tab"));
    if (tabOk && alias !== "coupons" && alias !== "gifts") {
      const expand = current.get("expand");
      const canonicalExpand = canonical.get("expand");
      const orderFilter = current.get("orderFilter");
      const canonicalFilter = canonical.get("orderFilter");
      if (expand === canonicalExpand && orderFilter === canonicalFilter) return;
    }
    if (tabOk && alias === "coupons" && current.get("couponTab") === canonical.get("couponTab")) return;
    if (tabOk && alias === "gifts" && current.get("giftTab") === canonical.get("giftTab")) return;
    if (tabOk && alias === "activity") return;

    router.replace(`${pathname}?${canonical.toString()}`, { scroll: false });
  }, [alias, pathname, router, searchParams]);

  return null;
}
