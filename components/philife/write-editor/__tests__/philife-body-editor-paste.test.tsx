// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import PhilifeBodyEditor, { type PhilifeBodyEditorApi } from "@/components/philife/write-editor/PhilifeBodyEditor";
import type { RichDocSnapshot } from "@/lib/philife/write-editor/rich-codec";
import { richBlocksToEditorDoc } from "@/lib/philife/write-editor/rich-codec";
import { sanitizePastedHtmlForEditor } from "@/lib/philife/write-editor/paste-html";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
/** jsdom 에 없는 ClipboardEvent — ProseMirror `view.pasteHTML` 이 만든다(클립보드 데이터 없이 HTML 경로) */
if (typeof (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent === "undefined") {
  (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent = class extends Event {
    clipboardData = null;
  };
}

const OWNER = "11111111-1111-4111-8111-111111111111";
const HOSTED = (n: number) =>
  `https://p.supabase.co/storage/v1/object/public/post-images/${OWNER}/community/import/0000000${n}-0000-4000-8000-000000000000.webp`;

const LABELS = {
  placeholder: "내용",
  uploading: "업로드 중",
  failed: "실패",
  retry: "다시",
  remove: "삭제",
  moveUp: "위로",
  moveDown: "아래로",
  imageLimit: "10장",
  caption: "설명",
  heading: "제목",
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

async function mount(opts: { maxImages?: number; doc?: Parameters<typeof richBlocksToEditorDoc>[0] } = {}) {
  const snaps: RichDocSnapshot[] = [];
  const notices: string[] = [];
  const rehost = vi.fn(async (url: string, pageReferer?: string) => {
    void pageReferer;
    void url;
    return { ok: true as const, url: HOSTED(rehost.mock.calls.length) };
  });
  let api: PhilifeBodyEditorApi | null = null;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <PhilifeBodyEditor
        initialDoc={richBlocksToEditorDoc(opts.doc ?? [])}
        ownerUserId={OWNER}
        maxImages={opts.maxImages ?? 10}
        labels={LABELS}
        uploadFile={async () => ({ ok: true, url: HOSTED(9) })}
        rehostUrl={rehost}
        onChange={(s) => snaps.push(s)}
        onNotice={(m) => notices.push(m)}
        onReady={(a) => {
          api = a;
        }}
      />
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  const editor = (host.querySelector(".ProseMirror") as unknown as { editor: Editor }).editor;
  return { editor, snaps, notices, rehost, api: () => api!, last: () => snaps[snaps.length - 1]! };
}

const ARTICLE = `
<style>p{color:red}</style><script>alert(1)</script>
<h1 class="x" style="font-size:40px">큰 제목</h1>
<p style="color:red">첫 <b>굵게</b> 문단 <a href="https://x.com/a" onclick="x()">링크</a> <a href="javascript:alert(1)">나쁜링크</a></p>
<ul><li>하나</li><li><i>둘</i></li></ul>
<figure><img data-src="https://cdn.example.com/a.jpg" src="data:image/gif;base64,R0lGOD" width="600"><figcaption>바닷가 사진</figcaption></figure>
<img src="https://cdn.example.com/pixel.gif" width="1" height="1">
<blockquote>인용 문장</blockquote>
<table><tr><th>이름</th><th>값</th></tr><tr><td>A</td><td>1</td></tr></table>
<p><span style="font-weight:700">구글문서 굵게</span></p>`;

describe("편집기 붙여넣기 — 다른 사이트 글 (승인 ① · D2/D3)", () => {
  it("구조 보존: 제목·굵게·링크·목록·사진(캡션)·인용·표, 위험 요소·외부 CSS 제거, 사진은 재호스팅", async () => {
    const { editor, last, rehost } = await mount();
    await act(async () => {
      editor.view.pasteHTML(ARTICLE);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(rehost).toHaveBeenCalledTimes(1);
    expect(rehost.mock.calls[0]![0]).toBe("https://cdn.example.com/a.jpg");
    const blocks = last().blocks;
    expect(blocks.map((b) => b.t)).toEqual(["h", "p", "ul", "img", "quote", "table", "p"]);
    expect(blocks[0]).toEqual({ t: "h", level: 2, text: "큰 제목" });
    expect(blocks[1]).toMatchObject({
      t: "p",
      runs: [{ text: "첫 " }, { text: "굵게", b: true }, { text: " 문단 " }, { text: "링크", href: "https://x.com/a" }, { text: " 나쁜링크" }],
    });
    expect(blocks[2]).toMatchObject({ t: "ul", items: ["하나", "둘"] });
    expect(blocks[3]).toMatchObject({ t: "img", caption: "바닷가 사진" });
    expect((blocks[3] as { url: string }).url).toBe(HOSTED(1));
    expect(blocks[5]).toEqual({ t: "table", rows: [["이름", "값"], ["A", "1"]], header: true });
    expect(blocks[6]).toMatchObject({ t: "p", runs: [{ text: "구글문서 굵게", b: true }] });
    expect(last().content).not.toMatch(/alert|color:red|cdn\.example\.com/);
    expect(last().uploadingCount).toBe(0);
  });

  it("편집 화면에 주소 문자열이 아니라 사진 미리보기로 보인다", async () => {
    const { editor, rehost } = await mount();
    rehost.mockImplementationOnce(() => new Promise(() => {})); // 업로드 진행 중 상태 유지
    await act(async () => {
      editor.view.pasteHTML(`<p>글</p><img src="https://cdn.example.com/b.jpg">`);
    });
    const img = host!.querySelector('[data-testid="editor-image"] img') as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("https://cdn.example.com/b.jpg");
    expect(host!.querySelector(".ProseMirror")!.textContent).not.toContain("https://");
  });

  it("10장 제한: 넘치는 붙여넣기 사진은 넣지 않고 안내", async () => {
    const { editor, last, notices, rehost } = await mount({ maxImages: 2 });
    await act(async () => {
      editor.view.pasteHTML(
        ["a", "b", "c"].map((x) => `<img src="https://cdn.example.com/${x}.jpg">`).join("<p>t</p>")
      );
    });
    expect(rehost).toHaveBeenCalledTimes(2);
    expect(last().imageNodeCount).toBe(2);
    expect(notices).toContain("10장");
  });

  it("본인 DIBAY 사진은 다시 올리지 않는다", async () => {
    const own = HOSTED(7);
    const { editor, rehost, last } = await mount();
    await act(async () => {
      editor.view.pasteHTML(`<img src="${own}">`);
    });
    expect(rehost).not.toHaveBeenCalled();
    expect(last().imageUrls).toEqual([own]);
  });

  it("저장본 → 편집기 → 저장본 왕복(서식 유지)", async () => {
    const doc = [
      { t: "h" as const, level: 3 as const, text: "소제목" },
      { t: "p" as const, text: "a b", runs: [{ text: "a " }, { text: "b", b: true as const, href: "https://x.com" }] },
      { t: "ol" as const, items: ["x", "y"] },
      { t: "img" as const, url: HOSTED(3), alt: null, caption: "설명" },
    ];
    const { last } = await mount({ doc });
    expect(last().blocks).toEqual([
      { t: "h", level: 3, text: "소제목" },
      { t: "p", text: "a b", runs: [{ text: "a " }, { text: "b", b: true, href: "https://x.com/" }] },
      { t: "ol", items: ["x", "y"] },
      { t: "img", url: HOSTED(3), alt: null, caption: "설명" },
    ]);
  });

  it("첨부 → 본문 넣기·링크 넣기", async () => {
    const { api, last } = await mount();
    await act(async () => {
      api().insertUploadedImage(HOSTED(5));
      api().setLink("https://example.com/page");
    });
    expect(last().imageUrls).toEqual([HOSTED(5)]);
    expect(last().blocks.some((b) => b.t === "p" && b.runs?.some((r) => r.href === "https://example.com/page"))).toBe(true);
  });
});

describe("sanitizePastedHtmlForEditor", () => {
  it("style 은 굵게·기울임만, 이벤트·class 제거", () => {
    const out = sanitizePastedHtmlForEditor(
      `<p class="a" onclick="x" style="color:red;font-weight:bold;font-style:italic">t</p><iframe src="x"></iframe>`
    );
    expect(out).not.toMatch(/class=|onclick|color|iframe/);
    expect(out).toMatch(/font-weight: bold/);
    expect(out).toMatch(/font-style: italic/);
  });
});
