"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";
import { OwnerRoutes } from "@/lib/business/owner-routes";

function RedirectInner({ tab }: { tab: "messages" | "inquiries" }) {
  const router = useRouter();
  const sp = useSearchParams();
  const storeId = sp.get("storeId");

  useEffect(() => {
    const href = OwnerRoutes.customerCareCenter(storeId, tab);
    const withFrom = href.includes("from=")
      ? href
      : `${href}${href.includes("?") ? "&" : "?"}from=owner-care`;
    router.replace(withFrom);
  }, [router, storeId, tab]);

  return <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />;
}

export function OwnerCareListRedirect({ tab }: { tab: "messages" | "inquiries" }) {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-1">
        <RedirectInner tab={tab} />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
