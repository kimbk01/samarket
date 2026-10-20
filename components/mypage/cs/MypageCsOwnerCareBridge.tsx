"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MemberCsNoteListClient } from "@/components/mypage/cs/MemberCsNoteListClient";
import { MemberCsNoteThreadClient } from "@/components/mypage/cs/MemberCsNoteThreadClient";
import { MyStateSkeleton } from "@/components/mypage/ds/MyStateView";
import { fetchMeStoresListDeduped } from "@/lib/me/fetch-me-stores-deduped";
import { resolveOwnerActiveStoreIdFromOwnedList } from "@/lib/delivery/owner/resolve-owner-active-store";
import {
  buildOwnerCareAdminNoteRoute,
} from "@/lib/notifications/member-admin-notes";
import { MYPAGE_BODY_COLUMN_CLASS } from "@/lib/ui/mypage-responsive-breakpoints";

/**
 * Store owners land on Owner Customer Care for the same note thread.
 * Non-owners keep /mypage/inbox|inquiries (Customer Communication HARD LOCK).
 */
/** 사장님 판별 대기 — 목록 모양 스켈레톤 4행 (최종 설계 S64) */
function BridgeSkeleton() {
  return (
    <div className={`${MYPAGE_BODY_COLUMN_CLASS} pt-16`}>
      <MyStateSkeleton template="list" rows={4} />
    </div>
  );
}

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
      const owned =
        status === 200 && Array.isArray(stores)
          ? stores
              .map((s) => ({ id: String(s.id ?? "").trim() }))
              .filter((s) => s.id)
          : [];
      const storeId = owned.length
        ? resolveOwnerActiveStoreIdFromOwnedList(owned, null) ?? ""
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

  if (!ready) return <BridgeSkeleton />;
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
    <Suspense fallback={<BridgeSkeleton />}>
      <MypageCsOwnerCareBridge {...props} />
    </Suspense>
  );
}
