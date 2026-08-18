import { describe, expect, it } from "vitest";
import { translate } from "@/lib/i18n/messages";
import type { MessageKey } from "@/lib/i18n/messages";
import { buildDeliveryChatListRowModel } from "@/lib/community-messenger/delivery-chat-list/view-model";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const t = (key: MessageKey, vars?: Record<string, string | number>) => translate("ko", key, vars);

describe("buildDeliveryChatListRowModel", () => {
  it("delivery meta 로 매장·상태 badge", () => {
    const room = {
      id: "r1",
      summary: "",
      contextMeta: {
        v: 1 as const,
        kind: "delivery" as const,
        storeDisplayName: "맛집",
        storeId: "store-1",
        orderStatus: "preparing",
        thumbnailUrl: "https://cdn.example/logo.jpg",
      },
    } as unknown as CommunityMessengerRoomSummary;
    const m = buildDeliveryChatListRowModel(room, t);
    expect(m?.storeId).toBe("store-1");
    expect(m?.storeName).toBe("맛집");
    expect(m?.statusBadgeClassName).toContain("bg-");
    expect(m?.storeThumbnailUrl).toContain("logo.jpg");
  });

  it("placeholder storeDisplayName stays store surface, not 새 대화", () => {
    const room = {
      id: "r-placeholder",
      chatDomain: "store_order",
      summary: "",
      contextMeta: {
        v: 1 as const,
        kind: "delivery" as const,
        storeDisplayName: "새 대화",
        storeId: "store-1",
      },
    } as unknown as CommunityMessengerRoomSummary;
    expect(buildDeliveryChatListRowModel(room, t)?.storeName).toBe("매장");
  });

  it("confirmed store_order without delivery meta still returns store surface", () => {
    const room = {
      id: "r-confirmed",
      chatDomain: "store_order",
      title: "새 대화",
      summary: "",
    } as unknown as CommunityMessengerRoomSummary;
    expect(buildDeliveryChatListRowModel(room, t)?.storeName).toBe("매장");
  });

  it("완료 주문 stepLabel 유지", () => {
    const completed = {
      id: "r-done",
      summary: "",
      contextMeta: {
        v: 1 as const,
        kind: "delivery" as const,
        storeDisplayName: "맛집",
        storeId: "store-1",
        stepLabel: "completed",
      },
    } as unknown as CommunityMessengerRoomSummary;
    expect(buildDeliveryChatListRowModel(completed, t)?.orderStatusLabel).toBeTruthy();
  });
});
