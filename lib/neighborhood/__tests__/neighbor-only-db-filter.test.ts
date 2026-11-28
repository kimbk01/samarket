/**
 * 관심이웃 글만 — DB 단계 거름 (관심이웃 설계 D · 감사 E5).
 * 예전 결함: 최신 21건(추천 200건)을 먼저 가져온 뒤 메모리에서 걸러, 관심이웃 글이 22번째 이후에 있으면 첫 페이지가 비었다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeSb, type FakeDb } from "@/lib/community/__tests__/neighbor-follow-fake-sb";

const ME = "11111111-1111-4111-8111-111111111111";
const PEER = "22222222-2222-4222-8222-222222222222";
const STRANGER = "33333333-3333-4333-8333-333333333333";

let db: FakeDb;
let fake: ReturnType<typeof createFakeSb>;

vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => fake }));

function postRow(i: number, user: string) {
  const at = new Date(Date.UTC(2026, 10, 28, 0, 0, 0) - i * 60_000).toISOString();
  return {
    id: `p-${String(i).padStart(3, "0")}`,
    user_id: user,
    title: `post ${i}`,
    content: "body",
    status: "active",
    is_hidden: false,
    is_deleted: false,
    published_at: at,
    created_at: at,
    location_id: "loc-1",
    topic_slug: "life",
    category: "life",
    like_count: 0,
    comment_count: 0,
    view_count: 0,
    images: [],
  };
}

beforeEach(() => {
  /** 최신 30건은 모르는 사람 글, 관심이웃 글은 31·32번째 · 내 글 1건 */
  const posts = [];
  for (let i = 0; i < 30; i += 1) posts.push(postRow(i, STRANGER));
  posts.push(postRow(30, PEER), postRow(31, PEER), postRow(32, ME));
  db = {
    community_posts: posts,
    user_relationships: [
      {
        id: "rel-1",
        user_id: ME,
        target_user_id: PEER,
        type: "neighbor_follow",
        relation_type: "neighbor_follow",
        created_at: "2026-11-01T00:00:00Z",
      },
    ],
    profiles: [],
  };
  fake = createFakeSb(db);
});

async function list(extra: Record<string, unknown>) {
  const { listNeighborhoodFeed } = await import("@/lib/neighborhood/queries");
  return listNeighborhoodFeed({
    allLocations: true,
    viewerUserId: ME,
    neighborOnly: true,
    feedSort: "latest",
    limit: 20,
    topics: [],
    ...extra,
  } as never);
}

describe("listNeighborhoodFeed neighborOnly", () => {
  it("관심이웃 글이 최신 21건 밖에 있어도 첫 페이지에 나온다 + 피드 필터는 본인 글 포함", async () => {
    const r = await list({});
    expect(r.posts.map((p) => p.id)).toEqual(["p-030", "p-031", "p-032"]);
    const inCall = fake.calls.find((c) => c.table === "community_posts" && c.op === "in" && c.args[0] === "user_id");
    expect(inCall && [...(inCall.args[1] as string[])].sort()).toEqual([ME, PEER].sort());
  });

  it("내정보 관심이웃 화면: 본인 글 제외", async () => {
    const r = await list({ neighborOnlyExcludeSelf: true });
    expect(r.posts.map((p) => p.id)).toEqual(["p-030", "p-031"]);
  });

  it("한 명만 — 내 관심이웃이면 그 사람 글, 아니면 빈 결과(남의 글 목록 우회 방지)", async () => {
    expect((await list({ neighborOnlyExcludeSelf: true, neighborOnlyTargetId: PEER })).posts.map((p) => p.id)).toEqual([
      "p-030",
      "p-031",
    ]);
    const r = await list({ neighborOnlyExcludeSelf: true, neighborOnlyTargetId: STRANGER });
    expect(r.posts).toEqual([]);
  });

  it("관심이웃 0명 — 글 조회 없이 빈 결과", async () => {
    db.user_relationships = [];
    const r = await list({ neighborOnlyExcludeSelf: true });
    expect(r.posts).toEqual([]);
    expect(fake.calls.some((c) => c.table === "community_posts")).toBe(false);
  });
});
