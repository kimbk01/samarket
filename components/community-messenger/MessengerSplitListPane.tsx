"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import { CommunityMessengerHomeReturnConsume } from "@/components/community-messenger/CommunityMessengerHomeReturnConsume";

/**
 * 768px+ split 좌측 목록 — URL query(section/filter/kind) 와 동기화.
 * room route 에서도 shell list 인스턴스는 유지된다.
 */
function MessengerSplitListPaneBody() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab")?.trim() || undefined;
  const section = searchParams.get("section")?.trim() || undefined;
  const filter = searchParams.get("filter")?.trim() || undefined;
  const kind = searchParams.get("kind")?.trim() || undefined;

  return (
    <CommunityMessengerHome
      tabletSplitListOnly
      initialTab={tab}
      initialSection={section}
      initialFilter={filter}
      initialKind={kind}
    />
  );
}

export function MessengerSplitListPane() {
  return (
    <Suspense fallback={<CommunityMessengerHomeReturnConsume />}>
      <MessengerSplitListPaneBody />
    </Suspense>
  );
}
