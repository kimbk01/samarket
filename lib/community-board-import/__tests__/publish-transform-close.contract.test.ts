import { describe, expect, it } from "vitest";
import {
  applyBoardImportReplacement,
  articleDocumentStructureKey,
  articleDocumentToCommunityMarkdown,
  type ArticleDocument,
} from "@/lib/community-board-import";

function sampleDoc(): ArticleDocument {
  return {
    title: "Visit Philippines Travel",
    canonicalUrl: "https://example.com/a1",
    nodes: [
      { kind: "paragraph", text: "P1 from Department of Tourism" },
      { kind: "image", src: "https://cdn.example/a.jpg", imageId: "img-a", alt: "A" },
      { kind: "paragraph", text: "P2" },
      { kind: "image", src: "https://cdn.example/b.jpg", imageId: "img-b", alt: "B" },
      { kind: "paragraph", text: "P3" },
    ],
  };
}

describe("board-import publish transform close", () => {
  it("preview and publish share the same replacement + markdown transform", () => {
    const source = sampleDoc();
    const rules = [
      {
        id: "1",
        from_text: "Philippines Travel",
        to_text: "DIBAY",
        apply_title: true,
        apply_body: true,
        priority: 10,
        enabled: true,
      },
      {
        id: "2",
        from_text: "Department of Tourism",
        to_text: "DIBAY",
        apply_title: true,
        apply_body: true,
        priority: 20,
        enabled: true,
      },
    ];

    const preview = applyBoardImportReplacement({
      sourceTitle: source.title,
      sourceDocument: source,
      rules,
    });
    const publish = applyBoardImportReplacement({
      sourceTitle: source.title,
      sourceDocument: source,
      rules,
    });

    expect(preview.dibayTitle).toBe(publish.dibayTitle);
    expect(articleDocumentStructureKey(preview.dibayDocument)).toBe(
      articleDocumentStructureKey(publish.dibayDocument)
    );
    expect(articleDocumentStructureKey(preview.dibayDocument)).toBe(
      "paragraph|image:img-a|paragraph|image:img-b|paragraph"
    );
    expect(source.nodes[0]).toEqual({ kind: "paragraph", text: "P1 from Department of Tourism" });

    const mdPreview = articleDocumentToCommunityMarkdown(preview.dibayDocument);
    const mdPublish = articleDocumentToCommunityMarkdown(publish.dibayDocument);
    expect(mdPreview.content).toBe(mdPublish.content);
    expect(mdPreview.imageUrlsInOrder).toEqual([
      "https://cdn.example/a.jpg",
      "https://cdn.example/b.jpg",
    ]);
    expect(mdPreview.content.indexOf("![A](")).toBeLessThan(mdPreview.content.indexOf("![B]("));
    expect(mdPreview.content).toContain("P1 from DIBAY");
  });
});
