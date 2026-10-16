import { describe, expect, it } from "vitest";
import { isDibayPostImageUrl, sanitizeImportedContentBlocks } from "@/lib/community/imported-content-blocks";
import { blocksToCommunityMarkdown } from "@/lib/community-operator-import/draft-apply";
import { htmlToBlocks } from "@/lib/community-operator-import/normalize";
import { toImportedRichBlocks } from "@/lib/community-operator-import/publish-content";

const HTML = `
  <h2>세부 호핑투어</h2>
  <p>오전 8시 출발</p>
  <figure><img src="https://src.example/a.jpg" alt="바다"><figcaption>막탄 바다</figcaption></figure>
  <ul><li>여권</li><li>현금</li></ul>
  <blockquote>일찍 출발하세요</blockquote>
  <table><tr><th>항목</th><th>비용</th></tr><tr><td>투어</td><td>2,500 PHP</td></tr></table>
  <table><tr><td>레이아웃 표 안의 문장</td></tr></table>`;

describe("structure preservation", () => {
  const blocks = htmlToBlocks(HTML, { baseUrl: "https://src.example/post/1" });

  it("keeps headings, lists, quotes, tables and image captions", () => {
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "image", "list", "quote", "table", "paragraph"]);
    expect(blocks[2]).toMatchObject({ type: "image", caption: "막탄 바다" });
    expect(blocks[5]).toEqual({ type: "table", rows: [["항목", "비용"], ["투어", "2,500 PHP"]], header: true });
    // a one-column layout table is ordinary text, not a grid
    expect(blocks[6]).toEqual({ type: "paragraph", text: "레이아웃 표 안의 문장" });
  });

  it("the plain-text body stays readable (table rows, captions)", () => {
    const md = blocksToCommunityMarkdown(blocks);
    expect(md).toContain("항목 | 비용\n투어 | 2,500 PHP");
    expect(md).toContain("![](https://src.example/a.jpg)\n\n막탄 바다");
  });

  it("rich blocks keep only DIBAY image copies and safe links", () => {
    const rich = toImportedRichBlocks([...blocks, { type: "link", href: "javascript:alert(1)", text: "x" }, { type: "link", href: "https://ok.example/", text: "안내" }]);
    const dibay = "https://p.supabase.co/storage/v1/object/public/post-images/u/community/import/1.webp";
    const remapped = rich.map((b) => (b.t === "img" ? { ...b, url: dibay } : b));
    const safe = sanitizeImportedContentBlocks(remapped);
    expect(safe.map((b) => b.t)).toEqual(["h", "p", "img", "ul", "quote", "table", "p", "link"]);
    expect(safe.find((b) => b.t === "link")).toEqual({ t: "link", href: "https://ok.example/", text: "안내" });
    // a source (hot-link) image URL never survives
    expect(sanitizeImportedContentBlocks(rich).some((b) => b.t === "img")).toBe(false);
  });

  it("sanitizer rejects malformed input", () => {
    expect(sanitizeImportedContentBlocks("nope")).toEqual([]);
    expect(sanitizeImportedContentBlocks([{ t: "script", text: "x" }, { t: "p", text: "  " }, null])).toEqual([]);
    expect(isDibayPostImageUrl("https://evil.example/a.jpg")).toBe(false);
  });
});
