/**
 * 거래방 상품 상세 슬라이드 「채팅 이어가기」 → 「이동 중…」 정지 (2026-11-16)
 * 대상 방이 슬라이드를 띄운 방과 같으면 주소 이동 없이 슬라이드만 닫는다.
 * @see docs/audit/trade-detail-slide-continue-chat-stuck-plan-2026-11-16.md
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { isTradeChatTargetSameAsSlideHostRoom } from "@/lib/chats/trade-chat-entry-navigation";

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("isTradeChatTargetSameAsSlideHostRoom", () => {
  it("같은 방이면 true", () => {
    expect(
      isTradeChatTargetSameAsSlideHostRoom({ hostMessengerRoomId: "room-a", targetMessengerRoomId: " room-a " })
    ).toBe(true);
  });
  it("다른 방이면 false", () => {
    expect(
      isTradeChatTargetSameAsSlideHostRoom({ hostMessengerRoomId: "room-a", targetMessengerRoomId: "room-b" })
    ).toBe(false);
  });
  it("한쪽이 비면 false", () => {
    expect(isTradeChatTargetSameAsSlideHostRoom({ hostMessengerRoomId: "", targetMessengerRoomId: "" })).toBe(false);
    expect(isTradeChatTargetSameAsSlideHostRoom({ hostMessengerRoomId: null, targetMessengerRoomId: "room-a" })).toBe(
      false
    );
    expect(isTradeChatTargetSameAsSlideHostRoom({ hostMessengerRoomId: "room-a", targetMessengerRoomId: null })).toBe(
      false
    );
  });
});

describe("슬라이드 호스트 계약", () => {
  it("컨텍스트가 슬라이드를 띄운 방 id 를 가진다", () => {
    const ctx = read("components/community-messenger/room/phase2/TradePostDetailSlideHostContext.tsx");
    expect(ctx).toMatch(/hostMessengerRoomId:\s*string/);
    const body = read("components/community-messenger/room/CommunityMessengerRoomClientPhase2Body.tsx");
    expect(body).toMatch(/hostMessengerRoomId=\{roomIdStable\}/);
  });

  it("상세 handleChat: 같은 방이면 closeSlide 만, 이동은 다른 방일 때만", () => {
    const src = read("components/post/PostDetailView.tsx");
    const start = src.indexOf("const handleChat = useCallback");
    const end = src.indexOf("const runMarkOwnSold");
    expect(start).toBeGreaterThan(0);
    const handleChat = src.slice(start, end);
    const sameIdx = handleChat.indexOf("isTradeChatTargetSameAsSlideHostRoom(");
    const closeIdx = handleChat.indexOf("tradePostDetailSlideHost.closeSlide()");
    const navIdx = handleChat.indexOf("openExistingTradeChat(router");
    expect(sameIdx).toBeGreaterThan(0);
    expect(closeIdx).toBeGreaterThan(sameIdx);
    expect(navIdx).toBeGreaterThan(closeIdx);
    /** 같은 방 분기에서는 navigated 를 올리지 않아야 finally 가 「이동 중…」을 푼다 */
    const sameBranch = handleChat.slice(sameIdx, navIdx);
    expect(sameBranch).not.toMatch(/navigated\s*=\s*true/);
  });
});
