"use client";

import {
  type StoreOrderSummaryTimelineStep,
} from "@/lib/store-order-chat/store-order-summary-timeline";
import {
  buildStoreOrderChatCardView,
  type StoreOrderChatCardView,
} from "@/lib/store-order-chat/build-store-order-chat-card-view";
import { StoreOrderReceiptCard } from "@/components/community-messenger/room/phase2/StoreOrderReceiptCard";
import { useMessengerRoomPhase2View } from "@/components/community-messenger/room/phase2/messenger-room-phase2-view-context";
import { useStoreOrderDeliveryRoomOptional } from "@/components/community-messenger/room/phase2/store-order-delivery-room-context";
import { useStoreOrderRoomSnapshot } from "@/lib/store-order-chat/use-store-order-room-snapshot";

type Props = {
  content: string;
  timeline?: StoreOrderSummaryTimelineStep[] | null;
  metadata?: Record<string, unknown> | null;
};

export function MessengerStoreOrderSummaryCard({ content, timeline, metadata }: Props) {
  const vm = useMessengerRoomPhase2View();
  const roomMeta = vm.snapshot.room.contextMeta;
  const storeOrderId =
    roomMeta?.kind === "delivery" && typeof roomMeta.storeOrderId === "string"
      ? roomMeta.storeOrderId.trim()
      : "";
  const storeId =
    roomMeta?.kind === "delivery" && typeof roomMeta.storeId === "string"
      ? roomMeta.storeId.trim()
      : "";
  const needsLiveOrderCard = Boolean(storeOrderId && !metadata?.order);
  const deliveryRoom = useStoreOrderDeliveryRoomOptional();
  const fallbackSnapshot = useStoreOrderRoomSnapshot({
    storeOrderId,
    storeId,
    isOwner: Boolean(storeId),
    enabled: needsLiveOrderCard && !deliveryRoom,
  });
  const snapshot = deliveryRoom?.snapshot ?? fallbackSnapshot.snapshot;
  const structured = viewFromMetadata(metadata, timeline) ?? snapshot?.orderCard ?? null;
  if (structured) {
    return (
      <div className="w-full max-w-[min(100%,21rem)]">
        <StoreOrderReceiptCard view={structured} viewer="system" compact />
      </div>
    );
  }
  const lines = content.split("\n").filter((l) => l.trim());
  const header = lines[0] ?? "📋 주문 요약";
  const bodyLines = lines.slice(1);

  return (
    <div className="delivery-ui w-full max-w-[min(100%,21rem)] overflow-hidden rounded-[var(--delivery-radius)] border border-[color:var(--delivery-border)] bg-[color:var(--delivery-bg-card)] text-left">
      <div className="border-b border-[color:var(--delivery-border)] bg-[color:var(--delivery-primary-soft)] px-4 py-3">
        <p className="text-[12px] font-bold leading-[var(--delivery-lh-caption)] text-[color:var(--delivery-dark)]">{header}</p>
      </div>
      <div className="space-y-1 px-4 py-3 text-[12px] font-medium leading-[var(--delivery-lh-caption)] text-[color:var(--delivery-text-main)]">
        {bodyLines.map((line, i) => (
          <p key={i} className="[overflow-wrap:anywhere] [word-break:break-word]">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function viewFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
  timeline: StoreOrderSummaryTimelineStep[] | null | undefined
): StoreOrderChatCardView | null {
  const order = metadata?.order;
  if (!order || typeof order !== "object") return null;
  const items = Array.isArray(metadata?.items) ? metadata.items : [];
  const view = buildStoreOrderChatCardView({
    order: order as Record<string, unknown>,
    items: items.filter((it): it is Record<string, unknown> => it != null && typeof it === "object"),
  });
  return timeline?.length ? { ...view, timeline } : view;
}
