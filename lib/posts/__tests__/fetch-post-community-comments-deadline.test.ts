// @vitest-environment jsdom
/**
 * 게시글 상세 커뮤니티 댓글 공유 요청 — 헤더·본문 멈춤에도 마감 안에 reject(→ PostCommunityCommentsSection 기존 catch·finally 로 로딩 해제),
 * 재진입은 새 요청. 정상 응답은 동시 호출 1회 요청·본문 그대로.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  expectConcurrentCallsShareOneRequest,
  expectStallSettlesAndRetryIsNewRequest,
  installStallFetch,
} from "@/lib/http/__tests__/shared-flight-stall-harness";

const payload = { comments: [{ id: "c1", user_id: "u1", content: "hi", created_at: "2026-01-01T00:00:00.000Z" }] };

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
  const m = await import("@/lib/posts/fetch-post-community-comments-client");
  return () => m.fetchPostCommunityCommentsShared("post-1");
}

describe("게시글 커뮤니티 댓글 공유 요청 마감", () => {
  it.each(["header_stall", "body_stall"] as const)("%s → 마감 안 종료 + 재진입 새 요청", async (kind) => {
    await expectStallSettlesAndRetryIsNewRequest(kind, await load());
  });

  it("정상 — 동시 호출 1회 요청, 본문 보존", async () => {
    const results = await expectConcurrentCallsShareOneRequest(await load());
    expect(results).toEqual([payload, payload]);
  });
});
