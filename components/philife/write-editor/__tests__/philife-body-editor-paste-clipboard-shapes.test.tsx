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
import { pickLargestSrcsetUrl } from "@/lib/philife/interleaved-body-markdown";

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

async function mount(opts: { rehostFails?: boolean; maxImages?: number } = {}) {
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
        maxImages={opts.maxImages ?? 10}
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

describe("검증 2026-11-20 — 구현 결함 재발 방지", () => {
  it("V1 끌어넣기 등으로 남은 HTML 분석이 다음 평문 붙여넣기에 잘못된 안내를 내지 않는다", async () => {
    const { editor, notices } = await mount();
    const transform = editor.view.someProp("transformPastedHTML") as unknown as (h: string, v: unknown) => string;
    transform(`<img src="/rel.jpg">`, editor.view);
    await paste(editor, { plain: "그냥 글" });
    expect(notices).toEqual([]);
  });

  it("V2 주소 안 괄호가 있는 사진 주소 줄 → 사진 문법 글자가 남지 않고 사진으로", async () => {
    const { editor, rehost, last } = await mount();
    await paste(editor, { plain: "앞\nhttps://upload.example.org/File_(1).jpg\n[설명](https://upload.example.org/B_(2).png)\n뒤" });
    expect(rehost.mock.calls.map((c) => c[0])).toEqual([
      "https://upload.example.org/File_%281%29.jpg",
      "https://upload.example.org/B_%282%29.png",
    ]);
    expect(imgs(last())).toHaveLength(2);
    expect(last().blocks.some((b) => b.t === "p" && b.text.includes("!["))).toBe(false);
  });

  it("V3 사진 줄이 섞인 평문 — 다른 줄 주소는 기본 붙여넣기처럼 링크로 남는다", async () => {
    const { editor, last } = await mount();
    await paste(editor, { plain: "참고 https://www.fda.gov.ph/ 사이트\nhttps://images.example.com/a.jpg\nhttps://doh.gov.ph/" });
    const hrefs = last().blocks.flatMap((b) => (b.t === "p" ? (b.runs ?? []).map((r) => r.href).filter(Boolean) : []));
    expect(hrefs).toEqual(["https://www.fda.gov.ph/", "https://doh.gov.ph/"]);
    expect(imgs(last())).toHaveLength(1);
  });

  it("V3' 사진 파일 + 글 붙여넣기 — 글 속 주소도 링크로 남는다", async () => {
    const { editor, last } = await mount();
    await paste(editor, { plain: "출처 https://psa.gov.ph/ 참고", files: [png()] });
    const hrefs = last().blocks.flatMap((b) => (b.t === "p" ? (b.runs ?? []).map((r) => r.href).filter(Boolean) : []));
    expect(hrefs).toEqual(["https://psa.gov.ph/"]);
  });

  it("V4 깊게 중첩된 HTML 도 사진 주소 줄 찾기가 줄마다 하위 전체를 다시 훑지 않는다", () => {
    let nested = "<p>https://x.com/last.jpg</p>";
    for (let i = 0; i < 300; i++) nested = `<div><p>문단 ${i} <a href="https://x.com/${i}">링크</a></p>${nested}</div>`;
    const r = analyzePastedHtmlForEditor(nested);
    expect(r.imageUrls).toEqual(["https://x.com/last.jpg"]);
  });
});

/** Android 키보드 클립보드 칩: `paste` 없이 `beforeinput` `insertText` 로 글 전체가 들어온다 (실기 2026-11-20 D3) */
async function keyboardInsert(editor: Editor, data: string, opts: { isComposing?: boolean } = {}) {
  const ev = new InputEvent("beforeinput", {
    inputType: "insertText",
    data,
    isComposing: opts.isComposing ?? false,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    editor.view.dom.dispatchEvent(ev);
  });
  await settle();
  await settle();
  return ev;
}

describe("키보드 클립보드 칩(beforeinput insertText) — 붙여넣기와 같게 (실기 2026-11-20 D3)", () => {
  it("D3a 여러 줄 + 사진 주소 줄 → 사진으로 가져오고, 다른 줄 주소는 링크", async () => {
    const { editor, rehost, last } = await mount();
    const ev = await keyboardInsert(editor, "칩 시험\nhttps://upload.wikimedia.org/wikipedia/commons/0/05/Hangars.jpg\n끝 https://www.wikipedia.org/");
    expect(ev.defaultPrevented).toBe(true);
    expect(rehost.mock.calls.map((c) => c[0])).toEqual(["https://upload.wikimedia.org/wikipedia/commons/0/05/Hangars.jpg"]);
    expect(imgs(last())).toHaveLength(1);
    expect(last().blocks.some((b) => b.t === "p" && b.text.includes("upload.wikimedia.org"))).toBe(false);
    const hrefs = last().blocks.flatMap((b) => (b.t === "p" ? (b.runs ?? []).map((r) => r.href).filter(Boolean) : []));
    expect(hrefs).toEqual(["https://www.wikipedia.org/"]);
  });

  it("D3b 여러 줄 일반 글 → 붙여넣기와 같게 문단·링크로", async () => {
    const { editor, rehost, last } = await mount();
    const ev = await keyboardInsert(editor, "첫 줄 https://psa.gov.ph/\n둘째 줄");
    expect(ev.defaultPrevented).toBe(true);
    expect(rehost).not.toHaveBeenCalled();
    expect(last().blocks.map((b) => (b.t === "p" ? b.text : b.t))).toEqual(["첫 줄 https://psa.gov.ph/", "둘째 줄"]);
    const hrefs = last().blocks.flatMap((b) => (b.t === "p" ? (b.runs ?? []).map((r) => r.href).filter(Boolean) : []));
    expect(hrefs).toEqual(["https://psa.gov.ph/"]);
  });

  it("D3c 사진 파일 주소 하나만 → 사진", async () => {
    const { editor, rehost, last } = await mount();
    const ev = await keyboardInsert(editor, "https://cdn.example.com/only.png");
    expect(ev.defaultPrevented).toBe(true);
    expect(rehost).toHaveBeenCalledTimes(1);
    expect(imgs(last())).toHaveLength(1);
  });

  it("D3d 한 글자 입력·한글 조합 중·한 줄 일반 글은 건드리지 않는다", async () => {
    const { editor, rehost } = await mount();
    expect((await keyboardInsert(editor, "a")).defaultPrevented).toBe(false);
    expect((await keyboardInsert(editor, "한\n글", { isComposing: true })).defaultPrevented).toBe(false);
    expect((await keyboardInsert(editor, "그냥 한 줄 https://psa.gov.ph/")).defaultPrevented).toBe(false);
    expect(rehost).not.toHaveBeenCalled();
  });
});

describe("R1 붙인 사진은 쓸 수 있는 가장 큰 크기로 (실기 2026-11-20 D1: 250px 미리보기로 들어옴)", () => {
  it("src 가 작은 미리보기여도 srcset 의 큰 사진을 가져온다", () => {
    const r = analyzePastedHtmlForEditor(
      `<img src="//thumb.example.org/a/250px-A.jpg" srcset="//thumb.example.org/a/375px-A.jpg 1.5x, //thumb.example.org/a/500px-A.jpg 2x" width="250">`
    );
    expect(r.imageUrls).toEqual(["https://thumb.example.org/a/500px-A.jpg"]);
  });

  it("w 설명자: 2560w 이하 중 가장 큰 것, 모두 넘으면 가장 작은 것", () => {
    expect(pickLargestSrcsetUrl("a.jpg 640w, b.jpg 2048w, c.jpg 4096w")).toBe("b.jpg");
    expect(pickLargestSrcsetUrl("c.jpg 4096w, d.jpg 3000w")).toBe("d.jpg");
    expect(pickLargestSrcsetUrl("e.jpg")).toBe("e.jpg");
  });
});

describe("R3 같은 붙여넣기의 안내는 한 번에 (감사 §11 R3)", () => {
  it("상한 초과 + 가져올 수 없는 사진 → 두 안내가 한 줄로 한 번", async () => {
    const { editor, notices } = await mount({ maxImages: 1 });
    await paste(editor, {
      plain: "x",
      html: `<img src="https://cdn.example.com/1.jpg"><img src="https://cdn.example.com/2.jpg"><img src="blob:https://site/x">`,
    });
    expect(notices).toEqual(["가져올 수 없음 1 10장"]);
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
