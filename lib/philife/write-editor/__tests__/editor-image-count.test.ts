import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EditorImageCounter } from "@/lib/philife/write-editor/editor-image-count";
import { COMMUNITY_IMAGE_NODE } from "@/lib/philife/write-editor/content-codec";
import { editorDocToRichSnapshot, type EditorJsonNode } from "@/lib/philife/write-editor/rich-codec";
import { mergePostBodyImages } from "@/lib/philife/post-body-images";

const A = "https://x.supabase.co/storage/v1/object/public/post-images/u/community/a.webp";
const B = "https://x.supabase.co/storage/v1/object/public/post-images/u/community/b.webp";

const img = (attrs: Record<string, unknown>): EditorJsonNode => ({ type: COMMUNITY_IMAGE_NODE, attrs });

describe("편집기 사진 수 — 같은 주소 1장 (저장 기준과 같음 · 재감사 불일치 3)", () => {
  it("업로드가 끝난 같은 주소는 1장 · 업로드 중·실패는 칸마다 1장", () => {
    const c = new EditorImageCounter();
    expect(c.add({ status: "done", src: A })).toBe(true);
    expect(c.add({ status: "done", src: A })).toBe(false);
    expect(c.add({ status: "done", src: ` ${A} ` })).toBe(false);
    expect(c.add({ status: "uploading", src: "" })).toBe(true);
    expect(c.add({ status: "failed", src: A })).toBe(true);
    expect(c.add({ status: "done", src: B })).toBe(true);
    expect(c.total).toBe(4);
    expect(c.wouldAdd({ status: "done", src: B })).toBe(false);
    expect(c.wouldAdd({ status: "uploading" })).toBe(true);
  });

  it("스냅샷 imageNodeCount = 저장될 사진 수(mergePostBodyImages)와 같다", () => {
    const doc: EditorJsonNode = {
      type: "doc",
      content: [
        img({ src: A, status: "done", alt: "" }),
        { type: "paragraph", content: [{ type: "text", text: "가" }] },
        img({ src: A, status: "done", alt: "" }),
        img({ src: B, status: "done", alt: "" }),
      ],
    };
    const snap = editorDocToRichSnapshot(doc);
    expect(snap.imageNodeCount).toBe(2);
    expect(snap.imageNodeCount).toBe(mergePostBodyImages({ content: snap.content, candidates: snap.imageUrls }).length);
  });

  it("업로드 중 사진은 주소가 없어도 1장으로 센다(10장 넘김 방지)", () => {
    const doc: EditorJsonNode = {
      type: "doc",
      content: [img({ src: A, status: "done" }), img({ src: "", status: "uploading", uploadId: "u1" })],
    };
    expect(editorDocToRichSnapshot(doc).imageNodeCount).toBe(2);
  });

  it("편집기 10장 판정 두 곳(붙여넣기·파일 넣기)이 같은 계산기를 쓴다", () => {
    const editor = readFileSync("components/philife/write-editor/PhilifeBodyEditor.tsx", "utf8");
    expect(editor.match(/new EditorImageCounter\(\)/g)?.length).toBe(2);
    expect(editor).not.toMatch(/if \(n\.type\.name === COMMUNITY_IMAGE_NODE\) total \+= 1;/);
  });
});
