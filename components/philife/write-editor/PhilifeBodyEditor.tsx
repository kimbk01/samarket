"use client";

import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { Fragment, Slice, type Node as PmNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
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

function ImageNodeView(props: ReactNodeViewProps & { extension: { options: ImageNodeOptions } }) {
  const { node, editor, getPos, selected, extension } = props;
  const a = node.attrs as CommunityImageNodeAttrs;
  const o = extension.options;
  const shownSrc = a.status === "done" ? a.src : a.preview || a.src;

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
    if (dir < 0) {
      if (index === 0) return;
      const prev = parent.child(index - 1);
      tr.delete(pos, pos + self.nodeSize).insert(pos - prev.nodeSize, self);
    } else {
      if (index >= parent.childCount - 1) return;
      const next = parent.child(index + 1);
      tr.delete(pos, pos + self.nodeSize).insert(pos + next.nodeSize, self);
    }
    editor.view.dispatch(tr.scrollIntoView());
  };

  const remove = () => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    const self = editor.state.doc.nodeAt(pos);
    if (!self) return;
    editor.view.dispatch(editor.state.tr.delete(pos, pos + self.nodeSize));
    if (a.uploadId) o.forget(a.uploadId);
  };

  const setCaption = (caption: string) => {
    const pos = getPos();
    if (typeof pos !== "number") return;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, caption: caption.slice(0, 500) }));
  };

  const btn =
    "inline-flex min-h-9 items-center rounded-ui-rect bg-[#050505]/75 px-2.5 text-[12px] font-semibold text-white active:bg-[#050505]";

  return (
    <NodeViewWrapper className="my-2" contentEditable={false} data-testid="editor-image">
      <div
        className={`relative overflow-hidden rounded-ui-rect bg-[#f0f2f5] ${
          selected ? "ring-2 ring-sam-primary" : "ring-1 ring-[#e4e6eb]"
        } ${a.status === "failed" ? "ring-2 ring-sam-danger" : ""}`}
      >
        {shownSrc ? (
          // eslint-disable-next-line @next/next/no-img-element -- 편집 중 미리보기(blob:·외부 원본·업로드 URL), 최적화 대상 아님
          <img
            src={shownSrc}
            alt={a.alt || ""}
            draggable={false}
            className={`block max-h-[min(60vh,420px)] w-full object-contain ${a.status === "uploading" ? "opacity-60" : ""}`}
          />
        ) : (
          <div className="h-32 w-full" />
        )}
        {a.status === "uploading" ? (
          <div className="absolute inset-x-0 bottom-0 bg-[#050505]/60 px-3 py-1.5 text-[12px] font-medium text-white">
            {o.labels.uploading}
          </div>
        ) : null}
        {a.status === "failed" ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-sam-danger/90 px-3 py-1.5 text-[12px] font-medium text-white">
            <span className="min-w-0 truncate">{a.error || o.labels.failed}</span>
            {a.uploadId ? (
              <button type="button" className={btn} onClick={() => o.retry(a.uploadId!)}>
                {o.labels.retry}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="absolute right-1.5 top-1.5 flex gap-1">
          <button type="button" className={btn} onClick={() => move(-1)} aria-label={o.labels.moveUp}>
            {o.labels.moveUp}
          </button>
          <button type="button" className={btn} onClick={() => move(1)} aria-label={o.labels.moveDown}>
            {o.labels.moveDown}
          </button>
          <button type="button" className={btn} onClick={remove} aria-label={o.labels.remove}>
            {o.labels.remove}
          </button>
        </div>
      </div>
      <input
        type="text"
        value={a.caption ?? ""}
        onChange={(e) => setCaption(e.target.value)}
        placeholder={o.labels.caption}
        aria-label={o.labels.caption}
        maxLength={500}
        enterKeyHint="done"
        className="mt-1 w-full border-0 bg-transparent px-1 py-1 text-center text-[13px] text-sam-muted outline-none placeholder:text-sam-meta"
      />
    </NodeViewWrapper>
  );
}

type ImageNodeOptions = {
  labels: PhilifeBodyEditorLabels;
  retry: (uploadId: string) => void;
  forget: (uploadId: string) => void;
};

const DibayImage = CommunityImageNodeBase.extend<ImageNodeOptions>({
  addOptions() {
    return {
      labels: {} as PhilifeBodyEditorLabels,
      retry: () => {},
      forget: () => {},
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView as never);
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

function Toolbar({ editor, labels }: { editor: Editor; labels: PhilifeBodyEditorLabels }) {
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
      onClick={run}
      className={`inline-flex h-9 min-w-9 items-center justify-center rounded-ui-rect px-2 text-[14px] ${extra} ${
        on ? "bg-sam-primary-soft text-sam-primary" : "text-sam-fg active:bg-sam-surface-muted"
      }`}
    >
      {text}
    </button>
  );
  return (
    <div
      className="-mx-1 mb-2 flex flex-wrap items-center gap-0.5 border-b border-sam-border-soft pb-1.5"
      role="toolbar"
      data-testid="philife-editor-toolbar"
    >
      {item(s.h, labels.heading, labels.heading, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), "font-bold")}
      {item(s.b, labels.bold, "B", () => editor.chain().focus().toggleBold().run(), "font-bold")}
      {item(s.i, labels.italic, "I", () => editor.chain().focus().toggleItalic().run(), "italic font-serif")}
      {item(s.ul, labels.bulletList, "•", () => editor.chain().focus().toggleBulletList().run(), "text-[18px]")}
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

  /**
   * 붙여넣기·끌어넣기로 들어온 「업로드 대기」 사진(`pasteSrc`) 처리 — 본인 사진은 그대로, 나머지는 재호스팅 시작.
   * 10장 초과분은 지우고 안내한다. 기록(실행 취소)에 넣지 않는 한 번의 트랜잭션.
   */
  const claimPastedImages = (editor: Editor) => {
    const pending: Array<{ pos: number; node: PmNode }> = [];
    let total = 0;
    editor.state.doc.descendants((n, pos) => {
      if (n.type.name !== COMMUNITY_IMAGE_NODE) return true;
      total += 1;
      if (n.attrs.pasteSrc && !n.attrs.uploadId) pending.push({ pos, node: n });
      return false;
    });
    if (!pending.length) return;
    const over = Math.max(0, total - cbRef.current.maxImages);
    const keep = pending.slice(0, Math.max(0, pending.length - over));
    const drop = pending.slice(keep.length);
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
    /** 파일 사진 10장 제한 — 넘치는 파일은 넣지 않는다 */
    let total = 0;
    editor.state.doc.descendants((n) => {
      if (n.type.name === COMMUNITY_IMAGE_NODE) total += 1;
      return n.type.name !== COMMUNITY_IMAGE_NODE;
    });
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
      DibayImage.configure({ labels, retry, forget }),
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
      {editor ? <Toolbar editor={editor} labels={labels} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}
