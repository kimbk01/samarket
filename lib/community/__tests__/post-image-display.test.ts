import { describe, expect, it } from "vitest";
import {
  communityViewerDisplayUrl,
  postImageGridLayout,
  resolvePostImageSources,
} from "@/lib/community/post-image-display";

const ORIGINAL =
  "https://p.supabase.co/storage/v1/object/public/post-images/u1/community/abc.webp";

describe("resolvePostImageSources (D13)", () => {
  it("상세는 .detail 파생본, 실패 시 원본", () => {
    const s = resolvePostImageSources(ORIGINAL, "detail");
    expect(s.primary).toBe("https://p.supabase.co/storage/v1/object/public/post-images/u1/community/abc.detail.webp");
    expect(s.original).toBe(ORIGINAL);
  });
  it("격자 정사각 칸은 .feed(640 정사각) 파생본", () => {
    expect(resolvePostImageSources(ORIGINAL, "cell").primary).toBe(
      "https://p.supabase.co/storage/v1/object/public/post-images/u1/community/abc.feed.webp"
    );
  });
  it("GIF·외부 주소는 원본 그대로(재시도 없음)", () => {
    const gif = ORIGINAL.replace(".webp", ".gif");
    expect(resolvePostImageSources(gif, "detail")).toEqual({ primary: gif, original: gif });
    const ext = "https://cdn.example.com/a.jpg";
    expect(resolvePostImageSources(ext, "detail")).toEqual({ primary: ext, original: ext });
  });
  it("뷰어 화면용 주소 = 상세 파생본", () => {
    expect(communityViewerDisplayUrl(ORIGINAL)).toContain("abc.detail.webp");
  });
});

describe("postImageGridLayout — 페이스북형 배치", () => {
  it("0·1장은 격자 아님", () => {
    expect(postImageGridLayout(0)).toEqual({ kind: "single" });
    expect(postImageGridLayout(1)).toEqual({ kind: "single" });
  });
  it("칸 폭 합계가 줄마다 6(grid-cols-6)", () => {
    const width = { full: 6, half: 3, third: 2 } as const;
    for (let n = 2; n <= 12; n += 1) {
      const l = postImageGridLayout(n);
      if (l.kind !== "grid") throw new Error("grid");
      const total = l.cells.reduce((s, c) => s + width[c.span], 0);
      expect(total % 6).toBe(0);
      expect(l.cells.map((c) => c.index)).toEqual(l.cells.map((_, i) => i));
    }
  });
  it("3장 = 위 넓은 칸 1 + 아래 2, 5장 초과는 +n", () => {
    const three = postImageGridLayout(3);
    expect(three.kind === "grid" && three.cells[0]).toEqual({ index: 0, span: "full", shape: "wide" });
    const eight = postImageGridLayout(8);
    expect(eight.kind === "grid" && eight.cells.length).toBe(5);
    expect(eight.kind === "grid" && eight.hiddenCount).toBe(3);
  });
});
