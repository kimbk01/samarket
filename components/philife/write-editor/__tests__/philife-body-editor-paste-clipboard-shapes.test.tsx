// @vitest-environment jsdom
/**
 * 라운지 글쓰기 붙여넣기 — 클립보드 모양별 사진 처리 (감사 docs/audit/lounge-paste-images-2026-11-20.md §1-2).
 * 실제 편집기에 `paste` 이벤트(clipboardData 포함)를 넣어 ProseMirror 붙여넣기 경로 전체를 지난다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import PhilifeBodyEditor, {
  type PhilifeBodyEditorUploadResult,
} from "@/components/philife/write-editor/PhilifeBodyEditor";
import type { RichDocSnapshot } from "@/lib/philife/write-editor/rich-codec";
import { richBlocksToEditorDoc } from "@/lib/philife/write-editor/rich-codec";
import { analyzePastedHtmlForEditor, plainImageLinesToMarkdown } from "@/lib/philife/write-editor/paste-html";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (typeof (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent === "undefined") {
  (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent = class extends Event {
    clipboardData = null;
  };
}
const EMPTY_RECT = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
if (typeof Range !== "undefined") {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  }
  if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => EMPTY_RECT;
}
beforeAll(() => {
  /** jsdom 에 없는 blob 주소 — 파일 사진 미리보기 */
  const u = URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (s: string) => void };
  if (!u.createObjectURL) u.createObjectURL = () => "blob:test";
  if (!u.revokeObjectURL) u.revokeObjectURL = () => {};
});

const OWNER = "11111111-1111-4111-8111-111111111111";
const HOSTED = (kind: "import" | "file", n: number) =>
  `https://p.supabase.co/storage/v1/object/public/post-images/${OWNER}/community/${kind === "import" ? "import/" : ""}0000000${n}-0000-4000-8000-000000000000.webp`;

const LABELS = {
  placeholder: "내용",
  uploading: "업로드 중",
  failed: "실패",
  retry: "다시",
  remove: "삭제",
  moveUp: "위로",
  moveDown: "아래로",
  imageLimit: "10장",
  imageUnfetchable: (n: number) => `가져올 수 없음 ${n}`,
  caption: "설명",
  captionEdit: "설명 쓰기",
  captionSheetTitle: "사진 설명",
  captionDone: "완료",
  heading: "소제목",
  headingGlyph: "제목",
  bold: "굵게",
  italic: "기울임",
  bulletList: "목록",
  orderedList: "번호",
  quote: "인용",
};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function mount(opts: { rehostFails?: boolean } = {}) {
  const snaps: RichDocSnapshot[] = [];
  const notices: string[] = [];
  const rehost = vi.fn(async (url: string, pageReferer?: string): Promise<PhilifeBodyEditorUploadResult> => {
    void url;
    void pageReferer;
    return opts.rehostFails ? { ok: false, error: "가져오기 실패" } : { ok: true, url: HOSTED("import", rehost.mock.calls.length) };
  });
  const uploadFile = vi.fn(async (f: File): Promise<PhilifeBodyEditorUploadResult> => {
    void f;
    return { ok: true, url: HOSTED("file", uploadFile.mock.calls.length) };
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <PhilifeBodyEditor
        initialDoc={richBlocksToEditorDoc([])}
        ownerUserId={OWNER}
        maxImages={10}
        labels={LABELS}
        uploadFile={uploadFile}
        rehostUrl={rehost}
        onChange={(s) => snaps.push(s)}
        onNotice={(m) => notices.push(m)}
        onReady={() => {}}
        formatToolbarHost={null}
      />
    );
  });
  await settle();
  const editor = (host.querySelector(".ProseMirror") as unknown as { editor: Editor }).editor;
  return { editor, notices, rehost, uploadFile, last: () => snaps[snaps.length - 1]! };
}

type Clip = { plain?: string; html?: string; files?: File[] };

async function paste(editor: Editor, d: Clip) {
  const files = d.files ?? [];
  const clipboardData = {
    getData: (t: string) => (t === "text/plain" ? (d.plain ?? "") : t === "text/html" ? (d.html ?? "") : ""),
    files: Object.assign([...files], { item: (i: number) => files[i] ?? null }),
    items: files.map((f) => ({ kind: "file", type: f.type, getAsFile: () => f })),
    types: [] as string[],
  };
  const ev = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(ev, "clipboardData", { value: clipboardData });
  await act(async () => {
    editor.view.dom.dispatchEvent(ev);
  });
  await settle();
  await settle();
}

const png = (name = "a.png") => new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" });
const imgs = (s: RichDocSnapshot) => s.blocks.filter((b) => b.t === "img") as Array<{ t: "img"; url: string }>;
const text = (s: RichDocSnapshot) => s.content;

describe("붙여넣기 클립보드 모양별 — 사진은 사진으로 (감사 2026-11-20 §1-2)", () => {
  it("A1 글자만: 사진 주소 한 줄 → 사진으로 가져온다(주소 글자 안 남음)", async () => {
    const { editor, rehost, last } = await mount();
    await paste(editor, { plain: "앞\nhttps://images.example.com/a.jpg\n뒤" });
    expect(rehost.mock.calls.map((c) => c[0])).toEqual(["https://images.example.com/a.jpg"]);
    expect(imgs(last())).toHaveLength(1);
    expect(text(last())).not.toContain("images.example.com");
    expect(last().blocks.map((b) => b.t)).toEqual(["p", "img", "p"]);
  });

  it("A2 글자만: `[글](사진주소)` 한 줄 → 사진(글은 설명 아닌 대체글)", async () => {
    const { editor, rehost, last } = await mount();
    await paste(editor, { plain: "앞\n[성당 사진](https://images.example.com/a.png?w=800)\n뒤" });
    expect(rehost).toHaveBeenCalledTimes(1);
    expect(imgs(last())).toHaveLength(1);
  });

  it("A2' 문장 속 링크·확장자 없는 주소는 링크로 둔다", async () => {
    const { editor, rehost, last } = await mount();
    await paste(editor, { plain: "자세히는 [여기](https://images.example.com/a.jpg) 참고\nhttps://www.fda.gov.ph/" });
    expect(rehost).not.toHaveBeenCalled();
    expect(imgs(last())).toHaveLength(0);
  });

  it("A3 HTML: 사진 주소 링크(글자 = 주소) → 사진, 다른 글자 링크는 그대로", async () => {
    const { editor, rehost, last } = await mount();
    await paste(editor, {
      plain: "x",
      html: `<p>앞</p><p><a href="https://images.example.com/a.jpg">https://images.example.com/a.jpg</a></p><p><a href="https://images.example.com/b.jpg">원본 보기</a></p>`,
    });
    expect(rehost.mock.calls.map((c) => c[0])).toEqual(["https://images.example.com/a.jpg"]);
    expect(imgs(last())).toHaveLength(1);
    expect(last().blocks.some((b) => b.t === "p" && b.runs?.some((r) => r.href === "https://images.example.com/b.jpg"))).toBe(true);
  });

  it("A3' HTML: 글자가 사진 주소 하나뿐인 줄 → 사진", async () => {
    const { editor, rehost } = await mount();
    await paste(editor, { plain: "x", html: `<p>앞</p><p>https://images.example.com/c.webp</p><p>뒤</p>` });
    expect(rehost.mock.calls.map((c) => c[0])).toEqual(["https://images.example.com/c.webp"]);
  });

  it("B 파일 1개 + HTML 사진 3장 → 사진 3장이 글 사이 제자리에, 파일은 올리지 않음", async () => {
    const { editor, rehost, uploadFile, last } = await mount();
    await paste(editor, {
      plain: "본문",
      html: `<p>본문1</p><img src="https://cdn.example.com/1.jpg"><p>본문2</p><img src="https://cdn.example.com/2.jpg"><img src="https://cdn.example.com/3.jpg">`,
      files: [png()],
    });
    expect(rehost).toHaveBeenCalledTimes(3);
    expect(uploadFile).not.toHaveBeenCalled();
    expect(last().blocks.map((b) => b.t)).toEqual(["p", "img", "p", "img", "img"]);
    expect(last().uploadingCount).toBe(0);
  });

  it("B' 웹 사진 「이미지 복사」(주소 + 파일): 주소 가져오기가 실패하면 함께 온 파일을 올린다", async () => {
    const { editor, rehost, uploadFile, last } = await mount({ rehostFails: true });
    await paste(editor, { plain: "", html: `<img src="https://cdn.example.com/protected.jpg">`, files: [png()] });
    expect(rehost).toHaveBeenCalledTimes(1);
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(imgs(last()).map((b) => b.url)).toEqual([HOSTED("file", 1)]);
    expect(last().failedCount).toBe(0);
  });

  it("B'' 파일 + 가져올 수 없는 HTML 사진만(blob) → 지금처럼 파일을 올린다", async () => {
    const { editor, rehost, uploadFile, notices, last } = await mount();
    await paste(editor, { plain: "", html: `<img src="blob:https://site/abc">`, files: [png()] });
    expect(rehost).not.toHaveBeenCalled();
    expect(uploadFile).toHaveBeenCalledTimes(1);
    expect(imgs(last())).toHaveLength(1);
    expect(notices.filter((n) => n.startsWith("가져올 수 없음"))).toEqual([]);
  });

  it("C 버튼 안 사진 → 사진은 남는다", async () => {
    const { editor, rehost } = await mount();
    await paste(editor, { plain: "x", html: `<p>앞</p><button type="button"><img src="https://cdn.example.com/btn.jpg" width="300"></button><p>뒤</p>` });
    expect(rehost.mock.calls.map((c) => c[0])).toEqual(["https://cdn.example.com/btn.jpg"]);
  });

  it("D·E 상대 주소·blob 사진 → 조용히 버리지 않고 안내", async () => {
    const { editor, rehost, notices, last } = await mount();
    await paste(editor, { plain: "x", html: `<p>앞</p><img src="/backend-api/content?id=1"><img src="blob:https://site/abc"><p>뒤</p>` });
    expect(rehost).not.toHaveBeenCalled();
    expect(imgs(last())).toHaveLength(0);
    expect(notices).toContain("가져올 수 없음 2");
  });

  it("F `<picture><source srcset>` 만 → 가장 큰 사진", async () => {
    const { editor, rehost } = await mount();
    await paste(editor, {
      plain: "x",
      html: `<picture><source srcset="https://cdn.example.com/s-400.webp 400w, https://cdn.example.com/s-1200.webp 1200w"><img alt="a"></picture><p>끝</p>`,
    });
    expect(rehost.mock.calls.map((c) => c[0])).toEqual(["https://cdn.example.com/s-1200.webp"]);
  });

  it("G `<img srcset>` 만(src 는 작은 data 자리표시) → srcset 의 큰 사진", async () => {
    const { editor, rehost } = await mount();
    await paste(editor, {
      plain: "x",
      html: `<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" srcset="https://cdn.example.com/s1.jpg 1x, https://cdn.example.com/s2.jpg 2x"><p>끝</p>`,
    });
    expect(rehost.mock.calls.map((c) => c[0])).toEqual(["https://cdn.example.com/s2.jpg"]);
  });

  it("H 글자 없이 크기만 있는 칸의 CSS 배경 사진 → 사진, 글이 있는 칸은 그대로", async () => {
    const { editor, rehost, last } = await mount();
    await paste(editor, {
      plain: "x",
      html: `<div style="background-image:url('https://cdn.example.com/bg.jpg');width:300px;height:200px"></div><div style="background:url(https://cdn.example.com/deco.png)">글 있는 칸</div>`,
    });
    expect(rehost.mock.calls.map((c) => c[0])).toEqual(["https://cdn.example.com/bg.jpg"]);
    expect(text(last())).toContain("글 있는 칸");
  });

  it("I 일반 `<img src>` → 제자리 사진 (기존 동작 유지)", async () => {
    const { editor, rehost, last } = await mount();
    await paste(editor, { plain: "x", html: `<p>앞</p><img src="https://cdn.example.com/ok.jpg"><p>뒤</p>` });
    expect(rehost).toHaveBeenCalledTimes(1);
    expect(last().blocks.map((b) => b.t)).toEqual(["p", "img", "p"]);
  });
});

describe("paste-html 단위", () => {
  it("analyzePastedHtmlForEditor: 사진 주소를 글 순서대로 돌려준다", () => {
    const r = analyzePastedHtmlForEditor(
      `<p><a href="https://x.com/a.jpg">https://x.com/a.jpg</a></p><img src="https://x.com/b.png"><p>https://x.com/c.webp</p><img src="/rel.jpg">`
    );
    expect(r.imageUrls).toEqual(["https://x.com/a.jpg", "https://x.com/b.png", "https://x.com/c.webp"]);
    expect(r.unfetchable).toBe(1);
  });

  it("plainImageLinesToMarkdown: 줄 전체만 바꾼다", () => {
    expect(plainImageLinesToMarkdown("a\nhttps://x.com/p.JPG\n[설명](https://x.com/q.heic)\n보기 https://x.com/r.jpg\nhttps://x.com/page")).toBe(
      "a\n![](https://x.com/p.JPG)\n![설명](https://x.com/q.heic)\n보기 https://x.com/r.jpg\nhttps://x.com/page"
    );
  });
});
