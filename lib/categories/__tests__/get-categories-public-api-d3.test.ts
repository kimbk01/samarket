import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * D3 (2026-11-19) — getCategories: 활성 목록은 같은 출처 캐시 API, 60초 클라이언트 캐시·동시 요청 1회,
 * API 실패 시 기존 직접 조회 폴백, 비활성 포함 조회는 직접 조회 그대로.
 */
const directQuery = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = () => directQuery();
      return chain;
    },
  }),
}));

const row = (id: string, type = "trade") => ({
  id,
  name: `n-${id}`,
  slug: `s-${id}`,
  type,
  is_active: true,
  sort_order: 1,
  category_settings: null,
});

describe("getCategories — D3 public API", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    vi.resetModules();
    directQuery.mockReset();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("활성 목록은 /api/public/categories 를 쿠키 없이 부르고 직접 조회하지 않는다", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, rows: [row("a")] }) });
    const { getCategories } = await import("@/lib/categories/getCategories");
    const list = await getCategories({ type: "trade", activeOnly: true });
    expect(list.map((c) => c.id)).toEqual(["a"]);
    expect(fetchMock).toHaveBeenCalledWith("/api/public/categories?type=trade", { credentials: "omit" });
    expect(directQuery).not.toHaveBeenCalled();
  });

  it("60초 안 같은 조건은 다시 받지 않고, 동시 요청은 1회로 합친다", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, rows: [row("a")] }) });
    const { getCategories } = await import("@/lib/categories/getCategories");
    await Promise.all([getCategories({ type: "trade" }), getCategories({ type: "trade" })]);
    await getCategories({ type: "trade" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getCategories();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/public/categories", { credentials: "omit" });
  });

  it("API 실패 시 기존 직접 조회로 폴백한다(같은 결과 모양)", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ ok: false }) });
    directQuery.mockResolvedValue({ data: [row("d")], error: null });
    const { getCategories } = await import("@/lib/categories/getCategories");
    const list = await getCategories({ type: "trade" });
    expect(list.map((c) => c.id)).toEqual(["d"]);
    expect(directQuery).toHaveBeenCalled();
  });

  it("빈 목록은 캐시하지 않는다(다음 호출에서 다시 시도)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true, rows: [] }) });
    const { getCategories } = await import("@/lib/categories/getCategories");
    await getCategories({ type: "trade" });
    await getCategories({ type: "trade" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("비활성 포함 조회는 공개 API 를 쓰지 않는다", async () => {
    directQuery.mockResolvedValue({ data: [row("x")], error: null });
    const { getCategories } = await import("@/lib/categories/getCategories");
    const list = await getCategories({ activeOnly: false });
    expect(list.map((c) => c.id)).toEqual(["x"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
