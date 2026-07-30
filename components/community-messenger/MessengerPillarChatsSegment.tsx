"use client";

import { useSearchParams } from "next/navigation";
import { DomainTradeListCanaryGate } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";
import { DomainStoreOrderCustomerListCanaryGate } from "@/components/community-messenger/domain-shell-canary/DomainStoreOrderCustomerListCanaryGate";
import { MessengerPillarSplitChrome } from "@/components/community-messenger/MessengerPillarSplitChrome";

/**
 * 거래/배달 채팅 전용 서브 라우트 — allowlist → Domain List.
 * 우→좌 369ms enter 는 route `layout.tsx` SSOT (여기서 재실행 금지).
 */
export function MessengerPillarChatsSegment({
  pillar,
}: {
  pillar: "trade" | "delivery";
}) {
  const searchParams = useSearchParams();
  const filter = searchParams.get("filter")?.trim() || undefined;
  if (pillar === "trade") {
    return (
      <div data-domain-pillar-body="trade" className="flex h-full min-h-0 flex-col">
        <MessengerPillarSplitChrome pillar="trade" />
        <DomainTradeListCanaryGate filter={filter} tabletSplitListOnly />
      </div>
    );
  }
  return (
    <div data-domain-pillar-body="delivery" className="flex h-full min-h-0 flex-col">
      <MessengerPillarSplitChrome pillar="delivery" />
      <DomainStoreOrderCustomerListCanaryGate filter={filter} tabletSplitListOnly />
    </div>
  );
}
