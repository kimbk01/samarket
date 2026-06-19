import { describe, expect, it, vi, beforeEach } from "vitest";
import { listCommunityPostsForUser } from "@/lib/community-feed/list-community-posts-for-user";
import { COMMUNITY_POST_FEED_STATUS_ACTIVE } from "@/lib/neighborhood/community-post-contract";

const mockFrom = vi.fn();
const mockGetSupabaseServer = vi.fn(() => ({ from: mockFrom }));

vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => mockGetSupabaseServer(),
}));

vi.mock("@/lib/chats/resolve-author-nickname", () => ({
  fetchNicknamesForUserIds: vi.fn(async () => new Map([["author-1", "Nick"]])),
}));

function chain(result: { data: unknown; error: unknown }, opts?: { withOrderAfterIn?: boolean }) {
  const api = {
    select: vi.fn(() => api),
    eq: vi.fn(() => api),
    order: vi.fn(() => api),
    limit: vi.fn(() => api),
    in: vi.fn(() => (opts?.withOrderAfterIn ? api : Promise.resolve(result))),
    then: undefined as unknown,
  };
  if (!opts?.withOrderAfterIn) {
    Object.assign(api, {
      then(onFulfilled: (v: typeof result) => unknown, onRejected?: (e: unknown) => unknown) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
    });
  } else {
    api.order.mockImplementation(() =>
      Object.assign({}, api, {
        then(onFulfilled: (v: typeof result) => unknown, onRejected?: (e: unknown) => unknown) {
          return Promise.resolve(result).then(onFulfilled, onRejected);
        },
      })
    );
  }
  return api;
}

describe("listCommunityPostsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to base columns when community_topics embed fails", async () => {
    const embedFail = chain({
      data: null,
      error: { message: "Could not embed community_topics" },
    });
    const baseOk = chain({
      data: [
        {
          id: "cp-1",
          section_slug: "plife",
          topic_slug: "daily",
          title: "Daily post",
          summary: "Body",
          region_label: "Malate",
          is_question: false,
          is_meetup: false,
          meetup_date: null,
          meetup_place: null,
          view_count: 1,
          like_count: 0,
          comment_count: 0,
          created_at: "2026-06-19T00:00:00.000Z",
          user_id: "author-1",
          is_deleted: false,
          is_hidden: false,
          status: COMMUNITY_POST_FEED_STATUS_ACTIVE,
        },
      ],
      error: null,
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === "community_posts") {
        if (mockFrom.mock.calls.filter((c) => c[0] === "community_posts").length === 1) {
          return embedFail;
        }
        return baseOk;
      }
      if (table === "community_post_images") {
        return chain({ data: [], error: null }, { withOrderAfterIn: true });
      }
      return embedFail;
    });

    const posts = await listCommunityPostsForUser("author-1", 10);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.id).toBe("cp-1");
    expect(posts[0]?.topic_slug).toBe("daily");
    expect(posts[0]?.author_name).toBe("Nick");
  });

  it("falls back without status filter when status column is missing", async () => {
    const embedFail = chain({
      data: null,
      error: { message: "Could not embed community_topics" },
    });
    const baseStatusFail = chain({
      data: null,
      error: { message: "column community_posts.status does not exist" },
    });
    const baseNoStatusOk = chain({
      data: [
        {
          id: "cp-legacy",
          section_slug: "plife",
          topic_slug: "daily",
          title: "Legacy row",
          summary: "Body",
          region_label: "Malate",
          view_count: 0,
          like_count: 0,
          comment_count: 0,
          created_at: "2026-06-19T00:00:00.000Z",
          user_id: "author-1",
          is_hidden: false,
        },
      ],
      error: null,
    });

    let communityPostsCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "community_posts") {
        communityPostsCall += 1;
        if (communityPostsCall === 1) return embedFail;
        if (communityPostsCall === 2) return baseStatusFail;
        return baseNoStatusOk;
      }
      if (table === "community_post_images") {
        return chain({ data: [], error: null }, { withOrderAfterIn: true });
      }
      return embedFail;
    });

    const posts = await listCommunityPostsForUser("author-1", 10);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.id).toBe("cp-legacy");
  });

  it("filters non-public rows after fetch", async () => {
    const ok = chain({
      data: [
        {
          id: "hidden-1",
          section_slug: "plife",
          topic_slug: "daily",
          title: "Hidden",
          summary: "",
          region_label: "Malate",
          user_id: "author-1",
          is_deleted: false,
          is_hidden: true,
          status: "hidden",
        },
      ],
      error: null,
    });
    mockFrom.mockImplementation(() => ok);

    const posts = await listCommunityPostsForUser("author-1", 10);
    expect(posts).toHaveLength(0);
  });
});
