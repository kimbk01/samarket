"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { Fragment, Slice, type Node as PmNode } from "@tiptap/pm/model";
import { NodeSelection, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import Heading from "@tiptap/extension-heading";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import Blockquote from "@tiptap/extension-blockquote";
import { BulletList, ListItem, ListKeymap, OrderedList } from "@tiptap/extension-list";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { Placeholder, TrailingNode, UndoRedo } from "@tiptap/extensions";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { isDibayPostImageUrl } from "@/lib/community/imported-content-blocks";
import { interleavedMarkdownFromPastedHtml } from "@/lib/philife/interleaved-body-markdown";
import { firstLikelyArticlePageUrl } from "@/lib/philife/neighborhood-write-paste";
import {
  COMMUNITY_IMAGE_NODE,
  textToCommunityBodyBlocks,
  type CommunityBodyBlock,
  type CommunityImageNodeAttrs,
} from "@/lib/philife/write-editor/content-codec";
import {
  editorDocToRichSnapshot,
  type EditorJsonNode,
  type RichDocSnapshot,
} from "@/lib/philife/write-editor/rich-codec";
import { sanitizePastedHtmlForEditor } from "@/lib/philife/write-editor/paste-html";
import { CommunityImageNodeBase } from "@/lib/philife/write-editor/community-image-node";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import { Sam } from "@/lib/ui/sam-component-classes";
import { EditorImageCounter } from "@/lib/philife/write-editor/editor-image-count";
import {
  PHILIFE_COMPOSER_SHEET_INPUT_CLASS,
  PHILIFE_COMPOSER_TOOL_BTN_CLASS,
  PHILIFE_COMPOSER_TOOL_BTN_ON_CLASS,
} from "@/lib/ui/philife-write-composer-ui";
import styles from "./philife-body-editor.module.css";

export type PhilifeBodyEditorUploadResult = { ok: true; url: string } | { ok: false; error: string };

export type PhilifeBodyEditorApi = {
  /** 커서 위치에 사진 삽입(업로드 시작) */
  insertFiles: (files: File[]) => void;
  /** 선택한 글자에 링크, 선택이 없으면 주소 글자를 링크로 삽입 */
  setLink: (url: string) => void;
  /** 이미 올린 DIBAY 사진을 커서 위치 본문에 넣기(첨부 → 본문) */
  insertUploadedImage: (url: string) => void;
  focus: () => void;
  /** 사진 설명 시트가 열려 있으면 닫고 true — 뒤로가기는 시트부터 닫는다(overlay back stack 과 같은 순서) */
  dismissSheet: () => boolean;
};

export type PhilifeBodyEditorLabels = {
  placeholder: string;
  uploading: string;
  failed: string;
  retry: string;
  remove: string;
  moveUp: string;
  moveDown: string;
  imageLimit: string;
  caption: string;
  captionEdit: string;
  /** 서식 「제목」 단추에 보이는 글자(지금 모양: 「제목」) — 접근성 이름은 `heading` */
  headingGlyph: string;
  captionSheetTitle: string;
  captionDone: string;
  heading: string;
  bold: string;
  italic: string;
  bulletList: string;
  orderedList: string;
  quote: string;
};

type UploadSource = { kind: "file"; file: File } | { kind: "url"; url: string; pageReferer?: string };

type Props = {
  /** 시드 문서 — 서식 블록(`richBlocksToEditorDoc`) 또는 무손실 파싱된 평문(`plainBlocksToEditorDoc`) */
  initialDoc: EditorJsonNode;
  /** 본인 폴더 사진은 다시 올리지 않는다(`post-images/{ownerUserId}/`) */
  ownerUserId: string | null;
  maxImages: number;
  labels: PhilifeBodyEditorLabels;
  uploadFile: (file: File) => Promise<PhilifeBodyEditorUploadResult>;
  /** 외부 이미지 URL·data URL → post-images 재호스팅 (pageReferer: 붙여넣기 원문 페이지 — 핫링크 차단 사이트용) */
  rehostUrl: (url: string, pageReferer?: string) => Promise<PhilifeBodyEditorUploadResult>;
  onChange: (snapshot: RichDocSnapshot) => void;
  onNotice: (message: string) => void;
  onReady: (api: PhilifeBodyEditorApi) => void;
  /** 작성기 아래 도구줄 안 서식 단추 자리 — 없으면 서식 단추를 그리지 않는다 */
  formatToolbarHost?: HTMLElement | null;
};

function newUploadId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `up-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function findImagePos(editor: Editor, uploadId: string): { pos: number; node: PmNode } | null {
  let found: { pos: number; node: PmNode } | null = null;
  editor.state.doc.descendants((child, pos) => {
    if (found) return false;
    if (child.type.name === COMMUNITY_IMAGE_NODE && child.attrs.uploadId === uploadId) {
      found = { pos, node: child };
      return false;
    }
    return true;
  });
  return found;
}

function isOwnDibayImage(url: string, ownerUserId: string | null): boolean {
  return Boolean(ownerUserId) && isDibayPostImageUrl(url) && url.includes(`/post-images/${ownerUserId}/`);
}

/**
 * 편집기 사진 최대 높이 — 키보드와 상관없는 기기 화면 높이 기준(min(420px, 화면 60%)).
 * vh·svh·dvh 는 키보드가 열리면(Android adjustResize·resizes-content) 함께 줄어 사진이 작아졌다 커지고,
 * 그 사이 브라우저 스크롤 고정이 위치를 옮겨 「설명 쓰기」 완료 뒤 화면이 밀렸다
 * (2026-11-02 Android Chrome 측정: 키보드 때 vh 756→445, 스크롤 226→142).
 */
function editorImageMaxHeightPx(): number {
  const screenH = typeof window !== "undefined" && window.screen ? window.screen.height : 0;
  return screenH > 0 ? Math.min(420, Math.round(screenH * 0.6)) : 420;
}

/**
 * 사진이 선택(NodeSelection)된 상태에서 글·사진·링크가 들어오면 사진을 바꿔치우지 않고 **사진 바로 뒤**에 넣는다.
 * 실기 5차(2026-11-01): 사진 선택 상태로 링크 시트를 열고 「넣기」 → Android 입력기가 남은 글자를 편집기에 확정하면서
 * 선택된 사진이 주소 글자로 바뀌어 사라졌다. 커서를 사진 뒤 글줄로 옮긴 트랜잭션을 돌려준다(뒤에 글줄이 없으면 빈 문단 추가).
 */
function moveCursorAfterSelectedImage(tr: Transaction): Transaction {
  const sel = tr.selection;
  if (!(sel instanceof NodeSelection) || sel.node.type.name !== COMMUNITY_IMAGE_NODE) return tr;
  const end = sel.to;
  const after = tr.doc.resolve(end).nodeAfter;
  if (!after?.isTextblock) tr.insert(end, tr.doc.type.schema.nodes.paragraph!.create());
  return tr.setSelection(TextSelection.create(tr.doc, end + 1));
}

function ImageNodeView(props: ReactNodeViewProps & { extension: { options: ImageNodeOptions } }) {
  const { node, editor, getPos, selected, extension } = props;
  const a = node.attrs as CommunityImageNodeAttrs;
  const o = extension.options;
  const shownSrc = a.status === "done" ? a.src : a.preview || a.src;
  /** 미리보기 주소가 열리지 않으면(외부 원본 400 등) 깨진 그림 대신 고정 높이 칸 — 버튼·실패 줄이 겹치지 않게 */
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const showImage = Boolean(shownSrc) && brokenSrc !== shownSrc;

  /**
   * 사진을 고르면 편집기 포커스(키보드)와 화면(DOM) 선택을 내려놓는다 — iOS·Android 같은 규칙.
   * 포커스가 남으면 브라우저가 사진 범위를 글자 선택처럼 다룬다:
   * - iOS: 파란 선택 손잡이, 이 칸의 click 생략(실기 iPhone 2026-11-01).
   * - Android: 선택 직후 브라우저가 선택 범위로 화면을 스크롤해 고른 사진이 키보드 뒤·머리줄 밑으로 밀림
   *   (실기 Android 2026-11-01 Production 7e8770dc0 — 스크롤은 앱 코드가 아닌 브라우저 기본 동작으로 확인).
   * 편집기 상태의 사진 선택은 그대로라 단추·⌫ 규칙은 바뀌지 않는다.
   */
  const releaseNativeSelection = () => {
    (editor.view.dom as HTMLElement).blur();
    window.getSelection()?.removeAllRanges();
  };

  const move = (dir: -1 | 1) => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const { state } = editor;
    const self = state.doc.nodeAt(pos);
    if (!self) return;
    const $pos = state.doc.resolve(pos);
    const index = $pos.index();
    const parent = $pos.parent;
    const tr = state.tr;
    let at: number;
    if (dir < 0) {
      if (index === 0) return;
      const prev = parent.child(index - 1);
      at = pos - prev.nodeSize;
    } else {
      if (index >= parent.childCount - 1) return;
      const next = parent.child(index + 1);
      at = pos + next.nodeSize;
    }
    tr.delete(pos, pos + self.nodeSize).insert(at, self);
    /** 옮긴 뒤에도 선택 유지 — 조작 단추가 그대로 보이게 */
    tr.setSelection(NodeSelection.create(tr.doc, at));
    editor.view.dispatch(tr.scrollIntoView());
    releaseNativeSelection();
  };

  const remove = () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const self = editor.state.doc.nodeAt(pos);
    if (!self) return;
    const tr = editor.state.tr.delete(pos, pos + self.nodeSize);
    /**
     * 지운 뒤 옆 사진이 자동으로 선택되지 않게 글자 위치로 둔다 — 같은 자리에 「삭제」가 다시 떠
     * 한 번 더 누르면 다른 사진까지 지워질 수 있었다(실기 Android 2026-11-01).
     */
    const $at = tr.doc.resolve(Math.min(pos, tr.doc.content.size));
    const near = Selection.findFrom($at, -1, true) ?? Selection.findFrom($at, 1, true);
    if (near) tr.setSelection(near);
    editor.view.dispatch(tr);
    if (a.uploadId) o.forget(a.uploadId);
  };

  const editCaption = () => {
    const pos = getPos();
    if (typeof pos === "number") o.editCaption(pos, a.caption ?? "");
  };

  /**
   * 사진 칸 안의 모든 누름(사진 선택·위로·아래로·삭제·설명 쓰기·다시 시도)은 click 을 기다리지 않는다.
   * - 손가락: touchend 에서 실행하고 기본 동작을 막는다 → 뒤따르는 호환 mousedown·click 이 생기지 않는다.
   *   · iOS 는 편집기 포커스·사진 선택 중 click 을 만들지 않았다(실기 iPhone 2026-11-01).
   *   · Android 는 손 뗀 뒤 화면 기준으로 click 을 보내, 방금 연 설명 시트의 배경을 눌러 바로 닫았다
   *     (실기 Android 2026-11-01 Production 7e8770dc0 이벤트 기록). 삭제 뒤 아래 칸을 누를 위험도 같다.
   * - 마우스·펜: pointerup 에서 실행. 키보드(Enter·Space)는 click 그대로.
   * 10px 넘게 움직이면(스크롤·끌기) 누름이 아니다.
   */
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchPressRef = useRef(false);
  const lastPressAtRef = useRef(0);
  const press = (run: () => void, opts?: { skipButtons?: boolean }) => {
    const onButton = (t: EventTarget | null) => Boolean(opts?.skipButtons && (t as HTMLElement | null)?.closest?.("button"));
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (onButton(e.target)) return;
        pressStartRef.current = { x: e.clientX, y: e.clientY };
        touchPressRef.current = false;
      },
      onPointerUp: (e: React.PointerEvent) => {
        if (onButton(e.target)) return;
        const start = pressStartRef.current;
        pressStartRef.current = null;
        if (!start) return;
        if (Math.abs(e.clientX - start.x) > 10 || Math.abs(e.clientY - start.y) > 10) return;
        if (e.pointerType === "touch") {
          touchPressRef.current = true;
          return;
        }
        lastPressAtRef.current = Date.now();
        run();
      },
      onPointerCancel: () => {
        pressStartRef.current = null;
        touchPressRef.current = false;
      },
      onTouchEnd: (e: React.TouchEvent) => {
        if (onButton(e.target)) return;
        if (!touchPressRef.current) return;
        touchPressRef.current = false;
        if (e.cancelable) e.preventDefault();
        lastPressAtRef.current = Date.now();
        run();
      },
      onClick: (e: React.MouseEvent) => {
        if (onButton(e.target)) return;
        if (Date.now() - lastPressAtRef.current < 700) return;
        run();
      },
    };
  };

  const selectSelf = () => {
    if (selected) return;
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
    releaseNativeSelection();
  };

  /**
   * 사진 위 글자 단추 — 보이는 모양은 그대로(높이 36px), 누르는 칸은 44×44 이상(Owner 승인 2026-11-02 · 재감사 불일치 2).
   * 폭은 min-w-11(44px), 높이는 투명한 ::before 를 위아래 4px 씩 넓혀 44px. 옆 단추와 겹치지 않게 세로로만 넓힌다.
   */
  const btnLook =
    "inline-flex h-9 min-w-11 items-center justify-center rounded-ui-rect bg-sam-fg/75 px-2.5 text-[length:var(--sm-font-meta)] font-semibold text-sam-on-primary active:bg-sam-fg before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']";
  /** 줄 안 단추는 relative, 「설명 쓰기」는 absolute — 둘 다 ::before 의 기준이 된다(한 단추에 위치 클래스 하나만) */
  const btn = `relative ${btnLook}`;

  return (
    <NodeViewWrapper className="my-2" contentEditable={false} data-testid="editor-image">
      <div
        {...press(selectSelf, { skipButtons: true })}
        /** 사진 칸에 배경·테두리 없음(Owner 2026-11-01) — 선택했을 때만 초록 테두리, 실패면 빨간 테두리 */
        className={`relative overflow-hidden rounded-ui-rect ${selected ? "ring-2 ring-sam-primary" : ""} ${
          a.status === "failed" ? "ring-2 ring-sam-danger" : ""
        }`}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- 편집 중 미리보기(blob:·외부 원본·업로드 URL), 최적화 대상 아님
          <img
            src={shownSrc}
            alt={a.alt || ""}
            draggable={false}
            onError={() => setBrokenSrc(shownSrc)}
            style={{ maxHeight: editorImageMaxHeightPx() }}
            className={`block min-h-32 w-full object-contain ${a.status === "uploading" ? "opacity-60" : ""}`}
          />
        ) : (
          <div className="h-40 w-full" data-testid="editor-image-placeholder" />
        )}
        {a.status === "uploading" ? (
          <div className="absolute inset-x-0 bottom-0 bg-sam-fg/60 px-3 py-1.5 text-[length:var(--sm-font-meta)] font-medium text-sam-on-primary">
            {o.labels.uploading}
          </div>
        ) : null}
        {a.status === "failed" ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-sam-danger/90 px-3 py-1.5 text-[length:var(--sm-font-meta)] font-medium text-sam-on-primary">
            <span className="min-w-0 truncate">{a.error || o.labels.failed}</span>
            {a.uploadId ? (
              <button type="button" className={btn} {...press(() => o.retry(a.uploadId!))}>
                {o.labels.retry}
              </button>
            ) : null}
          </div>
        ) : null}
        {/* 조작 단추는 사진을 눌러 선택했을 때만 (재설계 §3-4) */}
        {selected ? (
          <>
            <div className="absolute right-1.5 top-1.5 flex gap-1" data-testid="editor-image-controls">
              <button type="button" className={btn} {...press(() => move(-1))} aria-label={o.labels.moveUp}>
                {o.labels.moveUp}
              </button>
              <button type="button" className={btn} {...press(() => move(1))} aria-label={o.labels.moveDown}>
                {o.labels.moveDown}
              </button>
              <button type="button" className={btn} {...press(remove)} aria-label={o.labels.remove}>
                {o.labels.remove}
              </button>
            </div>
            {a.status !== "failed" ? (
              <button type="button" className={`${btnLook} absolute bottom-1.5 left-1.5`} {...press(editCaption)}>
                {o.labels.captionEdit}
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      {a.caption ? (
        <p className="sam-text-helper mt-1 px-1 text-center" data-testid="editor-image-caption">
          {a.caption}
        </p>
      ) : null}
    </NodeViewWrapper>
  );
}

type ImageNodeOptions = {
  labels: PhilifeBodyEditorLabels;
  retry: (uploadId: string) => void;
  forget: (uploadId: string) => void;
  /** 설명은 편집기 안 입력칸이 아니라 아래 시트에서 받는다 — Android 입력기가 본문으로 새지 않게 (실기 4차 C2) */
  editCaption: (pos: number, current: string) => void;
};

const DibayImage = CommunityImageNodeBase.extend<ImageNodeOptions>({
  addOptions() {
    return {
      labels: {} as PhilifeBodyEditorLabels,
      retry: () => {},
      forget: () => {},
      editCaption: () => {},
    };
  },
  addNodeView() {
    /**
     * 사진 칸의 마우스 이벤트는 편집기(ProseMirror)가 처리하지 않는다 — 선택은 `press()` 손 뗌 한 곳에서만.
     * (iOS 는 mousedown 이 오기도 하고 안 오기도 해서 두 경로가 섞이면 포커스·선택이 기기마다 달라진다.)
     * 단추·입력칸 이벤트도 편집기에 넘기지 않는다(기본 동작과 같음).
     */
    return ReactNodeViewRenderer(ImageNodeView as never, {
      stopEvent: ({ event }) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest?.("button, input, textarea, select")) return true;
        return event.type === "mousedown" || event.type === "mouseup" || event.type === "click" || event.type === "dblclick";
      },
    });
  },
  /**
   * 사진 바로 아래 줄 맨 앞 ⌫ · 바로 위 줄 끝 Delete: 사진을 바로 지우지 않고 먼저 선택(테두리) — 한 번 더 누르면 지운다.
   * 휴대폰에는 되돌리기 버튼이 없어 글자 지우다 사진이 사라지는 것을 막는다 (실기 2026-11-01).
   */
  addKeyboardShortcuts() {
    const selectImageBeside = (dir: -1 | 1) => {
      const { state } = this.editor;
      const { selection } = state;
      if (!selection.empty) return false;
      const $from = selection.$from;
      if (!$from.parent.isTextblock) return false;
      const atEdge = dir < 0 ? $from.parentOffset === 0 : $from.parentOffset === $from.parent.content.size;
      if (!atEdge) return false;
      const blockStart = $from.before();
      const blockEnd = $from.after();
      const beside = dir < 0 ? state.doc.resolve(blockStart).nodeBefore : state.doc.resolve(blockEnd).nodeAfter;
      if (beside?.type.name !== this.name) return false;
      const tr = state.tr;
      tr.setSelection(NodeSelection.create(tr.doc, dir < 0 ? blockStart - beside.nodeSize : blockEnd));
      this.editor.view.dispatch(tr.scrollIntoView());
      return true;
    };
    return {
      Backspace: () => selectImageBeside(-1),
      Delete: () => selectImageBeside(1),
    };
  },
});

/** 붙여넣은 h1 → 제목(2), h4~h6 → 소제목(3). 저장 형식은 2·3 단계만. */
const DibayHeading = Heading.extend({
  parseHTML() {
    return [
      { tag: "h1", attrs: { level: 2 } },
      { tag: "h2", attrs: { level: 2 } },
      { tag: "h3", attrs: { level: 3 } },
      { tag: "h4", attrs: { level: 3 } },
      { tag: "h5", attrs: { level: 3 } },
      { tag: "h6", attrs: { level: 3 } },
    ];
  },
}).configure({ levels: [2, 3] });

/**
 * 서식 단추 — 작성기 아래 도구줄(키보드 바로 위)에 붙는다. 모양은 지금 글자 그대로(제목 B I • 1. ❝), 색 없음.
 */
function FormatButtons({ editor, labels }: { editor: Editor; labels: PhilifeBodyEditorLabels }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h: e.isActive("heading"),
      b: e.isActive("bold"),
      i: e.isActive("italic"),
      ul: e.isActive("bulletList"),
      ol: e.isActive("orderedList"),
      q: e.isActive("blockquote"),
    }),
  });
  const item = (on: boolean, label: string, text: string, run: () => void, extra = "") => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        /** 사진이 선택된 채 서식을 누르면 사진 바로 뒤 줄에서 적용 — 링크·글자와 같은 규칙(사진은 그대로) */
        if (editor.state.selection instanceof NodeSelection) {
          editor.view.dispatch(moveCursorAfterSelectedImage(editor.state.tr));
        }
        run();
      }}
      className={`${PHILIFE_COMPOSER_TOOL_BTN_CLASS} text-[length:var(--sm-font-input)] ${extra} ${
        on ? PHILIFE_COMPOSER_TOOL_BTN_ON_CLASS : ""
      }`}
    >
      {text}
    </button>
  );
  return (
    <div className="flex shrink-0 items-center" role="group" data-testid="philife-editor-toolbar">
      {item(s.h, labels.heading, labels.headingGlyph, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "font-bold")}
      {item(s.b, labels.bold, "B", () => editor.chain().focus().toggleBold().run(), "font-bold")}
      {item(s.i, labels.italic, "I", () => editor.chain().focus().toggleItalic().run(), "italic font-serif")}
      {item(s.ul, labels.bulletList, "•", () => editor.chain().focus().toggleBulletList().run(), "font-bold")}
      {item(s.ol, labels.orderedList, "1.", () => editor.chain().focus().toggleOrderedList().run())}
      {item(s.q, labels.quote, "❝", () => editor.chain().focus().toggleBlockquote().run())}
    </div>
  );
}

/**
 * 커뮤니티 글쓰기 본문 편집기 (Tiptap/ProseMirror — Owner 승인 ① 2026-10-31).
 * 스키마: 문단·줄바꿈·제목(2/3)·굵게·기울임·링크·글머리/번호 목록·인용·표·사진(+설명).
 * 저장은 `editorDocToRichSnapshot` → 서식 블록, 평문 `content` 는 서버가 블록에서 만든다.
 */
export default function PhilifeBodyEditor({
  initialDoc,
  ownerUserId,
  maxImages,
  labels,
  uploadFile,
  rehostUrl,
  onChange,
  onNotice,
  onReady,
  formatToolbarHost,
}: Props) {
  const sourcesRef = useRef(new Map<string, UploadSource>());
  const cbRef = useRef({ uploadFile, rehostUrl, onChange, onNotice, maxImages, labels, ownerUserId });
  useEffect(() => {
    cbRef.current = { uploadFile, rehostUrl, onChange, onNotice, maxImages, labels, ownerUserId };
  });
  const editorRef = useRef<Editor | null>(null);
  /** 마지막 붙여넣기의 원문 페이지(재호스팅 Referer) */
  const pasteRefererRef = useRef<string | undefined>(undefined);

  const finishUpload = (uploadId: string, res: PhilifeBodyEditorUploadResult) => {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return;
    const hit = findImagePos(editor, uploadId);
    if (!hit) return; // 업로드 중 사용자가 삭제
    const prev = hit.node.attrs as CommunityImageNodeAttrs;
    if (res.ok && prev.preview?.startsWith("blob:")) URL.revokeObjectURL(prev.preview);
    const attrs: CommunityImageNodeAttrs = res.ok
      ? { ...prev, src: res.url, status: "done", error: null, preview: null }
      : { ...prev, src: "", status: "failed", error: res.error };
    /** 업로드 완료는 실행 취소 기록에 넣지 않는다 — 위치는 노드 탐색으로 추적(그 사이 입력 보존) */
    editor.view.dispatch(editor.state.tr.setNodeMarkup(hit.pos, undefined, attrs).setMeta("addToHistory", false));
    if (res.ok) sourcesRef.current.delete(uploadId);
  };

  const startUpload = (uploadId: string) => {
    const src = sourcesRef.current.get(uploadId);
    if (!src) return;
    const run =
      src.kind === "file" ? cbRef.current.uploadFile(src.file) : cbRef.current.rehostUrl(src.url, src.pageReferer);
    void run
      .catch((): PhilifeBodyEditorUploadResult => ({ ok: false, error: cbRef.current.labels.failed }))
      .then((res) => finishUpload(uploadId, res));
  };

  const retry = (uploadId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const hit = findImagePos(editor, uploadId);
    if (!hit) return;
    editor.view.dispatch(
      editor.state.tr
        .setNodeMarkup(hit.pos, undefined, { ...hit.node.attrs, status: "uploading", error: null })
        .setMeta("addToHistory", false)
    );
    startUpload(uploadId);
  };

  const forget = (uploadId: string) => {
    sourcesRef.current.delete(uploadId);
  };

  /** 사진 설명 시트 — 연 순간의 사진 위치·글 */
  const [captionEdit, setCaptionEdit] = useState<{ pos: number; value: string } | null>(null);
  const captionEditOpenRef = useRef(false);
  useEffect(() => {
    captionEditOpenRef.current = captionEdit !== null;
  }, [captionEdit]);
  const editCaption = (pos: number, current: string) => setCaptionEdit({ pos, value: current });
  const saveCaption = () => {
    const editor = editorRef.current;
    const cur = captionEdit;
    setCaptionEdit(null);
    if (!editor || editor.isDestroyed || !cur) return;
    const target = editor.state.doc.nodeAt(cur.pos);
    if (target?.type.name !== COMMUNITY_IMAGE_NODE) return;
    editor.view.dispatch(
      editor.state.tr.setNodeMarkup(cur.pos, undefined, { ...target.attrs, caption: cur.value.trim().slice(0, 500) })
    );
  };

  /**
   * 붙여넣기·끌어넣기로 들어온 「업로드 대기」 사진(`pasteSrc`) 처리 — 본인 사진은 그대로, 나머지는 재호스팅 시작.
   * 10장 초과분은 지우고 안내한다. 기록(실행 취소)에 넣지 않는 한 번의 트랜잭션.
   */
  const claimPastedImages = (editor: Editor) => {
    const pending: Array<{ pos: number; node: PmNode }> = [];
    /** 이미 있는 사진(같은 주소 1장 · 저장 기준과 같음) — 대기 사진은 아래에서 앞에서부터 하나씩 더한다 */
    const counter = new EditorImageCounter();
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name !== COMMUNITY_IMAGE_NODE) return true;
      if (n.attrs.pasteSrc && !n.attrs.uploadId) pending.push({ pos, node: n });
      else counter.add(n.attrs);
      return false;
    });
    if (!pending.length) return;
    const keep: typeof pending = [];
    const drop: typeof pending = [];
    for (const p of pending) {
      const url = String(p.node.attrs.pasteSrc);
      /** 본인 사진은 바로 그 주소로 저장된다 — 같은 주소가 이미 있으면 장수가 늘지 않는다 */
      const asCounted = isOwnDibayImage(url, cbRef.current.ownerUserId) ? { status: "done", src: url } : { status: "uploading" };
      if (!counter.wouldAdd(asCounted) || counter.total < cbRef.current.maxImages) {
        counter.add(asCounted);
        keep.push(p);
      } else {
        drop.push(p);
      }
    }
    const tr = editor.state.tr.setMeta("addToHistory", false);
    const toUpload: string[] = [];
    for (const { pos, node } of keep) {
      const url = String(node.attrs.pasteSrc);
      if (isOwnDibayImage(url, cbRef.current.ownerUserId)) {
        tr.setNodeMarkup(pos, undefined, { ...node.attrs, src: url, status: "done", preview: null, pasteSrc: null });
        continue;
      }
      const id = newUploadId();
      sourcesRef.current.set(id, { kind: "url", url, pageReferer: pasteRefererRef.current });
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, uploadId: id, status: "uploading", pasteSrc: null });
      toUpload.push(id);
    }
    /** 뒤에서부터 지워 앞 위치가 바뀌지 않게 */
    for (const { pos, node } of [...drop].reverse()) tr.delete(pos, pos + node.nodeSize);
    editor.view.dispatch(tr);
    if (drop.length) cbRef.current.onNotice(cbRef.current.labels.imageLimit);
    for (const id of toUpload) startUpload(id);
  };

  /** 문단·사진 블록을 커서 위치에 삽입(평문 붙여넣기·파일) 후 업로드 시작 */
  const insertBlocksAtSelection = (
    editor: Editor,
    items: Array<{ block: CommunityBodyBlock } | { upload: UploadSource }>
  ) => {
    const { schema } = editor.state;
    const imageType = schema.nodes[COMMUNITY_IMAGE_NODE]!;
    const nodes: PmNode[] = [];
    const toUpload: string[] = [];
    for (const it of items) {
      if ("block" in it && it.block.type === "paragraph") {
        nodes.push(schema.nodes.paragraph!.create(null, it.block.text ? schema.text(it.block.text) : null));
        continue;
      }
      if ("block" in it && it.block.type === "image") {
        /** 주소 사진은 붙여넣기 사진과 같은 경로(`claimPastedImages`)로 소유 확인·재호스팅 */
        const url = it.block.src;
        nodes.push(imageType.create({ src: "", alt: it.block.alt, status: "uploading", preview: url, pasteSrc: url }));
        continue;
      }
      const src = (it as { upload: UploadSource }).upload;
      const id = newUploadId();
      sourcesRef.current.set(id, src);
      const preview = src.kind === "file" ? URL.createObjectURL(src.file) : src.url;
      nodes.push(imageType.create({ src: "", alt: "", uploadId: id, status: "uploading", preview }));
      toUpload.push(id);
    }
    if (!nodes.length) return;
    /** 파일 사진 10장 제한 — 넘치는 파일은 넣지 않는다. 이미 있는 사진은 같은 주소 1장(저장 기준과 같음) */
    const counter = new EditorImageCounter();
    editor.state.doc.descendants((n) => {
      if (n.type.name === COMMUNITY_IMAGE_NODE) counter.add(n.attrs);
      return n.type.name !== COMMUNITY_IMAGE_NODE;
    });
    let total = counter.total;
    const filtered: PmNode[] = [];
    let limited = false;
    for (const n of nodes) {
      if (n.type === imageType) {
        if (total >= cbRef.current.maxImages) {
          limited = true;
          if (n.attrs.uploadId) {
            sourcesRef.current.delete(String(n.attrs.uploadId));
            const p = n.attrs.preview;
            if (typeof p === "string" && p.startsWith("blob:")) URL.revokeObjectURL(p);
          }
          continue;
        }
        total += 1;
      }
      filtered.push(n);
    }
    if (limited) cbRef.current.onNotice(cbRef.current.labels.imageLimit);
    if (!filtered.length) return;
    /** 선택된 사진을 새 사진·글로 바꿔치우지 않게 — 사진 뒤로 커서 이동 */
    if (editor.state.selection instanceof NodeSelection) {
      editor.view.dispatch(moveCursorAfterSelectedImage(editor.state.tr));
    }
    const first = filtered[0]!;
    const last = filtered[filtered.length - 1]!;
    const slice = new Slice(Fragment.from(filtered), first.isTextblock ? 1 : 0, last.isTextblock ? 1 : 0);
    const insertEnd = editor.state.selection.to;
    const tr = editor.state.tr.replaceSelection(slice);
    /** 사진 뒤에 커서를 글자 자리로 — 이어서 쓰거나 붙여넣은 글이 사진 블록에 막히지 않게(뒤에 글줄이 없으면 빈 문단 추가) */
    if (!last.isTextblock) {
      const end = tr.mapping.map(insertEnd, 1);
      const after = tr.doc.resolve(end).nodeAfter;
      if (after?.isTextblock) {
        tr.setSelection(TextSelection.create(tr.doc, end + 1));
      } else {
        tr.insert(end, schema.nodes.paragraph!.create());
        tr.setSelection(TextSelection.create(tr.doc, end + 1));
      }
    }
    editor.view.dispatch(tr.scrollIntoView());
    for (const id of toUpload) if (sourcesRef.current.has(id)) startUpload(id);
  };

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      DibayHeading,
      Bold,
      Italic,
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => /^https?:\/\//i.test(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow ugc", target: "_blank" },
      }),
      BulletList,
      OrderedList,
      ListItem,
      ListKeymap,
      Blockquote,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      UndoRedo,
      TrailingNode.configure({ node: "paragraph" }),
      Placeholder.configure({ placeholder: labels.placeholder }),
      DibayImage.configure({ labels, retry, forget, editCaption }),
    ],
    content: initialDoc,
    editorProps: {
      attributes: {
        "aria-multiline": "true",
        role: "textbox",
        "aria-label": labels.placeholder,
      },
      /** 외부 HTML: 허용 구조만 남기고 사진은 업로드 대기 노드로 (외부 CSS·스크립트 미실행) */
      transformPastedHTML: (html) => sanitizePastedHtmlForEditor(html),
      handlePaste: (_view, event) => {
        const ed = editorRef.current;
        const cd = event.clipboardData;
        if (!ed || !cd) return false;
        const plain = cd.getData("text/plain") || "";
        const html = cd.getData("text/html") || "";
        pasteRefererRef.current = firstLikelyArticlePageUrl(plain) ?? undefined;
        const files = Array.from(cd.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (files.length === 0) {
          for (const it of Array.from(cd.items ?? [])) {
            if (it.kind === "file" && it.type.startsWith("image/")) {
              const f = it.getAsFile();
              if (f) files.push(f);
            }
          }
        }
        if (files.length > 0) {
          /** 이미지 파일 + 글이 함께 오면 글을 먼저, 사진은 그 뒤에 */
          event.preventDefault();
          const md = html.trim() ? interleavedMarkdownFromPastedHtml(html, plain) : plain;
          const items: Array<{ block: CommunityBodyBlock } | { upload: UploadSource }> = [];
          const textBlocks = textToCommunityBodyBlocks(md).filter((b) => b.type === "paragraph");
          if (textBlocks.some((b) => b.type === "paragraph" && b.text.trim())) {
            for (const b of textBlocks) items.push({ block: b });
          }
          for (const f of files) items.push({ upload: { kind: "file", file: f } });
          insertBlocksAtSelection(ed, items);
          return true;
        }
        if (!html.trim() && /!\[[^\]]*\]\([^)]+\)/.test(plain)) {
          /** 평문에 사진 문법 줄이 있으면 사진 블록으로 */
          event.preventDefault();
          insertBlocksAtSelection(
            ed,
            textToCommunityBodyBlocks(plain).map((b) => ({ block: b }))
          );
          return true;
        }
        /** HTML(서식) 또는 일반 글 — 편집기 스키마로 붙여넣기 */
        return false;
      },
      /** 사진이 선택된 채로 글자가 들어오면(입력기 확정·자판) 사진을 지우지 않고 사진 뒤에 쓴다 */
      handleTextInput: (view, from, to, text) => {
        if (!text) return false;
        let imagePos = -1;
        view.state.doc.nodesBetween(from, to, (n, pos) => {
          if (n.type.name === COMMUNITY_IMAGE_NODE) imagePos = pos;
          return n.type.name !== COMMUNITY_IMAGE_NODE;
        });
        if (imagePos < 0) return false;
        const tr = view.state.tr.setSelection(NodeSelection.create(view.state.doc, imagePos));
        moveCursorAfterSelectedImage(tr).insertText(text);
        view.dispatch(tr.scrollIntoView());
        return true;
      },
      handleDrop: (_view, event) => {
        const ed = editorRef.current;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (!ed || files.length === 0) return false;
        event.preventDefault();
        insertBlocksAtSelection(
          ed,
          files.map((f) => ({ upload: { kind: "file" as const, file: f } }))
        );
        return true;
      },
    },
    onCreate: ({ editor: ed }) => {
      editorRef.current = ed;
      cbRef.current.onChange(editorDocToRichSnapshot(ed.getJSON() as EditorJsonNode));
    },
    onUpdate: ({ editor: ed }) => {
      claimPastedImages(ed);
      cbRef.current.onChange(editorDocToRichSnapshot(ed.getJSON() as EditorJsonNode));
    },
  });

  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;
    onReady({
      insertFiles: (files) => {
        if (!files.length) return;
        insertBlocksAtSelection(
          editor,
          files.map((f) => ({ upload: { kind: "file" as const, file: f } }))
        );
        editor.commands.focus();
      },
      setLink: (url) => {
        if (editor.state.selection instanceof NodeSelection) {
          editor.view.dispatch(moveCursorAfterSelectedImage(editor.state.tr));
        }
        const { empty } = editor.state.selection;
        if (empty) {
          editor
            .chain()
            .focus()
            .insertContent({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] })
            .insertContent(" ")
            .run();
        } else {
          editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }
      },
      insertUploadedImage: (url) => {
        insertBlocksAtSelection(editor, [{ block: { type: "image", src: url, alt: "" } }]);
        editor.commands.focus();
      },
      focus: () => {
        editor.commands.focus();
      },
      dismissSheet: () => {
        if (!captionEditOpenRef.current) return false;
        setCaptionEdit(null);
        return true;
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 편집기 인스턴스 생성 시 1회
  }, [editor]);

  useEffect(
    () => () => {
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed) return;
      ed.state.doc.descendants((child) => {
        const p = child.attrs?.preview;
        if (typeof p === "string" && p.startsWith("blob:")) URL.revokeObjectURL(p);
        return true;
      });
    },
    []
  );

  return (
    <div className={styles.root} data-testid="philife-body-editor">
      <EditorContent editor={editor} />
      {editor && formatToolbarHost ? createPortal(<FormatButtons editor={editor} labels={labels} />, formatToolbarHost) : null}
      <DibayBottomSheet
        open={captionEdit !== null}
        onClose={() => setCaptionEdit(null)}
        title={labels.captionSheetTitle}
        zIndexClass={MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS}
        footer={
          <button type="button" className={`${Sam.btn.primaryCombo} w-full`} onClick={saveCaption}>
            {labels.captionDone}
          </button>
        }
      >
        <input
          type="text"
          value={captionEdit?.value ?? ""}
          onChange={(e) => setCaptionEdit((c) => (c ? { ...c, value: e.target.value } : c))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              saveCaption();
            }
          }}
          placeholder={labels.caption}
          aria-label={labels.caption}
          maxLength={500}
          enterKeyHint="done"
          autoFocus
          className={PHILIFE_COMPOSER_SHEET_INPUT_CLASS}
          data-testid="editor-caption-input"
        />
      </DibayBottomSheet>
    </div>
  );
}
