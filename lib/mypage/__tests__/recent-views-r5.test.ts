import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { mypageRecencyBucket } from "@/lib/mypage/format-mypage-date";
import { listTradeRecentViews } from "@/lib/mypage/trade-recent-views.server";
import { groupRecentViewsByBucket } from "@/components/recent-viewed/RecentViewedList";
import { createFakeSupabase } from "@/lib/mypage/__tests__/helpers/fake-postgrest";
import { POSTS_TABLE_READ } from "@/lib/posts/posts-db-tables";

/** S25 — 날짜 묶음(PHT 자정 경계·UTC 저장값) · 삭제된 기록 포함 */
describe("mypageRecencyBucket (Asia/Manila)", () => {
  // 2026-10-21(수) 10:00 PHT = 02:00Z
  const now = Date.parse("2026-10-21T02:00:00Z");
  it("PHT 자정 경계 — UTC 날짜가 달라도 PHT 날짜 기준", () => {
    expect(mypageRecencyBucket("2026-10-20T16:00:00Z", now)).toBe("today"); // 10-21 00:00 PHT
    expect(mypageRecencyBucket("2026-10-20T15:59:59Z", now)).toBe("yesterday"); // 10-20 23:59 PHT
    expect(mypageRecencyBucket("2026-10-19T16:00:00Z", now)).toBe("yesterday");
  });
  it("이번 주 = 이번 주 월요일(PHT) 이후, 그 전은 이전", () => {
    expect(mypageRecencyBucket("2026-10-19T01:00:00Z", now)).toBe("this_week"); // 10-19(월) 09:00 PHT
    expect(mypageRecencyBucket("2026-10-18T15:00:00Z", now)).toBe("earlier"); // 10-18(일) 23:00 PHT
  });
  it("월요일 기준: 오늘이 월요일이면 어제(일)는 어제, 그 전은 이전", () => {
    const monday = Date.parse("2026-10-19T04:00:00Z");
    expect(mypageRecencyBucket("2026-10-18T04:00:00Z", monday)).toBe("yesterday");
    expect(mypageRecencyBucket("2026-10-17T04:00:00Z", monday)).toBe("earlier");
  });
  it("묶음 순서 오늘→어제→이번 주→이전, 항목 순서 유지", () => {
    const g = groupRecentViewsByBucket(
      [
        { postId: "d1", viewedAt: "2026-10-21T01:00:00Z", deleted: true },
        { postId: "d2", viewedAt: "2026-10-01T01:00:00Z", deleted: true },
        { postId: "d3", viewedAt: "2026-10-20T01:00:00Z", deleted: true },
      ],
      now
    );
    expect(g.map((x) => x.bucket)).toEqual(["today", "yesterday", "earlier"]);
  });
});

describe("listTradeRecentViews — 삭제된 글 기록 포함", () => {
  it("글 없음·status=deleted → `{ postId, viewedAt, deleted:true }`", async () => {
    const sb = createFakeSupabase({
      trade_post_recent_views: [
        { user_id: "u1", post_id: "p1", viewed_at: "2026-10-21T00:00:00Z" },
        { user_id: "u1", post_id: "gone", viewed_at: "2026-10-20T00:00:00Z" },
        { user_id: "u1", post_id: "p2", viewed_at: "2026-10-19T00:00:00Z" },
      ],
      [POSTS_TABLE_READ]: [
        { id: "p1", title: "a", status: "active", user_id: "s" },
        { id: "p2", title: "b", status: "deleted", user_id: "s" },
      ],
    });
    const r = await listTradeRecentViews(sb as never, "u1");
    if (!r.ok) throw new Error("fail");
    expect(r.items.map((x) => ("deleted" in x ? `del:${x.postId}` : String(x.id)))).toEqual(["p1", "del:gone", "del:p2"]);
    expect(r.items[1]).toEqual({ postId: "gone", viewedAt: "2026-10-20T00:00:00Z", deleted: true });
  });
});
