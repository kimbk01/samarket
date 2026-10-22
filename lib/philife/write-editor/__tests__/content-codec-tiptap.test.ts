// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { CommunityImageNodeBase } from "@/lib/philife/write-editor/community-image-node";
import {
  communityBodyBlocksToDoc,
  communityDocToSnapshot,
  parseCommunityBodyToBlocks,
} from "@/lib/philife/write-editor/content-codec";

const IMG = "https://x.supabase.co/storage/v1/object/public/post-images/u1/community/a.webp";
let editors: Editor[] = [];
afterEach(() => {
  editors.forEach((e) => e.destroy());
  editors = [];
});

function openInEditor(content: string): Editor {
  const parsed = parseCommunityBodyToBlocks(content);
  if (!parsed.ok) throw new Error(parsed.reason);
  const ed = new Editor({
    extensions: [Document, Paragraph, Text, UndoRedo, CommunityImageNodeBase],
    content: communityBodyBlocksToDoc(parsed.blocks),
  });
  editors.push(ed);
  return ed;
}

describe("실제 ProseMirror 스키마 왕복 (Tiptap)", () => {
  it.each([
    "",
    "한 줄",
    "  앞뒤 공백  \n\t탭\n\n\n빈 줄",
    `글\n\n![](${IMG})\n\n다음 글`,
    `![alt](${IMG})\n![](${IMG})`,
    "https://youtu.be/dQw4w9WgXcQ\n#태그 😀",
  ])("무편집 = 원문 바이트 동일: %j", (c) => {
    const ed = openInEditor(c);
    expect(communityDocToSnapshot(ed.getJSON() as never).content).toBe(c);
  });

  it("글자만 수정해도 이미지·순서·URL 보존", () => {
    const ed = openInEditor(`첫 줄\n![](${IMG})\n마지막`);
    ed.commands.setTextSelection(4); // 「첫 줄」 끝 (문단 시작 1 + 3글자)
    ed.commands.insertContent("(수정)");
    const snap = communityDocToSnapshot(ed.getJSON() as never);
    expect(snap.content).toBe(`첫 줄(수정)\n![](${IMG})\n마지막`);
    expect(snap.imageUrls).toEqual([IMG]);
  });

  it("실행 취소로 원문 복구", () => {
    const ed = openInEditor(`a\n![](${IMG})`);
    ed.commands.setTextSelection(2);
    ed.commands.insertContent("b");
    ed.commands.undo();
    expect(communityDocToSnapshot(ed.getJSON() as never).content).toBe(`a\n![](${IMG})`);
  });
});
