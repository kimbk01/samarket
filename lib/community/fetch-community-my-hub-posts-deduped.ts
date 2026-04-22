import { runSingleFlight } from "@/lib/http/run-single-flight";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import { buildPhilifeNeighborhoodFeedClientUrl } from "@/lib/philife/neighborhood-feed-client-url";

export type CommunityMyHubPostsJson = {
  ok?: boolean;
  posts?: NeighborhoodFeedPostDTO[];
  error?: string;
};

export type CommunityMyHubPostsResult = {
  status: number;
  json: CommunityMyHubPostsJson;
};

const TTL_MS = 20_000;
const cacheByUser = new Map<string, { expiresAt: number; value: CommunityMyHubPostsResult }>();

/**
 * 내허브 "내가 쓴 글" 목록 — 재진입/다중 마운트 시 단일 요청으로 합류한다.
 */
export function fetchCommunityMyHubPostsDeduped(userId: string): Promise<CommunityMyHubPostsResult> {
  const uid = userId.trim();
  if (!uid) {
    return Promise.resolve({
      status: 400,
      json: { ok: false, posts: [], error: "user_required" },
    });
  }
  const hit = cacheByUser.get(uid);
  const now = Date.now();
  if (hit && hit.expiresAt > now) return Promise.resolve(hit.value);

  const key = `community:my-hub:posts:${uid}:30:0`;
  return runSingleFlight(key, async (): Promise<CommunityMyHubPostsResult> => {
    const again = cacheByUser.get(uid);
    if (again && again.expiresAt > Date.now()) {
      return again.value;
    }
    const url = buildPhilifeNeighborhoodFeedClientUrl({
      globalFeed: true,
      authorUserId: uid,
      limit: 30,
      offset: 0,
    });
    const res = await fetch(url, { cache: "default" });
    const json = (await res.json().catch(() => ({}))) as CommunityMyHubPostsJson;
    const result: CommunityMyHubPostsResult = { status: res.status, json };
    if (res.ok || res.status === 401 || res.status === 503) {
      cacheByUser.set(uid, { value: result, expiresAt: Date.now() + TTL_MS });
    }
    return result;
  });
}
