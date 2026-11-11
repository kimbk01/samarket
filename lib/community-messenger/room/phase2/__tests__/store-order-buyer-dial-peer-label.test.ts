import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveStoreOrderBuyerDialPeerLabel } from "@/lib/community-messenger/room/phase2/store-order-buyer-dial-peer-label";
import type { CommunityMessengerRoomSnapshot } from "@/lib/community-messenger/types";

/** F3 (2026-11-09 감사) — 매장 주문 구매자 발신 이름 = 매장명(없으면 「매장」), 그 외 null. */

function snap(over: Record<string, unknown>, myRole: "owner" | "member" = "member") {
  return {
    viewerUserId: "buyer-1",
    myRole,
    room: {
      id: "r1",
      roomType: "direct",
      title: "사장님개인닉",
      ...over,
    },
  } as unknown as Pick<CommunityMessengerRoomSnapshot, "room" | "viewerUserId" | "myRole">;
}

describe("resolveStoreOrderBuyerDialPeerLabel", () => {
  it("일반 1:1 방 → null (호출처 기존 이름)", () => {
    expect(resolveStoreOrderBuyerDialPeerLabel(snap({ chatDomain: "general_direct" }))).toBeNull();
    expect(resolveStoreOrderBuyerDialPeerLabel(null)).toBeNull();
  });

  it("매장 주문방 구매자 → 매장명 (사장님 개인 닉네임 room.title 금지)", () => {
    const room = {
      chatDomain: "store_order",
      messengerDirectKey: "store_order:ord-1",
      contextMeta: { v: 1, kind: "delivery", storeOrderId: "ord-1", storeDisplayName: "동네 김밥" },
    };
    expect(resolveStoreOrderBuyerDialPeerLabel(snap(room))).toBe("동네 김밥");
  });

  it("매장명이 없으면 「매장」, 사장님(owner)은 null(기존 방 제목 = 구매자 닉네임)", () => {
    const room = { chatDomain: "store_order", messengerDirectKey: "store_order:ord-1" };
    expect(resolveStoreOrderBuyerDialPeerLabel(snap(room))).toBe("매장");
    expect(resolveStoreOrderBuyerDialPeerLabel(snap(room, "owner"))).toBeNull();
  });

  /**
   * 통화 버튼 통합 2판 (Owner 2026-11-12): 방 안 발신 진입 = 헤더 📞 선택 시트 · 통화 기록 말풍선.
   * ⋮ 메뉴·방 안 프로필 시트의 통화(이전 진입점)는 없앴다.
   */
  it("두 진입점이 같은 값을 표시·발신 모두에 쓴다 (소스 계약)", () => {
    const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
    const base = "components/community-messenger/room/phase2/";
    const timeline = read(`${base}CommunityMessengerRoomPhase2MessageTimeline.tsx`);
    expect(timeline).toContain("peerLabel={stubRedialPeerLabel}");
    expect(timeline).toContain("vm.startManagedDirectCall(kind, stubRedialPeerLabel)");
    expect(timeline).toContain("vm.storeOrderBuyerDialPeerLabel ??");
    const header = read(`${base}CommunityMessengerRoomPhase2Header.tsx`);
    expect(header).toContain("peerLabel={voiceConfirmPeerLabel}");
    expect(header).toContain("vm.startManagedDirectCall(kind, voiceConfirmPeerLabel)");
    expect(header).toContain("resolveStoreOrderBuyerDialPeerLabel(vm.snapshot)");
    const dot = read(`${base}CommunityMessengerRoomPhase2OneToOneDotMenu.tsx`);
    expect(dot).not.toContain("startManagedDirectCall");
    const sheet = read(`${base}CommunityMessengerRoomFriendProfileSheetHost.tsx`);
    expect(sheet).not.toContain("startManagedDirectCall");
    const controller = read("lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts");
    expect(controller).toContain(
      "dialPeerLabel?.trim() || resolveStoreOrderBuyerDialPeerLabel(snapshot) || snapshot?.room.title?.trim()",
    );
  });
});
