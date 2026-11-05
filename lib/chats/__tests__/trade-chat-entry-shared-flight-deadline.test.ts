// @vitest-environment jsdom
/**
 * 거래 채팅방 상세·채팅 목록·상품 찜 상태 — 헤더·본문 멈춤에도 마감 안에 끝나고 재진입은 새 요청. 정상 응답은 동시 호출 1회 요청.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectConcurrentCallsShareOneRequest,
  expectStallSettlesAndRetryIsNewRequest,
  installStallFetch,
  stallState,
} from "@/lib/http/__tests__/shared-flight-stall-harness";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  installStallFetch({ id: "r1", buyerId: "b", sellerId: "s", rooms: [], "p-1": true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Call = () => Promise<unknown>;

async function load(): Promise<Record<string, Call>> {
  vi.doMock("@/lib/auth/get-current-user", () => ({ getCurrentUser: () => ({ id: "viewer-1" }) }));
  const detail = await import("@/lib/chats/fetch-chat-room-detail-api");
  const rooms = await import("@/lib/chats/fetch-chat-rooms-by-segment");
  const fav = await import("@/lib/favorites/getFavoriteStatus");
  return {
    room_detail: () => detail.fetchChatRoomDetailApi("r1"),
    rooms_list: () => rooms.fetchChatRoomsBySegment("trade"),
    favorite_status: () => fav.getFavoriteStatus("p-1"),
  };
}

const names = ["room_detail", "rooms_list", "favorite_status"];

describe.each(["header_stall", "body_stall"] as const)("거래 채팅방 상세·채팅 목록·상품 찜 상태 — %s", (kind) => {
  it.each(names)("%s", async (name) => {
    const calls = await load();
    await expectStallSettlesAndRetryIsNewRequest(kind, calls[name]);
  });
});

describe("거래 채팅방 상세·채팅 목록·상품 찜 상태 — 정상 경로 보존", () => {
  it.each(names)("%s: 동시 호출 1회 요청", async (name) => {
    const calls = await load();
    await expectConcurrentCallsShareOneRequest(calls[name]);
  });

  it("멈춤 종료는 각 화면의 기존 오류 결과로 끝난다", async () => {
    const calls = await load();
    stallState.behavior = "body_stall";
    const results = Promise.all([calls.room_detail(), calls.rooms_list(), calls.favorite_status()]);
    await vi.advanceTimersByTimeAsync(12_050);
    expect(await results).toEqual([
      { ok: false, status: 0, code: "network" },
      { ok: false, status: 0, rooms: [] },
      false,
    ]);
  });
});
