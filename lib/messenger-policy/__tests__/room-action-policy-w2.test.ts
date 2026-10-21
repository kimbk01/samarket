import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  getSwipeActions,
  getSwipeLeaveConfirmI18nKey,
  resolveMessengerRoomLeaveAllowed,
} from "@/lib/messenger-policy/chat-room-swipe-actions";
import { isStoreOrderChatLeaveAllowedStatus } from "@/lib/stores/store-order-process-model";

const kinds = (a: ReturnType<typeof getSwipeActions>) => a.map((x) => x.kind);

describe("W2 채팅 종류 × 동작 (3부 L-2)", () => {
  it("주문 채팅: 진행 중이면 나가기 없음, 완료·취소·환불 완료만 허용(취소/환불 요청 중 제외)", () => {
    for (const st of ["pending", "accepted", "preparing", "delivering", "cancel_requested", "refund_requested"]) {
      expect(isStoreOrderChatLeaveAllowedStatus(st)).toBe(false);
    }
    for (const st of ["completed", "cancelled", "refunded"]) expect(isStoreOrderChatLeaveAllowedStatus(st)).toBe(true);
    const base = { roomType: "direct", ownerUserId: null, viewerUserId: "u" };
    expect(resolveMessengerRoomLeaveAllowed({ ...base, isStoreOrder: true, storeOrderClosed: false })).toBe(false);
    expect(resolveMessengerRoomLeaveAllowed({ ...base, isStoreOrder: true, storeOrderClosed: true })).toBe(true);
  });
  it("오픈그룹 방장은 나가기 없음(L-6), 회원·1:1·거래는 유지", () => {
    const g = { roomType: "open_group", isStoreOrder: false, storeOrderClosed: false };
    expect(resolveMessengerRoomLeaveAllowed({ ...g, ownerUserId: "u", viewerUserId: "u" })).toBe(false);
    expect(resolveMessengerRoomLeaveAllowed({ ...g, ownerUserId: "o", viewerUserId: "u" })).toBe(true);
    expect(resolveMessengerRoomLeaveAllowed({ roomType: "direct", isStoreOrder: false, storeOrderClosed: false, ownerUserId: null, viewerUserId: "u" })).toBe(true);
  });
  it("leaveAllowed=false 면 스와이프에서 나가기 제거, 운영 보관 방은 복원 제거(L-9)", () => {
    expect(kinds(getSwipeActions({ policyType: "direct", listContext: "default", leaveAllowed: false }))).toEqual(["archive", "read"]);
    expect(kinds(getSwipeActions({ policyType: "group", listContext: "open_chat", leaveAllowed: false }))).toEqual(["read"]);
    expect(kinds(getSwipeActions({ policyType: "direct", listContext: "archive", restoreAllowed: false }))).toEqual(["read", "leave"]);
    expect(kinds(getSwipeActions({ policyType: "direct", listContext: "default" }))).toEqual(["archive", "read", "leave"]);
  });
  it("주문 채팅 확인 문구는 「내 목록에서만 삭제」가 아닌 주문 전용(L-7)", () => {
    expect(getSwipeLeaveConfirmI18nKey("direct", { isStoreOrder: true })).toBe("cm_ui_leave_confirm_store_order");
    expect(getSwipeLeaveConfirmI18nKey("direct")).toBe("cm_ui_leave_confirm_direct");
  });
  it("서버 나가기도 같은 규칙으로 최종 거부(사장님 항상·진행 중 주문)", () => {
    const src = readFileSync(path.join(process.cwd(), "lib/messenger-policy/leave-chat-room-orchestration.server.ts"), "utf8");
    expect(src).toContain('"store_owner_cannot_leave"');
    expect(src).toContain('"store_order_in_progress"');
    expect(src).toContain("isStoreOrderChatLeaveAllowedStatus(orderStatus)");
  });
});
