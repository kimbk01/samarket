import { buildPhilifeNeighborhoodFeedClientUrl } from "@/lib/philife/neighborhood-feed-client-url";
import { sanitizeCommunityKeywordQuery } from "@/lib/community-feed/hashtag-discovery";
import type { CommunityFeedPostDTO } from "@/lib/community-feed/types";

export type CommunitySearchAdapterResult =
  | { ok: true; posts: CommunityFeedPostDTO[] }
  | { ok: false };

export async function searchCommunityForGlobal(
  q: string,
  signal: AbortSignal
): Promise<CommunitySearchAdapterResult> {
  const keyword = sanitizeCommunityKeywordQuery(q);
  if (!keyword) return { ok: true, posts: [] };
  try {
    const url = buildPhilifeNeighborhoodFeedClientUrl({
      globalFeed: true,
      q: keyword,
      limit: 10,
      sort: "latest",
    });
    const res = await fetch(url, { cache: "no-store", credentials: "include", signal });
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as { ok?: boolean; posts?: CommunityFeedPostDTO[] };
    if (json.ok === false) return { ok: false };
    const posts = Array.isArray(json.posts) ? json.posts : [];
    return { ok: true, posts };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    return { ok: false };
  }
}
