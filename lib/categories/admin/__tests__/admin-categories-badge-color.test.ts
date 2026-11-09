/**
 * 2026-11-10 결함: 「거래 메뉴 설정」 이 배지 색(badge_color)을 빈칸으로 불러와 저장 시 지움.
 * ① 관리자 목록 조회가 고객 화면과 같은 공용 조회(배지 색 포함)·변환을 쓰는지
 * ② 「등록 옵션」 저장이 주제 기본 정보를 보내지 않는지
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const selectCalls: string[] = [];
const rows = [
  {
    id: "fa4af727-ec64-466e-b164-42368b839daf",
    name: "환전거래",
    name_en: "Currency exchange",
    slug: "current",
    icon_key: "exchange",
    badge_color: "#0f766e",
    type: "trade",
    parent_id: null,
    sort_order: 3,
    is_active: false,
    description: null,
    quick_create_enabled: true,
    quick_create_group: "trade",
    quick_create_order: 0,
    show_in_home_chips: true,
    created_at: "2026-03-30T20:54:27Z",
    updated_at: "2026-11-09T16:15:14Z",
    category_settings: null,
  },
];

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: (fragment: string) => {
        selectCalls.push(fragment);
        const result = Promise.resolve({ data: rows, error: null });
        const chain = { order: () => chain, then: result.then.bind(result) };
        return chain;
      },
    }),
  }),
}));

afterEach(() => {
  selectCalls.length = 0;
  vi.unstubAllGlobals();
});

describe("관리자 카테고리 목록 — 배지 색", () => {
  it("배지 색 칸을 포함해 조회하고 그대로 돌려준다", async () => {
    const { loadAdminCategories } = await import("@/lib/categories/admin/getAdminCategories");
    const res = await loadAdminCategories();
    expect(selectCalls[0]).toContain("badge_color");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data[0]?.badge_color).toBe("#0F766E");
    expect(res.data[0]?.name_en).toBe("Currency exchange");
  });
});

describe("등록 옵션 저장 — 설정만 전송", () => {
  it("updateCategorySettingsAdmin 은 category 를 보내지 않는다", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { updateCategorySettingsAdmin } = await import("@/lib/categories/admin/updateCategory");
    const res = await updateCategorySettingsAdmin("fa4af727-ec64-466e-b164-42368b839daf", {
      can_write: true,
      has_price: true,
      has_chat: true,
      has_location: true,
      has_direct_deal: true,
      has_free_share: true,
      post_type: "normal",
      field_composition: null,
    });
    expect(res.ok).toBe(true);
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown[])[1] && ((fetchMock.mock.calls[0] as unknown[])[1] as RequestInit).body));
    expect(body.op).toBe("update");
    expect("category" in body).toBe(false);
    expect(body.settings.post_type).toBe("normal");
  });

  it("거래 메뉴 설정의 saveOptions 는 설정 전용 저장을 쓴다", () => {
    const src = readFileSync(resolve(process.cwd(), "components/admin/menus/AdminMenusPage.tsx"), "utf8");
    const start = src.indexOf("const saveOptions = useCallback");
    const end = src.indexOf("}, [activeRoot, draftComposition", start);
    const block = src.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(block).toContain("updateCategorySettingsAdmin(");
    expect(block).not.toContain("updateCategoryAdmin(");
    expect(block).not.toContain("badge_color");
  });
});
