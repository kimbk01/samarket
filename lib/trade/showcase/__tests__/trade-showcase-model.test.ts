import { describe, expect, it } from "vitest";
import {
  parseTradeShowcaseInput,
  planTradeShowcaseInterleave,
} from "@/lib/trade/showcase/trade-showcase-model";

describe("trade showcase (P-7)", () => {
  it("requires a title and normalizes price/images", () => {
    expect(parseTradeShowcaseInput({ title: "  " })).toEqual({ ok: false, error: "title_required" });
    const r = parseTradeShowcaseInput({
      title: " 원목 의자 ",
      price: "2,500",
      image_urls: ["https://x/a.webp", "javascript:alert(1)", 3],
      trade_category_id: "",
      is_active: false,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.title).toBe("원목 의자");
      expect(r.value.price).toBe(2500);
      expect(r.value.image_urls).toEqual(["https://x/a.webp"]);
      expect(r.value.trade_category_id).toBeNull();
      expect(r.value.is_active).toBe(false);
    }
  });

  it("rejects bad price, category and too many images", () => {
    expect(parseTradeShowcaseInput({ title: "a", price: -1 })).toEqual({ ok: false, error: "invalid_price" });
    expect(parseTradeShowcaseInput({ title: "a", trade_category_id: "x" })).toEqual({ ok: false, error: "invalid_category" });
    const many = Array.from({ length: 11 }, (_, i) => `https://x/${i}.webp`);
    expect(parseTradeShowcaseInput({ title: "a", image_urls: many })).toEqual({ ok: false, error: "too_many_images" });
  });

  it("샘플 섞기: 판매중 실제 글 4개마다 1개, 판매완료 사이엔 넣지 않음, 남은 샘플은 rest", () => {
    const posts = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, status: i >= 8 ? "sold" : "active" }));
    const plan = planTradeShowcaseInterleave(posts, ["s0", "s1", "s2", "s3"]);
    expect([...plan.afterPostId.entries()]).toEqual([
      ["p3", "s0"],
      ["p7", "s1"],
    ]);
    expect(plan.rest).toEqual(["s2", "s3"]);
  });

  it("실제 글이 없으면 모든 샘플이 rest", () => {
    const plan = planTradeShowcaseInterleave([], ["a", "b"]);
    expect(plan.afterPostId.size).toBe(0);
    expect(plan.rest).toEqual(["a", "b"]);
  });

  it("목록 두 곳이 같은 섞기 규칙을 쓴다", async () => {
    const { readFileSync } = await import("node:fs");
    for (const f of ["components/home/HomeProductList.tsx", "components/post/PostListByCategory.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src).toContain("planTradeShowcaseInterleave(");
      expect(src).toContain("<TradeShowcaseCard");
      expect(src).toContain("useTradeShowcaseItems(");
    }
    /** 지역에 글이 없을 때도 샘플(주제 목록 · 홈 목록) */
    const cat = readFileSync("components/post/PostListByCategory.tsx", "utf8");
    expect(cat.split("<TradeShowcaseGrid").length - 1).toBeGreaterThanOrEqual(3);
  });
});
