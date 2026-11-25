/**
 * Community feed cache SSOT — identity convergence + schema cutover.
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  isSameNeighborhoodFeedRow,
  patchNeighborhoodFeedRows,
} from "@/lib/community/neighborhood-feed-row-merge";
import type { NeighborhoodFeedPostDTO } from "@/lib/neighborhood/types";
import {
  COMMUNITY_FEED_CACHE_LEGACY_STORAGE_KEYS,
  COMMUNITY_FEED_CACHE_SCHEMA_VERSION,
  COMMUNITY_FEED_CACHE_STORAGE_KEY,
} from "@/lib/community/community-feed-cache-ssot";
import {
  readPhilifeFeedCache,
  writePhilifeFeedCache,
  clearAllPhilifeFeedPersistentCaches,
} from "@/lib/community/philife-feed-session-cache";

function row(partial: Partial<NeighborhoodFeedPostDTO> & { id: string }): NeighborhoodFeedPostDTO {
  return {
    id: partial.id,
    category: partial.category ?? "dailylife",
    category_label: partial.category_label ?? "일상생활",
    category_name_en: null,
    feed_list_skin: partial.feed_list_skin ?? "text_primary",
    topic_color: null,
    is_question: false,
    title: partial.title ?? "t",
    content: partial.content ?? "c",
    summary: partial.summary ?? "c",
    location_id: "",
    location_label: "Malate",
    images: partial.images ?? [],
    view_count: partial.view_count ?? 0,
    like_count: partial.like_count ?? 0,
    comment_count: partial.comment_count ?? 0,
    created_at: partial.created_at ?? "2026-08-11T00:00:00.000Z",
    author_name: partial.author_name ?? "참이슬",
    author_id: partial.author_id ?? "u1",
  };
}

describe("neighborhood-feed-row-merge identity", () => {
  it("does not treat rows equal when author_name differs (JTV vs nickname)", () => {
    const stale = row({ id: "p1", author_name: "JTV KOREAN MART" });
    const fresh = row({ id: "p1", author_name: "참이슬" });
    expect(isSameNeighborhoodFeedRow(stale, fresh)).toBe(false);
  });

  it("patchNeighborhoodFeedRows replaces stale author_name from server", () => {
    const prev = [row({ id: "p1", author_name: "JTV KOREAN MART" })];
    const incoming = [row({ id: "p1", author_name: "참이슬" })];
    const out = patchNeighborhoodFeedRows(prev, incoming);
    expect(out[0]?.author_name).toBe("참이슬");
    expect(out[0]).not.toBe(prev[0]);
  });

  /** 2026-11-25 — 어드민이 「질문있어요」 썸네일 숨김을 풀었는데 저장본이 계속 이겨 목록에 썸네일이 안 나옴 */
  it("replaces cached row when admin changes topic list skin", () => {
    const img = "https://x.supabase.co/storage/v1/object/public/post-images/u1/community/a.webp";
    const prev = [row({ id: "p1", feed_list_skin: "text_primary", images: [img] })];
    const incoming = [row({ id: "p1", feed_list_skin: "compact_media", images: [img] })];
    const out = patchNeighborhoodFeedRows(prev, incoming);
    expect(out[0]?.feed_list_skin).toBe("compact_media");
    expect(out).not.toBe(prev);
  });

  it.each([
    ["images", { images: ["https://x/b.webp"] }],
    ["title", { title: "새 제목" }],
    ["summary", { summary: "새 요약" }],
    ["category_label", { category_label: "질문" }],
    ["topic_color", { topic_color: "#ff0000" }],
    ["is_pinned", { is_pinned: true }],
  ] as const)("treats rows different when %s differs", (_k, patch) => {
    const a = row({ id: "p1" });
    const b = { ...row({ id: "p1" }), ...patch } as NeighborhoodFeedPostDTO;
    expect(isSameNeighborhoodFeedRow(a, b)).toBe(false);
  });

  it("treats JSON round-tripped cache row as equal to the same server row", () => {
    const server = row({ id: "p1", images: ["https://x/a.webp"] });
    const cached = JSON.parse(JSON.stringify(server)) as NeighborhoodFeedPostDTO;
    expect(isSameNeighborhoodFeedRow(cached, server)).toBe(true);
  });

  it("reuses row ref when projection equal", () => {
    const prev = [row({ id: "p1", author_name: "참이슬" })];
    const incoming = [row({ id: "p1", author_name: "참이슬" })];
    const out = patchNeighborhoodFeedRows(prev, incoming);
    expect(out[0]).toBe(prev[0]);
  });
});

describe("community feed cache schema cutover", () => {
  const mem = new Map<string, string>();
  const stub = {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => {
      mem.set(k, String(v));
    },
    removeItem: (k: string) => {
      mem.delete(k);
    },
    clear: () => mem.clear(),
    key: (i: number) => [...mem.keys()][i] ?? null,
    get length() {
      return mem.size;
    },
  };

  beforeEach(() => {
    mem.clear();
    Object.defineProperty(globalThis, "localStorage", { value: stub, configurable: true });
    Object.defineProperty(globalThis, "sessionStorage", { value: stub, configurable: true });
    Object.defineProperty(globalThis, "window", {
      value: { localStorage: stub, sessionStorage: stub },
      configurable: true,
    });
  });
  afterEach(() => {
    mem.clear();
  });

  it("exposes v4 storage key and ignores legacy v3 key content", () => {
    expect(COMMUNITY_FEED_CACHE_SCHEMA_VERSION).toBe(4);
    expect(COMMUNITY_FEED_CACHE_STORAGE_KEY).toBe("philife_neighborhood_feed_v4_persistent");
    expect(COMMUNITY_FEED_CACHE_LEGACY_STORAGE_KEYS).toContain("philife_neighborhood_feed_v3_persistent");

    localStorage.setItem(
      "philife_neighborhood_feed_v3_persistent",
      JSON.stringify({
        "k": {
          savedAt: Date.now(),
          posts: [row({ id: "p1", author_name: "JTV KOREAN MART" })],
          hasMore: false,
          nextOffset: 0,
        },
      })
    );

    const miss = readPhilifeFeedCache("__philife_global", "dailylife", false, "_anon", "latest");
    expect(miss).toBeNull();

    writePhilifeFeedCache(
      "__philife_global",
      "dailylife",
      false,
      "_anon",
      { posts: [row({ id: "p1", author_name: "참이슬" })], hasMore: false, nextOffset: 1 },
      "latest"
    );
    expect(localStorage.getItem("philife_neighborhood_feed_v3_persistent")).toBeNull();
    const hit = readPhilifeFeedCache("__philife_global", "dailylife", false, "_anon", "latest");
    expect(hit?.posts[0]?.author_name).toBe("참이슬");

    const raw = localStorage.getItem(COMMUNITY_FEED_CACHE_STORAGE_KEY)!;
    const parsed = JSON.parse(raw) as { schemaVersion: number };
    expect(parsed.schemaVersion).toBe(4);

    clearAllPhilifeFeedPersistentCaches();
    expect(localStorage.getItem(COMMUNITY_FEED_CACHE_STORAGE_KEY)).toBeNull();
  });
});
