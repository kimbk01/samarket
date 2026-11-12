import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeCommunitySupabase, jsonRequest, type FakeCall, type FakeResult } from "./fake-community-supabase";

/**
 * 커뮤니티 주제 저장 감사 기록에 영어 이름(`name_en`)이 실제 값으로 남는다
 * (2026-11-12 운영 실측: 「필리핀생할→필리핀생활」 저장 기록의 수정 후 name_en = null, 실제 DB = 「Life in the Philippines」 —
 * 저장 후 다시 읽는 칸 목록에 `name_en` 이 없었음. Owner 「감사 기록 영어 이름 결함 수정」).
 */
const ROW = {
  id: "t1",
  section_id: "s1",
  name: "필리핀생할",
  name_en: "Life in the Philippines",
  slug: "phlifee",
  icon: null,
  color: null,
  sort_order: 2,
  is_active: true,
  is_visible: true,
  is_feed_sort: false,
  feed_sort_mode: null,
  allow_question: true,
  feed_list_skin: "compact_media",
};

/** DB 처럼 — 요청한 칸만 돌려준다 */
function pick(row: Record<string, unknown>, cols: string | undefined): Record<string, unknown> {
  if (!cols || cols.trim() === "*") return { ...row };
  return Object.fromEntries(
    cols
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => [c, row[c]])
  );
}

let handler: (call: FakeCall) => FakeResult = () => ({ data: null, error: null });
const fake = createFakeCommunitySupabase((c) => handler(c));
const audit = vi.fn(async (..._a: unknown[]) => ({ ok: true as const }));

vi.mock("@/lib/admin/community-admin/community-admin-guards", () => ({
  requireCommunityAdmin: async () => ({ ok: true, userId: "admin-1", actor: { userId: "admin-1" }, sb: fake.sb }),
}));
vi.mock("@/lib/admin/community-admin/community-admin-audit", () => ({
  appendCommunityAdminAudit: (...a: unknown[]) => audit(...a),
}));
vi.mock("@/lib/chat/supabase-server", () => ({ getSupabaseServer: () => fake.sb }));
vi.mock("@/lib/neighborhood/philife-neighborhood-topics", () => ({ clearPhilifeDefaultSectionTopicsCache: () => {} }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

type AuditArg = { action: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null };
const lastAudit = () => audit.mock.calls.at(-1)?.[2] as AuditArg;

describe("커뮤니티 주제 감사 기록 — 영어 이름", () => {
  beforeEach(() => {
    audit.mockClear();
  });

  it("주제 수정: 한국어 이름만 바꿔도 수정 후 영어 이름 = 실제 값", async () => {
    handler = (c) => {
      if (c.op === "select") return { data: pick(ROW, c.selectCols), error: null };
      if (c.op === "update") return { data: pick({ ...ROW, ...(c.values as object) }, c.returning), error: null };
      return { data: null, error: null };
    };
    const { PATCH } = await import("@/app/api/admin/community/topics/[id]/route");
    const res = await PATCH(
      jsonRequest("http://x/api/admin/community/topics/t1", "PATCH", {
        name: "필리핀생활",
        name_en: "Life in the Philippines",
        feed_list_skin: "compact_media",
      }) as never,
      { params: Promise.resolve({ id: "t1" }) }
    );
    const body = (await res.json()) as { ok: boolean; topic: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.topic.name_en).toBe("Life in the Philippines");
    const a = lastAudit();
    expect(a.action).toBe("community_topic.update");
    expect(a.before?.name_en).toBe("Life in the Philippines");
    expect(a.after?.name_en).toBe("Life in the Philippines");
    expect(a.after?.name).toBe("필리핀생활");
  });

  it("주제 만들기: 만든 값 기록에 영어 이름 포함", async () => {
    handler = (c) => {
      if (c.op === "insert") return { data: pick({ ...ROW, ...(c.values as object), id: "t2" }, c.returning), error: null };
      return { data: null, error: null };
    };
    const { POST } = await import("@/app/api/admin/community/topics/route");
    const res = await POST(
      jsonRequest("http://x/api/admin/community/topics", "POST", {
        section_id: "s1",
        name: "골프",
        name_en: "Golf",
        slug: "golf",
      }) as never
    );
    const body = (await res.json()) as { ok: boolean; topic: Record<string, unknown> };
    expect(body.ok).toBe(true);
    expect(body.topic.name_en).toBe("Golf");
    const a = lastAudit();
    expect(a.action).toBe("community_topic.create");
    expect(a.after?.name_en).toBe("Golf");
  });
});
