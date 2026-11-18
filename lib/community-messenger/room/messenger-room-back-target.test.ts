import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  resolveMessengerRoomBackTarget,
  resolveOwnerOrderChatsBackHref,
  runMessengerRoomBackTarget,
  type MessengerRoomListKind,
} from "@/lib/community-messenger/room/messenger-room-back-target";
import type { MessengerRoomEntryOrigin } from "@/lib/community-messenger/room/messenger-room-entry-origin-store";

/** P5 — 메신저 방 뒤로 목적지 단일 정의 (부록 P5 §B1 규칙 1·2 전 분기) */
function params(q: Record<string, string>) {
  return { get: (k: string) => q[k] ?? null };
}

function target(args: {
  entry: MessengerRoomEntryOrigin;
  roomType?: string | null;
  listKind?: MessengerRoomListKind | null;
  q?: Record<string, string>;
}) {
  return resolveMessengerRoomBackTarget({
    entry: args.entry,
    roomType: args.roomType ?? "direct",
    listKind: args.listKind ?? "general",
    searchParams: params(args.q ?? {}),
  });
}

describe("규칙 1 — 앱 안 진입은 직전 화면(back 1회)", () => {
  it.each([
    ["direct", "general"],
    ["open_group", "general"],
    ["direct", "trade"],
    ["direct", "delivery"],
  ] as const)("roomType=%s listKind=%s", (roomType, listKind) => {
    expect(target({ entry: "in_app", roomType, listKind, q: { cm_return: "/stores" } })).toEqual({
      kind: "history_back",
    });
  });
});

describe("규칙 2 — 알림·첫 기록 진입은 방 종류 목록 replace", () => {
  it.each(["push", "first_entry"] as const)("%s: 1:1·그룹 → 대화 목록", (entry) => {
    expect(target({ entry })).toEqual({ kind: "replace", href: "/community-messenger?section=chats" });
    expect(target({ entry, roomType: "private_group" })).toEqual({
      kind: "replace",
      href: "/community-messenger?section=chats",
    });
  });

  it("거래 방 → 거래 채팅 목록", () => {
    expect(target({ entry: "push", listKind: "trade" })).toEqual({
      kind: "replace",
      href: "/community-messenger/trade-chats",
    });
  });

  it("주문 방(구매자) → 주문 채팅 목록", () => {
    expect(target({ entry: "push", listKind: "delivery" })).toEqual({
      kind: "replace",
      href: "/community-messenger/delivery-chats?from=delivery",
    });
  });

  it("오픈 그룹 → 모임 허브", () => {
    expect(target({ entry: "push", roomType: "open_group" })).toEqual({
      kind: "replace",
      href: "/community-messenger?section=open_chat",
    });
  });

  it("cm_return 이 가장 먼저(오픈 그룹보다 앞)", () => {
    expect(target({ entry: "first_entry", roomType: "open_group", q: { cm_return: "/mypage/store-orders" } })).toEqual({
      kind: "replace",
      href: "/mypage/store-orders",
    });
  });

  it("외부 주소 cm_return 은 무시", () => {
    expect(target({ entry: "push", q: { cm_return: "//evil.example" } })).toEqual({
      kind: "replace",
      href: "/community-messenger?section=chats",
    });
  });

  it("cm_list 가 있으면 방 종류 추론보다 우선", () => {
    expect(target({ entry: "push", listKind: "general", q: { cm_list: "trade" } })).toEqual({
      kind: "replace",
      href: "/community-messenger/trade-chats",
    });
    expect(target({ entry: "push", listKind: "trade", q: { cm_list: "delivery" } })).toEqual({
      kind: "replace",
      href: "/community-messenger/delivery-chats?from=delivery",
    });
  });

  it("방 종류 모름(스냅샷 없음) → 대화 목록, from 보존", () => {
    expect(
      resolveMessengerRoomBackTarget({
        entry: "push",
        roomType: null,
        listKind: null,
        searchParams: params({ from: "trade" }),
      })
    ).toEqual({ kind: "replace", href: "/community-messenger?section=chats&from=trade" });
  });
});

describe("주문 방 — 매장 사장님은 사장님 주문 채팅 목록 (Owner 2026-11-18 「권장안대로 반영」)", () => {
  const deliveryRoom = {
    contextMeta: { v: 1 as const, kind: "delivery" as const, storeOrderId: "o1", storeId: "s1" },
    messengerDirectKey: "store_order:o1",
    summary: "",
  };

  it("사장님(myRole owner) → /stores/owner/order-chats?storeId=", () => {
    expect(resolveOwnerOrderChatsBackHref(deliveryRoom, "owner")).toBe("/stores/owner/order-chats?storeId=s1");
  });
  it("storeId 없음 → storeId 없는 목록(서버가 대표 매장 해석)", () => {
    expect(
      resolveOwnerOrderChatsBackHref({ ...deliveryRoom, contextMeta: { v: 1, kind: "delivery", storeOrderId: "o1" } }, "owner")
    ).toBe("/stores/owner/order-chats");
  });
  it("구매자·주문 방 아님 → null(구매자 = delivery-chats)", () => {
    expect(resolveOwnerOrderChatsBackHref(deliveryRoom, "member")).toBeNull();
    expect(resolveOwnerOrderChatsBackHref({ contextMeta: null, messengerDirectKey: "dk", summary: "" }, "owner")).toBeNull();
  });
  it("알림 진입 사장님 → 사장님 목록 replace, cm_list=delivery 보다 우선 / 앱 안 진입은 back", () => {
    const ownerHref = resolveOwnerOrderChatsBackHref(deliveryRoom, "owner");
    expect(
      resolveMessengerRoomBackTarget({
        entry: "push",
        roomType: "direct",
        listKind: "delivery",
        searchParams: params({ cm_list: "delivery" }),
        ownerOrderChatsHref: ownerHref,
      })
    ).toEqual({ kind: "replace", href: "/stores/owner/order-chats?storeId=s1" });
    expect(
      resolveMessengerRoomBackTarget({
        entry: "in_app",
        roomType: "direct",
        listKind: "delivery",
        searchParams: params({}),
        ownerOrderChatsHref: ownerHref,
      })
    ).toEqual({ kind: "history_back" });
  });
});

describe("실행 — 이동 1회", () => {
  it("history_back = router.back 만", () => {
    const router = { back: vi.fn(), replace: vi.fn() };
    runMessengerRoomBackTarget(router, { kind: "history_back" });
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });
  it("replace = router.replace 만(scroll false)", () => {
    const router = { back: vi.fn(), replace: vi.fn() };
    runMessengerRoomBackTarget(router, { kind: "replace", href: "/community-messenger/trade-chats" });
    expect(router.replace).toHaveBeenCalledWith("/community-messenger/trade-chats", { scroll: false });
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe("구조 계약", () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const shell = strip(readFileSync("components/community-messenger/room/MessengerRoomSwipeBackShell.tsx", "utf8"));
  const header = strip(
    readFileSync("components/community-messenger/room/phase2/CommunityMessengerRoomPhase2Header.tsx", "utf8")
  );
  const mod = strip(readFileSync("lib/community-messenger/room/messenger-room-back-target.ts", "utf8"));

  it("방 뒤로에 280ms 폴백(runHistoryBackWithFallback)·타이머 없음", () => {
    expect(mod).not.toMatch(/runHistoryBackWithFallback|setTimeout|history-back-fallback/);
    expect(shell).not.toMatch(/runHistoryBackWithFallback/);
    expect(header).not.toMatch(/runHistoryBackWithFallback/);
  });

  it("오픈 그룹 replace 특례는 셸·머리글에 없음(목적지 함수 한 곳)", () => {
    expect(shell).not.toMatch(/messengerMeetingsHub/);
    expect(header).not.toMatch(/messengerMeetingsHub/);
  });

  it("셸은 목적지가 replace 일 때만 페이지 뒤로 주인 등록", () => {
    expect(shell).toMatch(/if \(target\?\.kind !== "replace"\) \{[\s\S]*?return;\s*\}[\s\S]*setPageBackOwner\(/);
  });
});
