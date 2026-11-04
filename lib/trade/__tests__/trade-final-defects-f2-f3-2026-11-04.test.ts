import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/resolve-service-supabase-for-api", () => ({ resolveServiceSupabaseForApi: () => null }));

import {
  ROOM_SYNC_CHUNK,
  syncTradeRoomItemStateLabelsForPosts,
} from "@/lib/trade/listing-visibility/listing-visibility-room-sync";

/**
 * 최종 결함 F2·F3 (docs/audit/trade-final-defects-root-cause-design-2026-11-04.md · Owner 「설계안 승인」 2026-11-04)
 * F2: 숨김·삭제를 바꾸는데 방송·거래방 문구 맞춤이 없던 경로(관리자 판매 취소·거래 글 영구삭제·데이터 초기화)
 * F3: 거래방 찾기 = product_chats 인덱스(방 표 전체 LIKE 탐색 대체) · 200개씩 · 저장 동시 4
 */
const src = (p: string) => readFileSync(p, "utf8");

type Row = Record<string, unknown>;
function fakeSb(tables: { posts: Row[]; product_chats: Row[]; community_messenger_rooms: Row[] }) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const updates: { id: string; summary: string }[] = [];
  const from = (table: keyof typeof tables) => {
    let rows = [...tables[table]];
    let pendingUpdate: Row | null = null;
    const q = {
      select: (...args: unknown[]) => (calls.push({ table, op: "select", args }), q),
      like: (...args: unknown[]) => (calls.push({ table, op: "like", args }), q),
      in: (col: string, vals: string[]) => {
        calls.push({ table, op: "in", args: [col, vals.length] });
        rows = rows.filter((r) => vals.includes(String(r[col])));
        return q;
      },
      not: (col: string) => ((rows = rows.filter((r) => r[col] != null)), q),
      update: (patch: Row) => ((pendingUpdate = patch), q),
      eq: (col: string, val: string) => {
        if (pendingUpdate) {
          updates.push({ id: val, summary: String(pendingUpdate.summary) });
          return Promise.resolve({ error: null });
        }
        rows = rows.filter((r) => String(r[col]) === val);
        return q;
      },
      then: (res: (v: { data: Row[]; error: null }) => unknown) => res({ data: rows, error: null }),
    };
    return q;
  };
  return { sb: { from } as never, calls, updates };
}

const summary = (postId: string, label: string) =>
  JSON.stringify({ v: 1, kind: "trade", postId, headline: "자전거", priceLabel: "1,000원", itemStateLabel: label });

describe("F3 거래방 문구 맞춤 — 인덱스로 찾고 그 글 방만 바꾼다", () => {
  it("연결된 방만 · 숨김 글 「숨김」 · 지운 글 「삭제됨」 · 다른 글 방 무변경 · LIKE 탐색 없음", async () => {
    const { sb, calls, updates } = fakeSb({
      posts: [{ id: "p1", status: "hidden", seller_listing_state: "inquiry" }],
      product_chats: [
        { post_id: "p1", community_messenger_room_id: "r1" },
        { post_id: "p1", community_messenger_room_id: "r2" },
        { post_id: "gone", community_messenger_room_id: "r3" },
        { post_id: "other", community_messenger_room_id: "r9" },
        { post_id: "p1", community_messenger_room_id: null },
      ],
      community_messenger_rooms: [
        { id: "r1", summary: summary("p1", "판매중") },
        { id: "r2", summary: summary("p1", "숨김") },
        { id: "r3", summary: summary("gone", "판매중") },
        { id: "r9", summary: summary("other", "판매중") },
      ],
    });
    const res = await syncTradeRoomItemStateLabelsForPosts(["p1", "gone", "p1"], sb);
    expect(res).toEqual({ updated: 2, failed: 0 });
    expect(updates.map((u) => [u.id, JSON.parse(u.summary).itemStateLabel]).sort()).toEqual([
      ["r1", "숨김"],
      ["r3", "삭제됨"],
    ]);
    const r1 = JSON.parse(updates.find((u) => u.id === "r1")!.summary);
    expect(r1).toMatchObject({ headline: "자전거", priceLabel: "1,000원", postId: "p1" });
    expect(calls.some((c) => c.op === "like")).toBe(false);
  });

  it("글이 200개를 넘으면 나눠서 조회(한 번에 200개 이하)", async () => {
    const ids = Array.from({ length: ROOM_SYNC_CHUNK * 2 + 5 }, (_, i) => `p${i}`);
    const { sb, calls } = fakeSb({ posts: [], product_chats: [], community_messenger_rooms: [] });
    await syncTradeRoomItemStateLabelsForPosts(ids, sb);
    const ins = calls.filter((c) => c.op === "in" && c.table === "product_chats").map((c) => c.args[1] as number);
    expect(ins).toEqual([200, 200, 5]);
  });

  it("방송 경로는 기존과 같이 이 함수를 지난다", () => {
    const sync = src("lib/trade/listing-visibility/listing-visibility-room-sync.ts");
    expect(sync).not.toMatch(/\.like\(/);
    expect(sync).toContain('.from("product_chats")');
    expect(sync).toContain("ROOM_SYNC_WRITE_CONCURRENCY = 4");
  });
});

describe("F2 숨김·삭제를 바꾸는 경로는 모두 방송·거래방 문구 맞춤을 지난다", () => {
  it("관리자 판매 취소 — 공개였던 글을 이번에 숨겼을 때만 방송", () => {
    const s = src("app/api/admin/posts/[postId]/trade-override/route.ts");
    expect(s).toMatch(
      /if \(patch\.moderation_state === "admin_hidden"\) \{\s*await publishTradeListingVisibility\(id, false, "admin_hidden"\);/
    );
  });
  it("거래 글 영구삭제 — 지운 글마다 방송(삭제)", () => {
    const s = src("app/api/admin/posts/bulk-delete/route.ts");
    expect(s).toMatch(/for \(const postId of deleted\) \{\s*await publishTradeListingVisibility\(postId, false, "admin_deleted"\);/);
  });
  it("데이터 초기화(거래 글 1개·전체) — 지운 뒤 거래방 문구 맞춤", () => {
    const s = src("lib/admin/data-reset/execute.ts");
    expect(s).toContain("await syncTradeRoomItemStateLabelsForPosts([plan.entityId], sb);");
    expect(s).toContain("await syncTradeRoomItemStateLabelsForPosts(ids, sb);");
  });

  it("재발 방지: 글 숨김·삭제를 쓰는 파일은 아래 목록뿐(새로 생기면 실패) · 각 파일 처리 확인", () => {
    const files = execSync("git ls-files app lib components services", { encoding: "utf8" })
      .split("\n")
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/__tests__|\.test\./.test(f));
    const writes = [
      /moderation_state\s*[=:]\s*"admin_/,
      /owner_state\s*[=:]\s*"owner_/,
      /from\("posts"\)\s*\.delete\(/,
      /"admin_trade_post_moderate"/,
      /"admin_decide_trade_report"/,
    ];
    const found = files.filter((f) => writes.some((r) => r.test(src(f)))).sort();
    const handled = [
      "app/api/admin/posts/[postId]/status/route.ts",
      "app/api/admin/posts/[postId]/trade-override/route.ts",
      "app/api/admin/posts/bulk-delete/route.ts",
      "app/api/admin/trade/posts/[id]/moderation/route.ts",
      "app/api/posts/[postId]/owner-delete/route.ts",
      "app/api/posts/[postId]/owner-status/route.ts",
      "lib/admin/data-reset/execute.ts",
      "lib/admin/trade-admin/trade-report-decision.ts",
    ];
    const notVisibility = [
      "app/api/admin/chat/report-queue/action/route.ts", // 거래 신고 종결만 — hidePost: false 고정(글 숨김 없음)
    ];
    const reportedOnly = [
      "lib/admin/prelaunch-reset/execute.ts", // 출시 전 초기화 — 승인 범위 밖 · 보고만 (2026-11-04)
    ];
    expect(found).toEqual([...handled, ...notVisibility, ...reportedOnly].sort());
    for (const f of handled) {
      expect(src(f), f).toMatch(/publishTradeListingVisibility|syncTradeRoomItemStateLabels/);
    }
    expect(src("app/api/admin/chat/report-queue/action/route.ts")).toContain("hidePost: false,");
  });
});
