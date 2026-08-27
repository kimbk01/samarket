"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MemberCsNoteListClient } from "@/components/mypage/cs/MemberCsNoteListClient";
import { MemberCsNoteThreadClient } from "@/components/mypage/cs/MemberCsNoteThreadClient";
import { MainFeedRouteLoading } from "@/components/layout/MainRouteLoading";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import {
  buildOwnerCareAdminNoteRoute,
} from "@/lib/notifications/member-admin-notes";

/**
 * Store owners land on Owner Customer Care for the same note thread.
 * Non-owners keep /mypage/inbox|inquiries (Customer Communication HARD LOCK).
 */
export function MypageCsOwnerCareBridge({
  kind,
  mode,
}: {
  kind: "inbox" | "inquiry";
  mode: "list" | "thread";
}) {
  const router = useRouter();
  const params = useParams();
  const threadId = String(params?.threadId ?? "").trim();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { status, json } = await fetchMeStoresListDeduped();
      const stores = (json as { stores?: { id?: string }[] } | null)?.stores;
      const storeId =
        status === 200 && Array.isArray(stores) && stores[0]?.id
          ? String(stores[0].id)
          : "";
      if (cancelled) return;
      if (storeId) {
        if (mode === "thread" && threadId) {
          router.replace(buildOwnerCareAdminNoteRoute(threadId, kind === "inbox" ? "admin" : "member", storeId));
          return;
        }
        const tab = kind === "inbox" ? "messages" : "inquiries";
        const base = `/stores/owner/customer-care/customer-center?tab=${tab}&storeId=${encodeURIComponent(storeId)}&from=owner-care`;
        router.replace(base);
        return;
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, mode, router, threadId]);

  if (!ready) return <MainFeedRouteLoading rows={4} />;
  if (mode === "thread") {
    return <MemberCsNoteThreadClient kind={kind} />;
  }
  return <MemberCsNoteListClient kind={kind} />;
}

export function MypageCsOwnerCareBridgeSuspense(props: {
  kind: "inbox" | "inquiry";
  mode: "list" | "thread";
}) {
  return (
    <Suspense fallback={<MainFeedRouteLoading rows={4} />}>
      <MypageCsOwnerCareBridge {...props} />
    </Suspense>
  );
}
