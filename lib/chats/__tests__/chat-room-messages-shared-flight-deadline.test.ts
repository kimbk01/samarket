// @vitest-environment jsdom
/**
 * 거래 채팅 메시지(통합·레거시) 공유 요청 — 헤더·본문 멈춤에도 마감 안에 끝나고 재진입은 새 요청.
 * 최신 페이지는 기존 실패 계약(캐시 또는 빈 목록)으로, 과거 페이지는 reject → 화면의 기존 catch 로 끝난다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectConcurrentCallsShareOneRequest,
  expectStallSettlesAndRetryIsNewRequest,
  installStallFetch,
  stallState,
} from "@/lib/http/__tests__/shared-flight-stall-harness";

const row = { id: "m1", room_id: "room-1", sender_id: "u1", message_type: "text", body: "hi", created_at: "2026-01-01T00:00:00.000Z" };
const cursor = { before: "m0", beforeCreatedAt: "2026-01-01T00:00:00.000Z" };

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  installStallFetch({ ok: true, messages: [row], hasMore: false });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function api() {
  return import("@/lib/chats/fetch-chat-room-messages-api");
}

const calls: Record<string, (m: Awaited<ReturnType<typeof api>>) => Promise<unknown>> = {
  integrated_latest: (m) => m.fetchIntegratedChatRoomMessagesWithMeta("room-1"),
  integrated_page: (m) => m.fetchIntegratedChatRoomMessagesPage("room-1", { cursor }),
  legacy_latest: (m) => m.fetchLegacyChatRoomMessagesWithMeta("room-1"),
  legacy_page: (m) => m.fetchLegacyChatRoomMessagesPage("room-1", { cursor }),
};

describe.each(["header_stall", "body_stall"] as const)("거래 채팅 메시지 — %s", (kind) => {
  it.each(Object.keys(calls))("%s", async (name) => {
    const m = await api();
    await expectStallSettlesAndRetryIsNewRequest(kind, () => calls[name](m));
  });
});

describe("거래 채팅 메시지 — 정상 경로 보존", () => {
  it.each(Object.keys(calls))("%s: 동시 호출 1회 요청", async (name) => {
    const m = await api();
    await expectConcurrentCallsShareOneRequest(() => calls[name](m));
  });

  it("최신 페이지 마감 초과 → 기존 실패 계약(캐시된 메시지 유지)", async () => {
    const m = await api();
    const ok = await m.fetchIntegratedChatRoomMessagesWithMeta("room-1");
    expect(ok.messages.length).toBe(1);
    stallState.behavior = "body_stall";
    const p = m.fetchIntegratedChatRoomMessagesWithMeta("room-1");
    await vi.advanceTimersByTimeAsync(12_050);
    const failed = await p;
    expect(failed.messages.map((x) => x.id)).toEqual(["m1"]);
    expect(failed.hasMore).toBe(false);
  });
});
