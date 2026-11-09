/**
 * 사장님 운영 공지 — 감사 수정 (Owner 「결함 수정 진행」 2026-11-10 · 설계 v3.2 §3-4-2)
 * ① 확인 창 이전·다음 = 목록 순서(고정 먼저 · 최신순)
 * ② 최신 공지 카드 = 안 읽은 공지 먼저
 * ③ 삭제·숨김·예약 글은 없는 글(제목도 주지 않음), 게시 종료만 unavailable
 */
import { describe, expect, it } from "vitest";
import { listOwnerAnnouncements, loadOwnerAnnouncementDetail } from "@/lib/notices/owner-announcements.server";

type Row = Record<string, unknown>;

function fakeSb(db: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      const q: Record<string, unknown> = {};
      const rows = () => (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
      q.select = () => q;
      q.order = () => q;
      q.limit = () => q;
      q.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === v), q);
      q.in = (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q);
      q.is = (c: string, v: unknown) => (filters.push((r) => (v === null ? r[c] == null : r[c] === v)), q);
      q.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
      q.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(res);
      return q;
    },
  } as never;
}

function n(id: string, at: string, extra: Row = {}): Row {
  return {
    id,
    title: `제목 ${id}`,
    body: "본문",
    audience: "store_owners",
    is_pinned: false,
    is_active: true,
    starts_at: null,
    ends_at: null,
    archived_at: null,
    deleted_at: null,
    published_at: at,
    created_at: at,
    content_type: "notice",
    ...extra,
  };
}

const DB = {
  app_notices: [
    n("a", "2026-11-01T00:00:00Z", { is_pinned: true }),
    n("b", "2026-11-05T00:00:00Z"),
    n("c", "2026-11-03T00:00:00Z"),
    n("draft", "2026-11-06T00:00:00Z", { is_active: false }),
    n("gone", "2026-11-06T00:00:00Z", { deleted_at: "2026-11-07T00:00:00Z" }),
    n("later", "2099-01-01T00:00:00Z", { starts_at: "2099-01-01T00:00:00Z" }),
    n("ended", "2026-10-01T00:00:00Z", { ends_at: "2026-10-02T00:00:00Z" }),
  ],
  customer_center_content_views: [{ user_id: "u1", content_id: "b" }],
};

describe("사장님 운영 공지 — 감사 수정", () => {
  it("① 이전·다음 = 고정 먼저 · 최신순 목록 기준", async () => {
    const d = await loadOwnerAnnouncementDetail(fakeSb(DB), "u1", ["store_owners"], "b");
    expect(d.kind).toBe("ok");
    if (d.kind !== "ok") return;
    expect(d.notice.prev?.id).toBe("a");
    expect(d.notice.next?.id).toBe("c");
  });

  it("② 최신 카드 = 안 읽은 것 먼저 (b 는 읽음 → c)", async () => {
    const list = await listOwnerAnnouncements(fakeSb(DB), "u1", ["store_owners"], { limit: 1, latestOnly: true });
    expect(list.map((x) => x.id)).toEqual(["c"]);
  });

  it("③ 숨김·삭제·예약 = not_found(제목 없음), 게시 종료 = unavailable", async () => {
    for (const id of ["draft", "gone", "later"]) {
      expect((await loadOwnerAnnouncementDetail(fakeSb(DB), "u1", ["store_owners"], id)).kind).toBe("not_found");
    }
    expect((await loadOwnerAnnouncementDetail(fakeSb(DB), "u1", ["store_owners"], "ended")).kind).toBe("unavailable");
  });
});
