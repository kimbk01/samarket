// @vitest-environment jsdom
/**
 * 그룹채팅 bootstrap 공유 요청 — 헤더·본문 멈춤에도 마감 안에 reject(→ GroupChatRoomClient 「네트워크 오류」 재시도 가능),
 * 재진입은 새 요청. 정상 응답은 동시 호출 1회 요청·status/data 그대로.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectConcurrentCallsShareOneRequest,
  expectStallSettlesAndRetryIsNewRequest,
  installStallFetch,
} from "@/lib/http/__tests__/shared-flight-stall-harness";

const payload = { ok: true, room: { id: "room-1", title: "t", memberCount: 2 }, messages: [] };

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  installStallFetch(payload);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function load() {
  const { fetchGroupChatBootstrapDeduped } = await import("@/lib/group-chat/fetch-group-chat-bootstrap");
  return () => fetchGroupChatBootstrapDeduped("room-1");
}

describe("그룹채팅 bootstrap 공유 요청 마감", () => {
  it.each(["header_stall", "body_stall"] as const)("%s → 마감 안 종료 + 재진입 새 요청", async (kind) => {
    await expectStallSettlesAndRetryIsNewRequest(kind, await load());
  });

  it("정상 — 동시 호출 1회 요청, status·data 보존", async () => {
    const results = await expectConcurrentCallsShareOneRequest(await load());
    expect(results).toEqual([
      { status: 200, data: payload },
      { status: 200, data: payload },
    ]);
  });
});
