"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import { CommunityMessengerHomeReturnConsume } from "@/components/community-messenger/CommunityMessengerHomeReturnConsume";
import type { MessengerSplitListScope } from "@/lib/community-messenger/messenger-split-list-scope";

function scopeToPillar(scope: MessengerSplitListScope): "trade" | "delivery" | null {
  if (scope === "trade") return "trade";
  if (scope === "delivery") return "delivery";
  return null;
}

/**
 * 768px+ split 좌측 목록 — pathname·cm_list 로 inbox / trade / delivery 전환.
 */
function MessengerSplitListPaneBody({ scope }: { scope: MessengerSplitListScope }) {
  const searchParams = useSearchParams();
  const pillar = scopeToPillar(scope);
  const tab = searchParams.get("tab")?.trim() || undefined;
  const section = searchParams.get("section")?.trim() || undefined;
  const filter = searchParams.get("filter")?.trim() || undefined;
  const kind = searchParams.get("kind")?.trim() || undefined;

  return (
    <CommunityMessengerHome
      tabletSplitListOnly
      pillar={pillar}
      initialTab={tab}
      initialSection={pillar ? "chats" : section}
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
