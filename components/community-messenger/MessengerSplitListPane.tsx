"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import { CommunityMessengerHomeReturnConsume } from "@/components/community-messenger/CommunityMessengerHomeReturnConsume";
import { MessengerPillarChatsSegment } from "@/components/community-messenger/MessengerPillarChatsSegment";
import type { MessengerSplitListScope } from "@/lib/community-messenger/messenger-split-list-scope";

/**
 * 768px+ split 좌측 목록 — pathname·cm_list 로 inbox / trade / delivery 전환.
 * Telegram list authority: trade/delivery MUST use Domain canary (same as mobile),
 * not CommunityMessengerHome pillar filter over hub bootstrap (commerce rows stripped).
 */
function MessengerSplitListPaneBody({ scope }: { scope: MessengerSplitListScope }) {
  const searchParams = useSearchParams();
  if (scope === "trade" || scope === "delivery") {
    return <MessengerPillarChatsSegment pillar={scope} />;
  }

  const tab = searchParams.get("tab")?.trim() || undefined;
  const section = searchParams.get("section")?.trim() || undefined;
  const filter = searchParams.get("filter")?.trim() || undefined;
  const kind = searchParams.get("kind")?.trim() || undefined;

  return (
    <CommunityMessengerHome
      tabletSplitListOnly
      pillar={null}
      initialTab={tab}
      initialSection={section}
      initialFilter={filter}
      initialKind={kind}
    />
  );
}

export function MessengerSplitListPane({ scope }: { scope: MessengerSplitListScope }) {
  return (
    <Suspense fallback={<CommunityMessengerHomeReturnConsume />}>
      <MessengerSplitListPaneBody key={scope} scope={scope} />
    </Suspense>
  );
}
