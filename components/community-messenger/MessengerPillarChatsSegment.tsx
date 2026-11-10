"use client";

import { useSearchParams } from "next/navigation";
import { DomainTradeListCanaryGate } from "@/components/community-messenger/domain-shell-canary/DomainTradeListCanaryGate";
import { DomainStoreOrderCustomerListCanaryGate } from "@/components/community-messenger/domain-shell-canary/DomainStoreOrderCustomerListCanaryGate";

/**
 * 거래/배달 채팅 전용 서브 라우트 — allowlist → Domain List.
 * 우→좌 369ms enter 는 route `layout.tsx` SSOT (여기서 재실행 금지).
 * 머리글(모바일 1단 「모두 읽음」·분할 제목/뒤로)은 목록 gate 가 `useMessengerPillarHeaderChrome` 으로 등록한다
 * (안 읽은 방·「모두 읽음」 실행을 gate 가 가진다 — 채팅 시안 4판 「9」「10」).
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
        <DomainTradeListCanaryGate filter={filter} tabletSplitListOnly />
      </div>
    );
  }
  return (
    <div data-domain-pillar-body="delivery" className="flex h-full min-h-0 flex-col">
      <DomainStoreOrderCustomerListCanaryGate filter={filter} tabletSplitListOnly />
    </div>
  );
}
