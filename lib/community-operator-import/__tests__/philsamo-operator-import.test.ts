import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  parsePhilsamoTravelDetailHtml,
  parsePhilsamoTravelListHtml,
} from "@/lib/community-operator-import/philsamo-travel";
import {
  assertPublishGuards,
  buildAppliedContentBlocks,
  collectOrderedImageUrlsForFeed,
  defaultOperatorDraftEdit,
} from "@/lib/community-operator-import/draft-apply";

const proofDir = join(process.cwd(), ".tmp/phase-b-philsamo-proof");

describe("community-operator-import philsamo travel", () => {
  it("parses real list HTML into selectable rows", () => {
    const listPath = join(proofDir, "list-travel-p1.html");
    if (!existsSync(listPath)) return;
    const rows = parsePhilsamoTravelListHtml(readFileSync(listPath, "utf8"));
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(rows[0]?.articleKey).toMatch(/^\d+$/);
    expect(rows.some((r) => r.articleKey === "71")).toBe(true);
  });

  it("parses article 71 detail with body + 11 images in order", () => {
    const detailPath = join(proofDir, "detail-71.html");
    if (!existsSync(detailPath)) return;
    const article = parsePhilsamoTravelDetailHtml(readFileSync(detailPath, "utf8"), "71");
    expect(article.title).toContain("오카다");
    expect(article.author).toBeTruthy();
    expect(article.sourcePublishedDate).toBeTruthy();
    const images = article.orderedContentBlocks.filter((b) => b.type === "image");
    const paras = article.orderedContentBlocks.filter((b) => b.type === "paragraph");
    expect(images.length).toBe(11);
    expect(paras.length).toBeGreaterThan(5);
    // semantic interleave: some paragraph before/after image
    let interleaved = false;
    for (let i = 0; i < article.orderedContentBlocks.length - 1; i++) {
      const a = article.orderedContentBlocks[i];
      const b = article.orderedContentBlocks[i + 1];
      if (a.type === "paragraph" && b.type === "image") interleaved = true;
      if (a.type === "image" && b.type === "paragraph") interleaved = true;
    }
    expect(interleaved).toBe(true);
  });

  it("apply/replace/exclude images without silent rewrite of untouched text", () => {
    const detailPath = join(proofDir, "detail-71.html");
    if (!existsSync(detailPath)) return;
    const article = parsePhilsamoTravelDetailHtml(readFileSync(detailPath, "utf8"), "71");
    const edit = defaultOperatorDraftEdit(article);
    edit.displayTitle = `${article.title} 리조트`;
    edit.replaceFrom = "오카다 마닐라";
    edit.replaceTo = "오카다 마닐라 리조트";
    const imgIdx = article.orderedContentBlocks.findIndex((b) => b.type === "image");
    const lastImg = [...article.orderedContentBlocks.map((b, i) => ({ b, i }))]
      .filter((x) => x.b.type === "image")
      .at(-1);
    if (lastImg) edit.imageIncludes[String(lastImg.i)] = false;
    const applied = buildAppliedContentBlocks(article, edit);
    expect(applied.filter((b) => b.type === "image").length).toBe(10);
    expect(applied.some((b) => b.type === "paragraph" && b.text.includes("오카다 마닐라 리조트"))).toBe(true);
    expect(imgIdx).toBeGreaterThanOrEqual(0);
  });

  it("publish guards require selection + topic and reject empty", () => {
    expect(assertPublishGuards({ selectedArticleKeys: [], topicId: "t", topicSlug: "travel" }).ok).toBe(false);
    expect(assertPublishGuards({ selectedArticleKeys: ["71"], topicId: null, topicSlug: null }).ok).toBe(false);
    expect(assertPublishGuards({ selectedArticleKeys: ["71"], topicId: "t", topicSlug: "travel" }).ok).toBe(true);
  });

  it("supports block exclude, text override, and thumbnail-first image list", () => {
    const detailPath = join(proofDir, "detail-71.html");
    if (!existsSync(detailPath)) return;
    const article = parsePhilsamoTravelDetailHtml(readFileSync(detailPath, "utf8"), "71");
    const edit = defaultOperatorDraftEdit(article);
    const firstPara = article.orderedContentBlocks.findIndex((b) => b.type === "paragraph");
    if (firstPara >= 0) {
      edit.blockExcludes = { [String(firstPara)]: true };
    }
    const imgs = article.orderedContentBlocks
      .map((b, i) => ({ b, i }))
      .filter((x) => x.b.type === "image");
    if (imgs.length >= 2) {
      edit.thumbnailImageIndex = imgs[1]!.i;
      edit.imageOrder = [imgs[1]!.i, imgs[0]!.i, ...imgs.slice(2).map((x) => x.i)];
    }
    const applied = buildAppliedContentBlocks(article, edit);
    if (firstPara >= 0) {
      expect(applied.some((b) => b.type === "paragraph" && b.text === (article.orderedContentBlocks[firstPara] as { text: string }).text)).toBe(
        false,
      );
    }
    const urls = collectOrderedImageUrlsForFeed(article, edit, applied);
    if (imgs.length >= 2) {
      expect(urls[0]).toBe((imgs[1]!.b as { url: string }).url);
    }
  });
});

describe("community-operator-import operator model contract", () => {
  it("Admin operator page exists and forbids OLD 8-step card labels", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin/community/AdminExternalImportOperatorPage.tsx"),
      "utf8",
    );
    expect(src).toContain("게시물 목록");
    expect(src).toContain("원문 미리보기");
    expect(src).toContain("수정/치환");
    expect(src).toContain("임시저장");
    expect(src).toContain("게시");
    expect(src).not.toMatch(/1\s*국가/);
    expect(src).not.toMatch(/8\s*게시/);
    expect(src).not.toMatch(/\bworker\b/i);
    expect(src).not.toMatch(/\bclaim\b/i);
  });
});
