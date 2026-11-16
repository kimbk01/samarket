/** 분할 화면 왼쪽 목록 유지 — 방 주소에 지금 목록 상태(거래 채팅·채팅 검색)를 이어 붙인다 (2026-11-16 실기 발견). */
import { describe, expect, it } from "vitest";
import { carryMessengerSplitListStateIntoRoomHref } from "@/lib/community-messenger/messenger-split-list-state-carry";
import { resolveMessengerSplitListScope } from "@/lib/community-messenger/messenger-split-list-scope";

const ROOM = "/community-messenger/rooms/33a8f97f";

describe("carryMessengerSplitListStateIntoRoomHref", () => {
  it("거래방 위 상품 상세 → 「채팅 이어가기」: 지금 cm_list=trade 를 이어 붙여 왼쪽이 거래 채팅으로 남는다", () => {
    const out = carryMessengerSplitListStateIntoRoomHref(ROOM, { pathname: ROOM, search: "?cm_list=trade" });
    expect(out).toBe(`${ROOM}?cm_list=trade`);
    const u = new URL(out, "https://x");
    expect(resolveMessengerSplitListScope({ pathname: u.pathname, cmList: u.searchParams.get("cm_list") })).toBe("trade");
  });
  it("거래 채팅 목록 화면에서 열면 trade", () => {
    expect(carryMessengerSplitListStateIntoRoomHref(ROOM, { pathname: "/community-messenger/trade-chats", search: "" })).toBe(
      `${ROOM}?cm_list=trade`
    );
  });
  it("채팅 검색 화면(section=search)에서 열면 section=search 유지", () => {
    expect(
      carryMessengerSplitListStateIntoRoomHref(ROOM, { pathname: "/community-messenger", search: "?section=search" })
    ).toBe(`${ROOM}?section=search`);
    expect(
      carryMessengerSplitListStateIntoRoomHref(`${ROOM}?from=community`, {
        pathname: "/community-messenger/rooms/other",
        search: "?section=search",
      })
    ).toBe(`${ROOM}?from=community&section=search`);
  });
  it("방 주소에 이미 cm_list·section 이 있으면 그대로", () => {
    const dest = `${ROOM}?cm_list=delivery`;
    expect(carryMessengerSplitListStateIntoRoomHref(dest, { pathname: ROOM, search: "?cm_list=trade" })).toBe(dest);
  });
  it("대화 목록(inbox)에서 열면 바꾸지 않는다", () => {
    expect(carryMessengerSplitListStateIntoRoomHref(ROOM, { pathname: "/community-messenger", search: "" })).toBe(ROOM);
  });
  it("방 주소가 아니면 바꾸지 않는다", () => {
    expect(
      carryMessengerSplitListStateIntoRoomHref("/community-messenger/trade-chats", { pathname: ROOM, search: "?cm_list=trade" })
    ).toBe("/community-messenger/trade-chats");
  });
  it("메신저 밖(내정보 section=settings 등)의 section 은 가져오지 않는다", () => {
    expect(carryMessengerSplitListStateIntoRoomHref(ROOM, { pathname: "/mypage", search: "?section=search" })).toBe(ROOM);
  });
});
