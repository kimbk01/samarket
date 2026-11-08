/**
 * T1 (Owner 「T1 구현 승인」 2026-11-09) — 거래 상품을 보기만 해서는 채팅방을 만들지 않는다.
 * 방 생성 선행(resolve POST)은 「채팅하기」를 누르기 시작(pointerdown)·탭할 때만.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prepareTradeChatRoom = vi.fn();
vi.mock("@/lib/chat/createOrGetChatRoom", () => ({
  prepareTradeChatRoom: (...args: unknown[]) => prepareTradeChatRoom(...args),
}));

import { prefetchTradeChatEntry } from "@/lib/chats/trade-chat-entry-navigation";

function router() {
  return { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() };
}

describe("prefetchTradeChatEntry — 방 생성 선행 여부", () => {
  beforeEach(() => prepareTradeChatRoom.mockReset());

  it("prepareIfCreate=false: 화면 미리받기만, 방 생성 POST 없음", () => {
    const r = router();
    prefetchTradeChatEntry(r, { productId: "p1", prepareIfCreate: false });
    expect(prepareTradeChatRoom).not.toHaveBeenCalled();
    expect(r.prefetch).toHaveBeenCalled();
  });

  it("prepareIfCreate 생략: 방 생성 POST 없음", () => {
    prefetchTradeChatEntry(router(), { productId: "p1" });
    expect(prepareTradeChatRoom).not.toHaveBeenCalled();
  });

  it("prepareIfCreate=true (누르기 시작): 방 생성 선행 1회", () => {
    prefetchTradeChatEntry(router(), { productId: "p1", prepareIfCreate: true });
    expect(prepareTradeChatRoom).toHaveBeenCalledTimes(1);
    expect(prepareTradeChatRoom).toHaveBeenCalledWith("p1");
  });

  it("기존 방이 있으면 prepareIfCreate 와 무관하게 생성 POST 없음(읽기 미리받기만)", () => {
    prefetchTradeChatEntry(router(), { productId: "p1", existingRoomId: "room-1", prepareIfCreate: true });
    expect(prepareTradeChatRoom).not.toHaveBeenCalled();
  });
});

/** 화면 코드 계약 — 보기·마우스 올림은 false, 누르기 시작만 true */
describe("T1 화면 계약 (소스)", () => {
  const root = process.cwd();
  const detail = readFileSync(join(root, "components/post/PostDetailView.tsx"), "utf8");
  const fav = readFileSync(join(root, "components/favorites/FavoritePostTradeActions.tsx"), "utf8");

  function block(src: string, startMarker: string, endMarker: string): string {
    const s = src.indexOf(startMarker);
    expect(s).toBeGreaterThanOrEqual(0);
    const e = src.indexOf(endMarker, s + startMarker.length);
    expect(e).toBeGreaterThan(s);
    return src.slice(s, e);
  }

  it("상품 상세 진입(마운트): 방 생성 선행 없음", () => {
    const mount = block(detail, "상세 진입 직후 채팅 화면 미리받기만", "}, [");
    expect(mount).toContain("prepareIfCreate: false");
    expect(mount).not.toContain("prepareIfCreate: true");
    expect(mount).not.toContain("prepareIfCreate: !existingTradeRoomId");
  });

  it("상품 상세 마우스 올림: 방 생성 선행 없음", () => {
    const hover = block(detail, "const scheduleTradeChatPrepare = useCallback", "}, [");
    expect(hover).toContain("prepareIfCreate: false");
    expect(hover).not.toContain("prepareIfCreate: true");
  });

  it("상품 상세 누르기 시작: 방 생성 선행 유지(차단 상태 검사 포함)", () => {
    const down = block(detail, "const onTradeChatCtaPointerDown = useCallback", "}, [");
    expect(down).toContain("prepareIfCreate: true");
    expect(down).toContain("!chatBlockedByListingState");
    expect(down).toContain("!chatBlockedByOtherReservation");
  });

  it("찜 마우스 올림: 방 생성 선행 없음 / 누르기 시작: 유지", () => {
    const hover = block(fav, "const scheduleTradeChatPrepare = useCallback", "}, [");
    expect(hover).toContain("prepareIfCreate: false");
    expect(hover).not.toContain("prepareIfCreate: true");
    const down = block(fav, "const onTradeChatPointerDown = useCallback", "}, [");
    expect(down).toContain("prepareIfCreate: true");
  });

  it("보기·마우스 올림 외에 방 생성 선행(prepareIfCreate: true)은 누르기 시작 2곳뿐", () => {
    expect(detail.match(/prepareIfCreate: true/g)?.length).toBe(1);
    expect(fav.match(/prepareIfCreate: true/g)?.length).toBe(1);
  });
});
