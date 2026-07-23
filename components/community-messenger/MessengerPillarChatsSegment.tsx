"use client";

import { useSearchParams } from "next/navigation";
import { DomainTradeListCanaryGate } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";
import { DomainStoreOrderCustomerListCanaryGate } from "@/components/community-messenger/domain-shell-canary/DomainStoreOrderCustomerListCanaryGate";

/**
 * 거래/배달 채팅 전용 서브 라우트 — allowlist → Domain List, else Legacy inside gates.
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
      <div data-domain-pillar-segment="trade" className="flex h-full min-h-0 flex-col">
        <DomainTradeListCanaryGate filter={filter} />
      </div>
    );
  }
  return (
    <div data-domain-pillar-segment="delivery" className="flex h-full min-h-0 flex-col">
      <DomainStoreOrderCustomerListCanaryGate filter={filter} />
    </div>
  );
}
