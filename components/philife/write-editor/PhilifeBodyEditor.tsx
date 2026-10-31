"use client";

import { useEffect, useRef } from "react";
import type { Editor } from "@tiptap/core";
import { Fragment, Slice, type Node as PmNode } from "@tiptap/pm/model";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Placeholder, TrailingNode, UndoRedo } from "@tiptap/extensions";
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { isDibayPostImageUrl } from "@/lib/community/imported-content-blocks";
import { interleavedMarkdownFromPastedHtml } from "@/lib/philife/interleaved-body-markdown";
import { firstLikelyArticlePageUrl } from "@/lib/philife/neighborhood-write-paste";
import {
  COMMUNITY_IMAGE_NODE,
  communityBodyBlocksToDoc,
  communityDocToSnapshot,
  textToCommunityBodyBlocks,
  type CommunityBodyBlock,
  type CommunityDocSnapshot,
  type CommunityImageNodeAttrs,
} from "@/lib/philife/write-editor/content-codec";
import { CommunityImageNodeBase } from "@/lib/philife/write-editor/community-image-node";
import styles from "./philife-body-editor.module.css";

export type PhilifeBodyEditorUploadResult = { ok: true; url: string } | { ok: false; error: string };

export type PhilifeBodyEditorApi = {
  /** 커서 위치에 사진 삽입(업로드 시작) */
  insertFiles: (files: File[]) => void;
  /** 커서 위치에 독립 줄로 링크·동영상 URL 삽입 */
  insertLinkLine: (url: string) => void;
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
};

type UploadSource = { kind: "file"; file: File } | { kind: "url"; url: string; pageReferer?: string };

type Props = {
  /** 무손실 파싱이 확인된 블록(호출부에서 `parseCommunityBodyToBlocks` ok 인 경우만) */
  initialBlocks: CommunityBodyBlock[];
  maxImages: number;
  labels: PhilifeBodyEditorLabels;
  uploadFile: (file: File) => Promise<PhilifeBodyEditorUploadResult>;
  /** 외부 이미지 URL·data URL → post-images 재호스팅 (pageReferer: 붙여넣기 원문 페이지 — 핫링크 차단 사이트용) */
  rehostUrl: (url: string, pageReferer?: string) => Promise<PhilifeBodyEditorUploadResult>;
  onChange: (snapshot: CommunityDocSnapshot) => void;
  onNotice: (message: string) => void;
  onReady: (api: PhilifeBodyEditorApi) => void;
};

function newUploadId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `up-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function countImageNodes(doc: PmNode): number {
  let n = 0;
  doc.forEach((child) => {
    if (child.type.name === COMMUNITY_IMAGE_NODE) n += 1;
  });
  return n;
}

function findImagePos(editor: Editor, uploadId: string): { pos: number; node: PmNode } | null {
  let found: { pos: number; node: PmNode } | null = null;
  editor.state.doc.forEach((child, offset) => {
    if (!found && child.type.name === COMMUNITY_IMAGE_NODE && child.attrs.uploadId === uploadId) {
      found = { pos: offset, node: child };
    }
  });
  return found;
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

  const btn =
    "inline-flex min-h-9 items-center rounded-ui-rect bg-[#050505]/75 px-2.5 text-[12px] font-semibold text-white active:bg-[#050505]";

  return (
    <NodeViewWrapper
      className={`relative my-2 overflow-hidden rounded-ui-rect bg-[#f0f2f5] ${
        selected ? "ring-2 ring-sam-primary" : "ring-1 ring-[#e4e6eb]"
      } ${a.status === "failed" ? "ring-2 ring-sam-danger" : ""}`}
      contentEditable={false}
    >
      {shownSrc ? (
        // eslint-disable-next-line @next/next/no-img-element -- 편집 중 미리보기(blob:·업로드 URL), 최적화 대상 아님
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

/**
 * 커뮤니티 글쓰기 본문 편집기 (Tiptap/ProseMirror, 최소 스키마: 문단·텍스트·이미지).
 * 저장 형식은 `content-codec` 이 기존 `content` 계약으로 직렬화한다.
 */
export default function PhilifeBodyEditor({
  initialBlocks,
  maxImages,
  labels,
  uploadFile,
  rehostUrl,
  onChange,
  onNotice,
  onReady,
}: Props) {
  const sourcesRef = useRef(new Map<string, UploadSource>());
  const cbRef = useRef({ uploadFile, rehostUrl, onChange, onNotice, maxImages, labels });
  useEffect(() => {
    cbRef.current = { uploadFile, rehostUrl, onChange, onNotice, maxImages, labels };
  });
  const editorRef = useRef<Editor | null>(null);

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

  /** 블록 목록을 커서 위치에 삽입(문단 중간이면 앞뒤 문단과 이어 붙임) 후, 필요한 업로드 시작 */
  const insertBlocksAtSelection = (
    editor: Editor,
    items: Array<{ block: CommunityBodyBlock } | { upload: UploadSource }>,
    pageReferer?: string
  ) => {
    const { schema } = editor.state;
    const imageType = schema.nodes[COMMUNITY_IMAGE_NODE]!;
    let images = countImageNodes(editor.state.doc);
    let limited = false;
    const nodes: PmNode[] = [];
    const toUpload: string[] = [];
    for (const it of items) {
      if ("block" in it && it.block.type === "paragraph") {
        nodes.push(schema.nodes.paragraph!.create(null, it.block.text ? schema.text(it.block.text) : null));
        continue;
      }
      if (images >= cbRef.current.maxImages) {
        limited = true;
        continue;
      }
      images += 1;
      if ("block" in it && it.block.type === "image") {
        const url = it.block.src;
        if (isDibayPostImageUrl(url)) {
          nodes.push(imageType.create({ src: url, alt: it.block.alt, status: "done" }));
          continue;
        }
        const id = newUploadId();
        sourcesRef.current.set(id, { kind: "url", url, pageReferer });
        nodes.push(imageType.create({ src: "", alt: "", uploadId: id, status: "uploading", preview: url }));
        toUpload.push(id);
        continue;
      }
      const src = (it as { upload: UploadSource }).upload;
      const id = newUploadId();
      sourcesRef.current.set(id, src);
      const preview = src.kind === "file" ? URL.createObjectURL(src.file) : src.url;
      nodes.push(imageType.create({ src: "", alt: "", uploadId: id, status: "uploading", preview }));
      toUpload.push(id);
    }
    if (limited) cbRef.current.onNotice(cbRef.current.labels.imageLimit);
    if (!nodes.length) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    const slice = new Slice(Fragment.from(nodes), first.isTextblock ? 1 : 0, last.isTextblock ? 1 : 0);
    editor.view.dispatch(editor.state.tr.replaceSelection(slice).scrollIntoView());
    for (const id of toUpload) startUpload(id);
  };

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      Document,
      Paragraph,
      Text,
      UndoRedo,
      TrailingNode.configure({ node: "paragraph" }),
      Placeholder.configure({ placeholder: labels.placeholder }),
      DibayImage.configure({ labels, retry, forget }),
    ],
    content: communityBodyBlocksToDoc(initialBlocks),
    editorProps: {
      attributes: {
        "aria-multiline": "true",
        role: "textbox",
        "aria-label": labels.placeholder,
      },
      handlePaste: (_view, event) => {
        const ed = editorRef.current;
        const cd = event.clipboardData;
        if (!ed || !cd) return false;
        const files = Array.from(cd.files ?? []).filter((f) => f.type.startsWith("image/"));
        if (files.length === 0) {
          for (const it of Array.from(cd.items ?? [])) {
            if (it.kind === "file" && it.type.startsWith("image/")) {
              const f = it.getAsFile();
              if (f) files.push(f);
            }
          }
        }
        const plain = cd.getData("text/plain") || "";
        const html = cd.getData("text/html") || "";
        event.preventDefault();
        const items: Array<{ block: CommunityBodyBlock } | { upload: UploadSource }> = [];
        if (files.length > 0) {
          /** 이미지 파일 + 글이 함께 오면 글을 먼저, 사진은 그 뒤에 */
          const md = html.trim() ? interleavedMarkdownFromPastedHtml(html, plain) : plain;
          const textBlocks = textToCommunityBodyBlocks(md).filter((b) => b.type === "paragraph");
          if (textBlocks.some((b) => b.type === "paragraph" && b.text.trim())) {
            for (const b of textBlocks) items.push({ block: b });
          }
          for (const f of files) items.push({ upload: { kind: "file", file: f } });
        } else {
          const md = html.trim() ? interleavedMarkdownFromPastedHtml(html, plain) : plain;
          for (const b of textToCommunityBodyBlocks(md)) items.push({ block: b });
        }
        /** 기존 textarea 붙여넣기와 같은 규칙으로 원문 페이지 주소를 재호스팅 Referer 로 넘긴다 (D9) */
        insertBlocksAtSelection(ed, items, firstLikelyArticlePageUrl(plain) ?? undefined);
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
      cbRef.current.onChange(communityDocToSnapshot(ed.getJSON() as never));
    },
    onUpdate: ({ editor: ed }) => {
      cbRef.current.onChange(communityDocToSnapshot(ed.getJSON() as never));
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
      insertLinkLine: (url) => {
        insertBlocksAtSelection(editor, [
          { block: { type: "paragraph", text: "" } },
          { block: { type: "paragraph", text: url } },
          { block: { type: "paragraph", text: "" } },
        ]);
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
      ed.state.doc.forEach((child) => {
        const p = child.attrs?.preview;
        if (typeof p === "string" && p.startsWith("blob:")) URL.revokeObjectURL(p);
      });
    },
    []
  );

  return (
    <div className={styles.root} data-testid="philife-body-editor">
      <EditorContent editor={editor} />
    </div>
  );
}
