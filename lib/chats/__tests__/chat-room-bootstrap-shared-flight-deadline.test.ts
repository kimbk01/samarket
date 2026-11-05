// @vitest-environment jsdom
/**
 * 거래 채팅방 bootstrap 공유 요청 — 헤더·본문 멈춤에도 마감 안에 기존 `network` 실패 결과로 끝나고(→ ChatRoomScreen 오류·재시도),
 * 재진입은 새 요청. 정상 응답은 동시 호출 1회 요청·방/메시지 그대로.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectConcurrentCallsShareOneRequest,
  expectStallSettlesAndRetryIsNewRequest,
  installStallFetch,
  stallState,
} from "@/lib/http/__tests__/shared-flight-stall-harness";

const room = { id: "room-1", buyerId: "b1", sellerId: "s1", source: "chat_room" };

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  installStallFetch({ room, messages: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function load() {
  const m = await import("@/lib/chats/fetch-chat-room-bootstrap-api");
  return () => m.fetchChatRoomBootstrapApi("room-1", "chat_room", { bypassPeek: true, phase: "lite" });
}

describe("거래 채팅방 bootstrap 공유 요청 마감", () => {
  it.each(["header_stall", "body_stall"] as const)("%s → 마감 안 종료 + 재진입 새 요청", async (kind) => {
    await expectStallSettlesAndRetryIsNewRequest(kind, await load());
  });

  it("마감 초과 → 기존 network 실패 결과", async () => {
    const call = await load();
    stallState.behavior = "body_stall";
    const p = call();
    await vi.advanceTimersByTimeAsync(12_050);
    expect(await p).toEqual({ ok: false, status: 0, code: "network" });
  });

  it("정상 — 동시 호출 1회 요청, 방·메시지 보존", async () => {
    const results = await expectConcurrentCallsShareOneRequest(await load());
    expect(results[0]).toMatchObject({ ok: true, room: { id: "room-1" }, messages: [], cache: "network" });
  });
});
