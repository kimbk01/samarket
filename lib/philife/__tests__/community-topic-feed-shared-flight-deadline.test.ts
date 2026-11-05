// @vitest-environment jsdom
/**
 * 커뮤니티 주제 목록(피드·글쓰기)·동네 피드 공유 요청·내 허브 글 — 헤더·본문 멈춤에도 마감 안에 끝나고
 * 재진입은 새 요청. 정상 응답은 동시 호출 1회 요청.
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
  installStallFetch({ ok: true, topics: [], posts: [] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

type Call = () => Promise<unknown>;

const FEED_URL = "/api/philife/neighborhood-feed?limit=20";

async function load(): Promise<Record<string, Call>> {
  const topics = await import("@/lib/philife/fetch-neighborhood-topic-options-client");
  const feed = await import("@/lib/philife/fetch-neighborhood-feed-short-ttl");
  const hub = await import("@/lib/community/fetch-community-my-hub-posts-deduped");
  return {
    topic_options: () => topics.fetchPhilifeNeighborhoodTopicOptions(),
    topic_options_write: () => topics.fetchPhilifeNeighborhoodTopicOptionsForWrite(),
    neighborhood_feed: () => feed.fetchNeighborhoodFeedShortTtl(FEED_URL, { cache: "no-store" }),
    my_hub_posts: () => hub.fetchCommunityMyHubPostsDeduped("user-1"),
  };
}

const names = ["topic_options", "topic_options_write", "neighborhood_feed", "my_hub_posts"];

describe.each(["header_stall", "body_stall"] as const)("커뮤니티 주제·피드 — %s", (kind) => {
  it.each(names)("%s", async (name) => {
    const calls = await load();
    await expectStallSettlesAndRetryIsNewRequest(kind, calls[name]);
  });
});

describe("커뮤니티 주제·피드 — 정상 경로 보존", () => {
  it.each(names)("%s: 동시 호출 1회 요청", async (name) => {
    const calls = await load();
    await expectConcurrentCallsShareOneRequest(calls[name]);
  });

  it("피드: 한 소비자의 signal 취소는 공유 요청을 끊지 않는다", async () => {
    const feed = await import("@/lib/philife/fetch-neighborhood-feed-short-ttl");
    const ac = new AbortController();
    const a = feed.fetchNeighborhoodFeedShortTtl(FEED_URL, { cache: "no-store", signal: ac.signal }).catch((e: unknown) => e);
    const b = feed.fetchNeighborhoodFeedShortTtl(FEED_URL, { cache: "no-store" });
    ac.abort();
    expect(((await a) as Error).name).toBe("AbortError");
    await vi.advanceTimersByTimeAsync(10);
    const res = await b;
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
    expect(stallState.fetchCalls).toBe(1);
  });
});
