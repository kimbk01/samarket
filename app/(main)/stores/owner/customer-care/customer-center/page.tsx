"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { OwnerAdminPageScrollShell } from "@/components/business/owner/OwnerAdminPageScrollShell";
import { OwnerCustomerCenterView } from "@/components/business/owner/OwnerCustomerCenterView";
import { OwnerStoreSuspenseFallback } from "@/components/business/owner/OwnerStoreSuspenseFallback";

function OwnerCustomerCenterPageInner() {
  const [inboxUnread, setInboxUnread] = useState(0);
  const [inquiryUnread, setInquiryUnread] = useState(0);

  const load = useCallback(async () => {
    const sum = async (kind: "inbox" | "inquiry") => {
      const res = await fetch(`/api/me/admin-notes?kind=${kind}`, {
        credentials: "include",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        threads?: { member_unread_count?: number }[];
      };
      if (!res.ok || !j.ok || !Array.isArray(j.threads)) return 0;
      return j.threads.reduce((n, th) => n + Math.max(0, Number(th.member_unread_count) || 0), 0);
    };
    const [inbox, inquiry] = await Promise.all([sum("inbox"), sum("inquiry")]);
    setInboxUnread(inbox);
    setInquiryUnread(inquiry);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return <OwnerCustomerCenterView inboxUnread={inboxUnread} inquiryUnread={inquiryUnread} />;
}

export default function OwnerCustomerCenterPage() {
  return (
    <Suspense
      fallback={
        <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-4">
          <OwnerStoreSuspenseFallback className="text-sm text-sam-muted" />
        </OwnerAdminPageScrollShell>
      }
    >
      <OwnerAdminPageScrollShell padForOwnerBottomNav={false} className="pt-1">
        <OwnerCustomerCenterPageInner />
      </OwnerAdminPageScrollShell>
    </Suspense>
  );
}
