import { describe, expect, it } from "vitest";
import { mergeTradeWriteImageUrlsInOrder } from "@/lib/posts/trade-write-image-order";
import { filterOwnPostImageUrls, isOwnPostImageUrl } from "@/lib/posts/own-post-image-url";
import {
  dropTradeMetaClears,
  mergeTradeMetaWithClears,
  withClearedTradeWriteMetaKeys,
  withExplicitTradeMetaClears,
} from "@/lib/trade/category-form/trade-write-owned-meta-keys";
import { mergeTradePostFromPatch } from "@/lib/trade/trade-lifecycle-policy";
import type { ResolvedTradeComposition } from "@/lib/trade/category-form/types";

const customComposition = { profileId: "custom", fields: [] } as unknown as ResolvedTradeComposition;

describe("G4 글쓰기·수정 데이터 일치", () => {
  it("TM-26: 대표 사진을 편집해 파일로 바뀌어도 화면 순서대로 저장한다", () => {
    const file = new File(["x"], "a.jpg");
    const items = [{ file, url: "blob:a" }, { url: "https://s/b.jpg" }, { url: "blob:stale" }];
    expect(mergeTradeWriteImageUrlsInOrder(items, ["https://s/a-edited.jpg"])).toEqual([
      "https://s/a-edited.jpg",
      "https://s/b.jpg",
    ]);
  });

  it("TM-05: 화면 필드 중 비운 키는 null 로 보내고, 서버는 null 키를 지운다", () => {
    const sent = withClearedTradeWriteMetaKeys(
      { deposit: "1000" },
      ["deposit", "management_fee", "has_premium"],
      customComposition
    );
    expect(sent).toEqual({ deposit: "1000", management_fee: null, has_premium: null });
    const merged = mergeTradeMetaWithClears(
      { deposit: "500", management_fee: "200", has_premium: true, trade_chat_call_policy: "allow" },
      sent
    );
    expect(merged).toEqual({ deposit: "1000", trade_chat_call_policy: "allow" });
  });

  it("TM-05: 확장 폼의 undefined 와 빠진 거래 장소는 삭제 요청이 된다", () => {
    expect(withExplicitTradeMetaClears({ company_name: undefined, pay_type: "daily" }, ["trade_meet_spot"])).toEqual({
      company_name: null,
      pay_type: "daily",
      trade_meet_spot: null,
    });
  });

  it("제한 수정 단계에서는 삭제 요청을 버린다", () => {
    expect(dropTradeMetaClears({ a: null, b: 1 })).toEqual({ b: 1 });
  });

  it("TM-06: 사진을 모두 지운 수정이면 썸네일도 비운다", () => {
    const before = {
      title: "t",
      content: "c",
      price: 1,
      region: "r",
      city: "c",
      trade_lgu_id: "l",
      trade_category_id: "cat",
      images: ["https://s/a.jpg"],
      thumbnail_url: "https://s/a.jpg",
      meta: {},
      is_free_share: false,
      is_price_offer: false,
    };
    const out = mergeTradePostFromPatch(before as never, { imageUrls: [] }, "general" as never);
    expect(out.images).toBeNull();
    expect(out.thumbnail_url).toBeNull();
    const untouched = mergeTradePostFromPatch(before as never, { title: "x" }, "general" as never);
    expect(untouched.thumbnail_url).toBe("https://s/a.jpg");
  });

  it("TM-22: 자사 Storage 의 작성자 폴더 URL 만 허용한다", () => {
    const origin = "https://proj.supabase.co";
    const own = `${origin}/storage/v1/object/public/post-images/u1/1-a.webp`;
    expect(isOwnPostImageUrl(own, "u1", origin)).toBe(true);
    expect(isOwnPostImageUrl(`${origin}/storage/v1/object/public/post-images/u2/1-a.webp`, "u1", origin)).toBe(false);
    expect(isOwnPostImageUrl("https://evil.example/x.jpg", "u1", origin)).toBe(false);
    expect(filterOwnPostImageUrls([own, "https://evil.example/x.jpg"], "u1", origin)).toEqual([own]);
  });
});
