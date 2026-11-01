// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import PhilifeBodyEditor, {
  type PhilifeBodyEditorApi,
  type PhilifeBodyEditorUploadResult,
} from "@/components/philife/write-editor/PhilifeBodyEditor";
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

/**
 * jsdom 에 없는 Range 좌표 — 편집기 focus() 가 다음 프레임에 커서로 스크롤(coordsAtPos)할 때 쓴다.
 * 없으면 부하가 큰 CI 에서 시험 종료 직후 「getClientRects is not a function」 미처리 예외가 난다 (CI 2026-11-01).
 */
const EMPTY_RECT = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) } as DOMRect;
if (typeof Range !== "undefined") {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  }
  if (!Range.prototype.getBoundingClientRect) Range.prototype.getBoundingClientRect = () => EMPTY_RECT;
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

/** 실제 keydown — `commands.keyboardShortcut` 은 단계만 옮기고 선택(NodeSelection)은 버린다 */
function keydown(editor: Editor, key: string) {
  /** jsdom 은 편집기 선택을 DOM 에 써 주지 않아, keydown 때 DOM 선택(문서 처음)으로 되돌아간다 — 같게 맞춘다 */
  const sel = editor.state.selection;
  if (sel.empty) {
    const at = editor.view.domAtPos(sel.from);
    const range = document.createRange();
    range.setStart(at.node, at.offset);
    range.collapse(true);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
  }
  editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

async function mount(
  opts: { maxImages?: number; doc?: Parameters<typeof richBlocksToEditorDoc>[0]; formatToolbarHost?: HTMLElement } = {}
) {
  const snaps: RichDocSnapshot[] = [];
  const notices: string[] = [];
  const rehost = vi.fn(async (url: string, pageReferer?: string): Promise<PhilifeBodyEditorUploadResult> => {
    void pageReferer;
    void url;
    return { ok: true, url: HOSTED(rehost.mock.calls.length) };
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
        formatToolbarHost={opts.formatToolbarHost ?? null}
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

  it("외부 원본이 안 열리고 가져오기도 실패하면: 깨진 그림 대신 고정 칸 + 실패 문구·다시 시도·삭제 (실기 2026-11-01)", async () => {
    const { editor, rehost, last } = await mount();
    rehost.mockImplementationOnce(async () => ({ ok: false as const, error: "이미지를 가져올 수 없습니다. (400)" }));
    await act(async () => {
      editor.view.pasteHTML(`<p>글</p><img src="https://upload.example.org/251px-a.jpg" alt="intramuros">`);
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    const box = host!.querySelector('[data-testid="editor-image"]')!;
    const img = box.querySelector("img")!;
    await act(async () => {
      img.dispatchEvent(new Event("error"));
    });
    expect(box.querySelector("img")).toBeNull();
    expect(box.querySelector('[data-testid="editor-image-placeholder"]')).not.toBeNull();
    expect(box.textContent).toContain("이미지를 가져올 수 없습니다. (400)");
    expect(box.textContent).toContain(LABELS.retry);
    /** 삭제 단추는 사진을 눌러 선택했을 때 보인다 (재설계 §3-4) */
    await act(async () => {
      let at = -1;
      editor.state.doc.forEach((n, off) => {
        if (n.type.name === "dibayImage") at = off;
      });
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, at)));
    });
    expect(host!.querySelector('[data-testid="editor-image"]')!.textContent).toContain(LABELS.remove);
    expect(last().failedCount).toBe(1);
  });

  it("사진 조작 단추는 선택했을 때만 · 설명은 시트에서 입력해 저장 (실기 4차 C2)", async () => {
    const { editor, last } = await mount({ doc: [{ t: "img" as const, url: HOSTED(6), alt: null, caption: null }] });
    const box = () => host!.querySelector('[data-testid="editor-image"]')!;
    await act(async () => {
      editor.view.dispatch(editor.state.tr);
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)));
    });
    expect(box().querySelector('[data-testid="editor-image-controls"]')).toBeNull();
    expect(box().querySelector("input")).toBeNull();
    await act(async () => {
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
    });
    expect(box().querySelector('[data-testid="editor-image-controls"]')).not.toBeNull();
    const captionBtn = [...box().querySelectorAll("button")].find((b) => b.textContent === LABELS.captionEdit)!;
    await act(async () => {
      captionBtn.click();
    });
    const input = document.querySelector('[data-testid="editor-caption-input"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "바닷가 아침");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const done = [...document.querySelectorAll("button")].find((b) => b.textContent === LABELS.captionDone)!;
    await act(async () => {
      done.click();
    });
    expect(last().blocks[0]).toMatchObject({ t: "img", caption: "바닷가 아침" });
    expect(box().querySelector('[data-testid="editor-image-caption"]')!.textContent).toBe("바닷가 아침");
  });

  it("다른 사진이 선택된 동안 사진을 누르면(손 뗌) 그 사진이 선택된다 — iOS 는 click 을 만들지 않음 (실기 iPhone 2026-11-01)", async () => {
    const { editor } = await mount({
      doc: [
        { t: "img" as const, url: HOSTED(7), alt: null, caption: null },
        { t: "img" as const, url: HOSTED(8), alt: null, caption: null },
      ],
    });
    const boxes = () => [...host!.querySelectorAll('[data-testid="editor-image"]')];
    await act(async () => {
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
    });
    expect(boxes()[0]!.querySelector('[data-testid="editor-image-controls"]')).not.toBeNull();
    const second = boxes()[1]!.firstElementChild as HTMLElement;
    const fire = (type: string, x: number, y: number) => {
      const ev = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
      second.dispatchEvent(ev);
    };
    await act(async () => {
      fire("pointerdown", 100, 100);
      fire("pointerup", 102, 101);
    });
    expect(boxes()[1]!.querySelector('[data-testid="editor-image-controls"]')).not.toBeNull();
    expect(boxes()[0]!.querySelector('[data-testid="editor-image-controls"]')).toBeNull();
    // 끌기(10px 넘게 움직임)는 선택하지 않는다
    await act(async () => {
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 0)));
    });
    await act(async () => {
      fire("pointerdown", 100, 100);
      fire("pointerup", 100, 160);
    });
    expect(boxes()[1]!.querySelector('[data-testid="editor-image-controls"]')).toBeNull();
  });

  it("사진이 선택된 채로 링크·사진·글자가 들어와도 사진은 그대로, 사진 뒤에 들어간다 (실기 5차)", async () => {
    const { editor, api, last } = await mount({
      doc: [
        { t: "p" as const, text: "a" },
        { t: "img" as const, url: HOSTED(6), alt: null, caption: "cap5" },
      ],
    });
    const selectImage = async () => {
      await act(async () => {
        editor.view.dispatch(editor.state.tr);
        let at = -1;
        editor.state.doc.forEach((n, off) => {
          if (n.type.name === "dibayImage") at = off;
        });
        editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, at)));
      });
    };
    await selectImage();
    await act(async () => {
      api().setLink("https://example.com");
    });
    expect(last().blocks[1]).toMatchObject({ t: "img", caption: "cap5" });
    expect(last().blocks.some((b) => b.t === "p" && b.runs?.some((r) => r.href === "https://example.com/"))).toBe(true);

    /** 입력기 확정 글자(handleTextInput) — 사진을 바꿔치우지 않는다 */
    await selectImage();
    await act(async () => {
      const { from, to } = editor.state.selection;
      editor.view.someProp("handleTextInput", (f) => f(editor.view, from, to, "z", () => editor.state.tr));
    });
    expect(last().imageUrls).toEqual([HOSTED(6)]);
    expect(editor.state.doc.textContent).toContain("z");

    /** 사진 단추로 넣은 새 사진도 선택된 사진 뒤에 */
    await selectImage();
    await act(async () => {
      api().insertUploadedImage(HOSTED(7));
    });
    expect(last().imageUrls).toEqual([HOSTED(6), HOSTED(7)]);
  });

  it("서식 단추는 작성기 도구줄 자리(formatToolbarHost)에 그린다 — 지금 글자 그대로", async () => {
    const slot = document.createElement("div");
    document.body.appendChild(slot);
    try {
      await mount({ formatToolbarHost: slot });
      const labels = [...slot.querySelectorAll("button")].map((b) => b.textContent);
      expect(labels).toEqual(["제목", "B", "I", "•", "1.", "❝"]);
      expect(host!.querySelector('[data-testid="philife-editor-toolbar"]')).toBeNull();
    } finally {
      slot.remove();
    }
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

  it("사진 아래 줄 맨 앞 ⌫ · 위 줄 끝 Delete: 사진을 먼저 선택, 한 번 더 눌러야 지운다 (실기 2026-11-01)", async () => {
    const doc = [
      { t: "p" as const, text: "위" },
      { t: "img" as const, url: HOSTED(3), alt: null, caption: null },
      { t: "p" as const, text: "BOLD", runs: [{ text: "BOLD", b: true as const }] },
    ];
    const { editor, last } = await mount({ doc });
    const types = () => {
      const out: string[] = [];
      editor.state.doc.forEach((n) => out.push(n.type.name));
      return out;
    };
    const posOf = (text: string) => {
      let p = -1;
      editor.state.doc.forEach((n, off) => {
        if (n.textContent === text) p = off + 1;
      });
      return p;
    };
    const press = async (key: string) => {
      await act(async () => {
        keydown(editor, key);
      });
    };

    await act(async () => {
      editor.commands.setTextSelection(posOf("BOLD"));
    });
    await press("Backspace");
    expect(types()).toEqual(["paragraph", "dibayImage", "paragraph"]);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(last().imageUrls).toEqual([HOSTED(3)]);
    await press("Backspace");
    expect(types()).toEqual(["paragraph", "paragraph"]);
    expect(last().imageUrls).toEqual([]);

    await act(async () => {
      editor.commands.undo();
    });
    await act(async () => {
      editor.commands.setTextSelection(posOf("위") + 1);
    });
    await press("Delete");
    expect(types()).toEqual(["paragraph", "dibayImage", "paragraph"]);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.doc.textContent).toBe("위BOLD");

    /** 글자 중간 ⌫ 는 가로채지 않는다(글자 지우기는 브라우저 기본 동작) */
    await act(async () => {
      editor.commands.setTextSelection(posOf("BOLD") + 2);
    });
    await press("Backspace");
    expect(types()).toEqual(["paragraph", "dibayImage", "paragraph"]);
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
  });

  it("사진 아래 빈 줄 ⌫: 사진을 먼저 선택", async () => {
    const { editor, last } = await mount({ doc: [{ t: "img" as const, url: HOSTED(4), alt: null, caption: null }] });
    const types = () => {
      const out: string[] = [];
      editor.state.doc.forEach((n) => out.push(n.type.name));
      return out;
    };
    await act(async () => {
      /** 빈 문서 끝 줄(TrailingNode)은 첫 트랜잭션 때 붙는다 */
      editor.view.dispatch(editor.state.tr);
      editor.view.dispatch(editor.state.tr.setSelection(TextSelection.atEnd(editor.state.doc)));
    });
    expect(types()).toEqual(["dibayImage", "paragraph"]);
    await act(async () => {
      keydown(editor, "Backspace");
    });
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(last().imageUrls).toEqual([HOSTED(4)]);
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
