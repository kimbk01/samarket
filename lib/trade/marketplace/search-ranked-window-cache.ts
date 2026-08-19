/**
 * CUT C ranked window cache.
 * Key has NO page. Page 1/2 slice the same window. Continuation uses tier cursors.
 */
import {
  emptySearchExpansionCursor,
  searchExpansionSourcesExhausted,
  type SearchExpansionCursor,
} from "@/lib/trade/marketplace/search-candidate-expansion";

export const SEARCH_RANKED_WINDOW_TTL_MS = 30_000;
const SEARCH_RANKED_WINDOW_CACHE_MAX = 80;

export type SearchRankedWindowBatch<T> = {
  posts: T[];
  cursor: SearchExpansionCursor;
  queryCount: number;
};

export type SearchRankedWindowSession<T> = {
  posts: T[];
  cursor: SearchExpansionCursor;
  sourcesExhausted: boolean;
  loadCount: number;
  queryCount: number;
  expiresAt: number;
  fill: Promise<void> | null;
};

const sessions = new Map<string, SearchRankedWindowSession<unknown>>();

export function buildSearchRankedWindowCacheKey(parts: {
  sort: string;
  type: string;
  marketSegment: string;
  tradeState: string;
  locSegment: string;
  querySegment: string;
}): string {
  return `exp:${parts.sort}:${parts.type}:m:${parts.marketSegment}:ts:${parts.tradeState}:${parts.locSegment}:${parts.querySegment}`;
}

function pruneExpired(): void {
  const now = Date.now();
  for (const [key, entry] of sessions) {
    if (entry.expiresAt <= now) sessions.delete(key);
  }
  while (sessions.size > SEARCH_RANKED_WINDOW_CACHE_MAX) {
    const k = sessions.keys().next().value;
    if (k === undefined) break;
    sessions.delete(k);
  }
}

export function resetSearchRankedWindowCacheForTests(): void {
  sessions.clear();
}

/** PTR / explicit fresh feed — drop server ranked window for this committed browse key. */
export function invalidateSearchRankedWindowSession(key: string): void {
  sessions.delete(key);
}

export function peekSearchRankedWindowSession<T>(key: string): SearchRankedWindowSession<T> | null {
  const hit = sessions.get(key) as SearchRankedWindowSession<T> | undefined;
  if (!hit || hit.expiresAt <= Date.now()) return null;
  return hit;
}

export async function takeSearchRankedWindowPage<T>(input: {
  key: string;
  page: number;
  pageSize: number;
  loadNext: (cursor: SearchExpansionCursor) => Promise<SearchRankedWindowBatch<T> | null>;
}): Promise<{ posts: T[]; hasMore: boolean; loadCount: number; queryCount: number } | null> {
  pruneExpired();
  const page = Math.max(1, input.page);
  const pageSize = Math.max(1, input.pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  let session = sessions.get(input.key) as SearchRankedWindowSession<T> | undefined;
  const now = Date.now();
  if (!session || session.expiresAt <= now) {
    session = {
      posts: [],
      cursor: emptySearchExpansionCursor(),
      sourcesExhausted: false,
      loadCount: 0,
      queryCount: 0,
      expiresAt: now + SEARCH_RANKED_WINDOW_TTL_MS,
      fill: null,
    };
    sessions.set(input.key, session as SearchRankedWindowSession<unknown>);
  }

  let failed = false;
  let rounds = 0;
  /** Cover this page slice. Cap rounds so we never fall back to 0..1999. Page2 is 0 rounds when the window already covers it. */
  while (session.posts.length < end && !session.sourcesExhausted && rounds < 4) {
    if (session.fill) {
      await session.fill;
      continue;
    }
    const fill = (async () => {
      const batch = await input.loadNext(session.cursor);
      if (!batch) {
        failed = true;
        session.sourcesExhausted = true;
        return;
      }
      session.posts.push(...batch.posts);
      session.cursor = batch.cursor;
      session.sourcesExhausted = searchExpansionSourcesExhausted(batch.cursor);
      session.loadCount += 1;
      session.queryCount += batch.queryCount;
      session.expiresAt = Date.now() + SEARCH_RANKED_WINDOW_TTL_MS;
      /** Empty assemble ≠ all tiers exhausted. Duplicates can make a round yield 0 new rows. */
    })().finally(() => {
      if (session.fill === fill) session.fill = null;
    });
    session.fill = fill;
    await fill;
    rounds += 1;
  }
  if (failed && session.posts.length === 0) return null;

  const posts = session.posts.slice(start, end);
  const hasMore = session.posts.length > end || !session.sourcesExhausted;
  return {
    posts,
    hasMore,
    loadCount: session.loadCount,
    queryCount: session.queryCount,
  };
}
