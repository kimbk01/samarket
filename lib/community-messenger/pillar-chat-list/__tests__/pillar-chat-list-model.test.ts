/**
 * 채팅 시안 4판 「9. 거래 채팅 목록」·「10. 주문 채팅 목록」 순수 규칙 — 주문 탭 나누기 · 모두 읽음 · 주문 상세 주소 · 상태 칩 언어/색.
 */
import { describe, expect, it, vi } from "vitest";
import { translate, type MessageKey } from "@/lib/i18n/messages";
import { setRuntimeAppLanguage } from "@/lib/i18n/runtime-app-language";
import {
  customerStoreOrderDetailHref,
  filterStoreOrderChatListByTab,
  runPillarMarkAllRead,
  storeOrderChatListTabOfStatus,
  storeOrderChatStatusChipTone,
  tradeChatStatusChipTone,
} from "@/lib/community-messenger/pillar-chat-list/pillar-chat-list-model";
import { buildDeliveryChatListRowModel } from "@/lib/community-messenger/delivery-chat-list/view-model";
import { buildTradeChatListRowModel } from "@/lib/community-messenger/trade-chat-list/view-model";
import type { CommunityMessengerRoomSummary } from "@/lib/community-messenger/types";

const ko = (key: MessageKey, vars?: Record<string, string | number>) => translate("ko", key, vars);

describe("주문 채팅 탭 — 전체 · 진행 중 · 지난 주문", () => {
  const rows = [
    { id: "a", status: "preparing" },
    { id: "b", status: "completed" },
    { id: "c", status: "cancelled" },
    { id: "d", status: "refunded" },
    { id: "e", status: "" },
    { id: "f", status: undefined },
    { id: "g", status: "cancel_requested" },
    { id: "h", status: "something_new" },
  ];
  const statusOf = (r: (typeof rows)[number]) => r.status;

  it("지난 주문 = 완료·취소·환불만", () => {
    expect(filterStoreOrderChatListByTab(rows, "past", statusOf).map((r) => r.id)).toEqual(["b", "c", "d"]);
  });

  it("진행 중 = 그 밖 전부 — 상태를 모르는 행(빈 값·없음·처음 보는 값)도 진행 중으로 센다", () => {
    expect(filterStoreOrderChatListByTab(rows, "live", statusOf).map((r) => r.id)).toEqual(["a", "e", "f", "g", "h"]);
    expect(storeOrderChatListTabOfStatus(null)).toBe("live");
    expect(storeOrderChatListTabOfStatus("  completed ")).toBe("past");
  });

  it("전체 = 순서 그대로 전부", () => {
    expect(filterStoreOrderChatListByTab(rows, "all", statusOf).map((r) => r.id)).toEqual(rows.map((r) => r.id));
  });
});

describe("모두 읽음 (거래·주문 공용)", () => {
  it("안 읽은 방만, 동시 4개씩 요청하고 실패 수를 센다", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const calls: string[] = [];
    const markOne = vi.fn(async (roomId: string, preUnread: number) => {
      calls.push(`${roomId}:${preUnread}`);
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return roomId !== "r3";
    });
    const rows = [
      { roomId: "r1", unreadCount: 2 },
      { roomId: "r2", unreadCount: 0 },
      { roomId: "r3", unreadCount: 1 },
      { roomId: "r4", unreadCount: 5 },
      { roomId: "r5", unreadCount: 1 },
      { roomId: "r6", unreadCount: 3 },
      { roomId: " ", unreadCount: 9 },
    ];
    const result = await runPillarMarkAllRead(rows, markOne);
    expect(calls).toEqual(["r1:2", "r3:1", "r4:5", "r5:1", "r6:3"]);
    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(result).toEqual({ attempted: 5, failed: 1 });
  });

  it("안 읽은 방이 없으면 요청하지 않는다", async () => {
    const markOne = vi.fn(async () => true);
    expect(await runPillarMarkAllRead([{ roomId: "r1", unreadCount: 0 }], markOne)).toEqual({ attempted: 0, failed: 0 });
    expect(markOne).not.toHaveBeenCalled();
  });
});

describe("주문 내역 보기 주소", () => {
  it("주문 알림 「주문 내역에서 보기」와 같은 고객 주문 상세", () => {
    expect(customerStoreOrderDetailHref("ord-1")).toBe("/mypage/store-orders/ord-1");
    expect(customerStoreOrderDetailHref(" a/b ")).toBe("/mypage/store-orders/a%2Fb");
    expect(customerStoreOrderDetailHref("")).toBeNull();
    expect(customerStoreOrderDetailHref(undefined)).toBeNull();
  });
});

describe("상태 칩 색", () => {
  it("주문: 취소·환불·요청 빨강 · 완료 회색 · 진행 초록", () => {
    expect(storeOrderChatStatusChipTone("cancelled")).toBe("danger");
    expect(storeOrderChatStatusChipTone("refunded")).toBe("danger");
    expect(storeOrderChatStatusChipTone("completed")).toBe("muted");
    expect(storeOrderChatStatusChipTone("preparing")).toBe("ok");
    expect(storeOrderChatStatusChipTone("pending")).toBe("ok");
  });

  it("거래: 판매중·문의중 초록 · 예약중 노랑 · 판매완료 회색", () => {
    expect(tradeChatStatusChipTone("inquiry")).toBe("ok");
    expect(tradeChatStatusChipTone("negotiating")).toBe("ok");
    expect(tradeChatStatusChipTone("reserved")).toBe("warn");
    expect(tradeChatStatusChipTone("completed")).toBe("muted");
  });
});

describe("주문 상태 칩 글자 = 화면 언어", () => {
  const room = (meta: Record<string, unknown>) =>
    ({
      id: "r1",
      summary: "",
      contextMeta: { v: 1, kind: "delivery", storeDisplayName: "맛집", storeId: "s1", ...meta },
    }) as unknown as CommunityMessengerRoomSummary;

  it("런타임 언어가 영어로 남아 있어도 넘긴 화면 언어(ko)로 — 「Cancelled」 가 한국어 화면에 나오던 경로", () => {
    setRuntimeAppLanguage("en");
    try {
      const m = buildDeliveryChatListRowModel(room({ orderStatus: "cancelled" }), ko, "ko");
      expect(m?.statusChip).toEqual({ label: "주문 취소", tone: "danger" });
      expect(m?.orderStatus).toBe("cancelled");
      const en = buildDeliveryChatListRowModel(room({ orderStatus: "cancelled" }), ko, "en");
      expect(en?.statusChip?.label).toBe("Cancelled");
    } finally {
      setRuntimeAppLanguage("ko");
    }
  });

  it("완료 = 주문 방식에 맞는 이름(배달완료·픽업완료) 회색", () => {
    expect(buildDeliveryChatListRowModel(room({ orderStatus: "completed" }), ko, "ko")?.statusChip).toEqual({
      label: "배달완료",
      tone: "muted",
    });
    expect(
      buildDeliveryChatListRowModel(room({ orderStatus: "completed", fulfillmentType: "pickup" }), ko, "ko")?.statusChip
    ).toEqual({ label: "픽업완료", tone: "muted" });
  });

  it("상태 원값이 아니라 서버가 번역한 글자뿐이면(옛 캐시) 칩을 그리지 않는다 — 다른 언어 글자를 내보이지 않음", () => {
    const m = buildDeliveryChatListRowModel(room({ stepLabel: "Cancelled" }), ko, "ko");
    expect(m?.statusChip).toBeNull();
    expect(m?.orderStatus).toBeNull();
  });
});

describe("거래 상태 칩 (1줄)", () => {
  const tradeRoom = (meta: Record<string, unknown>) =>
    ({
      id: "t1",
      title: "q테스트1",
      contextMeta: { v: 1, kind: "trade", postId: "p1", headline: "팝니다", sellerId: "seller-1", ...meta },
    }) as unknown as CommunityMessengerRoomSummary;

  it("예약중 = 노랑 · 판매중 = 초록", () => {
    expect(buildTradeChatListRowModel(tradeRoom({ itemStateLabel: "예약중" }), ko, "buyer-1").statusChip).toEqual({
      label: "예약중",
      tone: "warn",
    });
    expect(buildTradeChatListRowModel(tradeRoom({}), ko, "buyer-1").statusChip).toEqual({ label: "판매중", tone: "ok" });
  });

  it("볼 수 없는 글: 구매자는 판매 단계를 모르면 칩 없음(제목이 이미 「볼 수 없는 글이에요」), 판매자 본인은 회색 「볼 수 없는 글」", () => {
    const hidden = tradeRoom({ itemStateLabel: "숨김" });
    expect(buildTradeChatListRowModel(hidden, ko, "buyer-1").statusChip).toBeNull();
    expect(buildTradeChatListRowModel(hidden, ko, "seller-1").statusChip).toEqual({
      label: "볼 수 없는 글",
      tone: "muted",
    });
  });
});
