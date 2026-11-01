"use client";

import { dibayConfirm } from "@/components/ui/dibay-overlay";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCommunityLocalFilter } from "@/hooks/use-community-local-filter";
import {
  philifeArticleOgImageUrl,
  philifeNeighborhoodPostUrl,
  philifeNeighborhoodPostsUrl,
  philifeUploadImageFromUrl,
  philifeUploadImageUrl,
} from "@domain/philife/api";
import { normalizeHttpUrlString } from "@/lib/philife/http-url-string";
import {
  interleavedImageUrlKey,
  rewriteInterleavedImages,
  interleavedMarkdownFromPastedHtml,
  isPlainClipboardMostlyImageUrls,
  stripImageReferencesPreservingParagraphs,
  stripKnownImageUrlsFromText,
  workItemsFromInterleavedMd,
} from "@/lib/philife/interleaved-body-markdown";
import {
  extractOrderedPastedImageSources,
  firstLikelyArticlePageUrl,
} from "@/lib/philife/neighborhood-write-paste";
import { fetchPhilifeNeighborhoodTopicOptionsForWrite } from "@/lib/philife/fetch-neighborhood-topic-options-client";
import { philifeAppPaths } from "@domain/philife/paths";
import { clearAllPhilifeFeedPersistentCaches } from "@/lib/community/philife-feed-session-cache";
import { mergePostBodyImages, COMMUNITY_MEMBER_POST_MAX_IMAGES } from "@/lib/philife/post-body-images";
import { uploadCommunityImageFile } from "@/lib/philife/client-image-resize";
import { runFixedDestinationBack } from "@/lib/navigation/fixed-destination-back";
import { usePhilifeWriteLeaveGuard } from "@/components/philife/use-philife-write-leave-guard";
import { PhilifeWritePhotoStrip } from "@/components/philife/PhilifeWritePhotoStrip";
import {
  PHILIFE_WRITE_FORM_ID,
  PhilifeWriteComposerHeader,
  PhilifeWriteComposerToolbar,
  usePhilifeComposerKeyboardStage,
  PhilifeWriteTopicRow,
  PhilifeWriteTopicSheet,
} from "@/components/philife/PhilifeWriteComposerChrome";
import { Sam } from "@/lib/ui/sam-component-classes";
import dynamic from "next/dynamic";
import { useCommunityWriteEditorMode } from "@/lib/philife/write-editor/use-community-write-editor-mode";
import { parseCommunityBodyToBlocks } from "@/lib/philife/write-editor/content-codec";
import {
  plainBlocksToEditorDoc,
  richBlocksToEditorDoc,
  type EditorJsonNode,
  type RichDocSnapshot,
} from "@/lib/philife/write-editor/rich-codec";
import { richBlocksImageUrls, type ImportedContentBlock } from "@/lib/community/imported-content-blocks";
import { discardCommunityUploads } from "@/lib/philife/discard-community-uploads";
import type {
  PhilifeBodyEditorApi,
  PhilifeBodyEditorUploadResult,
} from "@/components/philife/write-editor/PhilifeBodyEditor";
import { extractImageUrlsFromInterleavedContent } from "@/lib/philife/interleaved-body-markdown";
import { COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay/DibayBottomSheet";
import { MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS } from "@/lib/main-menu/bottom-nav-config";
import {
  PHILIFE_COMPOSER_BODY_CLASS,
  PHILIFE_COMPOSER_ERROR_BAND_CLASS,
  PHILIFE_COMPOSER_EXTRA_HEAD_CLASS,
  PHILIFE_COMPOSER_EXTRA_SECTION_CLASS,
  PHILIFE_COMPOSER_FIELD_INVALID_CLASS,
  PHILIFE_COMPOSER_LEGACY_TEXTAREA_CLASS,
  PHILIFE_COMPOSER_NOTICE_CLASS,
  PHILIFE_COMPOSER_PAGE_LAYER_CLASS,
  PHILIFE_COMPOSER_ROOT_CLASS,
  PHILIFE_COMPOSER_SCROLL_CLASS,
  PHILIFE_COMPOSER_SHEET_INPUT_CLASS,
  PHILIFE_COMPOSER_TITLE_INPUT_CLASS,
} from "@/lib/ui/philife-write-composer-ui";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import {
  invalidateCommunityAuthorPostsClientCaches,
  invalidateCommunityFeedCachesAfterPostModeration,
} from "@/lib/community/invalidate-community-author-posts-client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { philifeWriteTopicOptionLabel } from "@/lib/philife/philife-write-topic-label";
import type { PhilifeNeighborhoodWriteTopicOption } from "@/lib/neighborhood/philife-neighborhood-topics";

/** 새 편집기는 글쓰기에서만 로드 — 피드·상세 번들 무영향 */
const PhilifeBodyEditor = dynamic(() => import("@/components/philife/write-editor/PhilifeBodyEditor"), {
  ssr: false,
  loading: () => <div className="min-h-[40dvh]" aria-busy="true" />,
});

interface PhilifeNeighborhoodWriteFormProps {
  initialCategory?: string;
  /** Native owner edit — PATCH neighborhood-posts/[postId]; sheet entry must not set this. */
  editPostId?: string;
  initialTitle?: string;
  initialContent?: string;
  initialImages?: string[];
  /** 수정 모드: 회원 서식 본문(`content_blocks`) — 있으면 편집기를 이것으로 연다 */
  initialContentBlocks?: ImportedContentBlock[] | null;
  /** 수정 모드: 원 주제 표시명 — 주제가 숨김·비활성이라 목록에 없을 때 표시 */
  initialTopicName?: string;
  /**
   * true = 피드 **시트** 안(시트가 화면 전체 층을 만든다). false = `/philife/write` 별도 페이지(이 폼이 화면 전체 층을 만든다).
   */
  suppressWriteScreenTier1?: boolean;
  /** 풀페이지 제출 직전(`router` 이동 전) — 시트 닫기 등 */
  onWillNavigateAfterSuccess?: () => void;
  /**
   * 시트 전용: 제출 성공 직전 — 아래로 닫힘 애니메이션·`close()` 후 `await` 끝나고 `router.replace` 실행
   * (`onWillNavigateAfterSuccess` 대체)
   */
  onSheetExitBeforeNavigate?: () => Promise<void>;
  /** 시트 전용: ✕ — 아래로 닫힘 애니메이션 후 닫힘(동기 또는 Promise) */
  onSheetClose?: () => void | Promise<void>;
  /** 시트 전용: 다른 메뉴 이탈 가드용 — `suppressWriteScreenTier1` 일 때만 의미 있음 */
  onSheetBlockingDraftChange?: (hasDraft: boolean) => void;
}

/**
 * 커뮤니티 글쓰기 작성기 — 시트·`/philife/write`·`?edit=` 공통 (재설계 2026-11-01, `docs/philife-write-composer-ssot.md`).
 * 화면: 헤더(✕·제목·등록) → 오류 띠 → 주제 줄 → 제목 → 본문 → 아래 도구줄(키보드 위).
 * 모임 만들기는 메신저 오픈채팅 찾기로 이동하므로 이 폼에 모임 분기가 없다.
 */
export function PhilifeNeighborhoodWriteForm({
  initialCategory,
  editPostId,
  initialTitle,
  initialContent,
  initialImages,
  initialContentBlocks,
  initialTopicName,
  suppressWriteScreenTier1 = false,
  onWillNavigateAfterSuccess,
  onSheetExitBeforeNavigate,
  onSheetClose,
  onSheetBlockingDraftChange,
}: PhilifeNeighborhoodWriteFormProps) {
  const { t, language } = useI18n();
  const router = useRouter();
  const pathname = usePathname() ?? "/philife";
  /** 글쓰기 위치 = 커뮤니티 Local 필터(대표 주소 CITY seed / 명시 선택 CITY) — profiles 상세주소 미사용 (ADDR-PRIV-001) */
  const {
    locationKey: localLocationKey,
    locationMeta: localLocationMeta,
    filterLabel: localRegionLabel,
  } = useCommunityLocalFilter();
  const isEditMode = Boolean(editPostId?.trim());
  const isSheet = suppressWriteScreenTier1;
  const fileRef = useRef<HTMLInputElement>(null);
  const writeScrollBodyRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { effectiveViewportBottom } = useFormKeyboardViewport();
  const { stageStyle: keyboardStageStyle } = usePhilifeComposerKeyboardStage();
  useFormKeyboardFocusVisibility({
    scrollRootRef: writeScrollBodyRef,
    effectiveViewportBottom,
  });
  const [writeTopicOptions, setWriteTopicOptions] = useState<PhilifeNeighborhoodWriteTopicOption[]>([]);
  /** `writeTopicOptions.length === 0` 이 로딩 중인지·진짜 비어 있는지 구분 */
  const [writeTopicOptionsLoad, setWriteTopicOptionsLoad] = useState<"loading" | "ready">("loading");
  const [category, setCategory] = useState<string>(() =>
    initialCategory === "meetup" ? "" : (initialCategory?.trim().toLowerCase() || "")
  );
  const [title, setTitle] = useState(() => initialTitle ?? "");
  const [content, setContent] = useState(() => initialContent ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  /** 기존 편집기: 사진 줄 · 새 편집기: 수정하는 글의 「기존 첨부 사진」(삭제만) */
  const [imageUrls, setImageUrls] = useState<string[]>(() =>
    Array.isArray(initialImages) ? initialImages.filter((u) => (u ?? "").trim()) : []
  );
  const imageUrlsCountRef = useRef(0);
  /** 닫기 확인 생략 판정 (지정 #12) — 초기값 대비 입력이 바뀌었는지 */
  const hasUnsavedWriteChanges =
    title !== (initialTitle ?? "") ||
    content.trim() !== (initialContent ?? "").trim() ||
    mergePostBodyImages({ content, candidates: imageUrls }).join("\n") !==
      mergePostBodyImages({
        content: initialContent ?? "",
        candidates: Array.isArray(initialImages) ? initialImages : [],
      }).join("\n");
  const [uploading, setUploading] = useState(false);
  /** 주제 시트 (CM-W-01) — 자동 선택 없음 */
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  /** 필드별 입력 검증 — 제출 시 표시, 입력하면 해제 */
  const [fieldErr, setFieldErr] = useState<{ topic?: string; title?: string; content?: string }>({});
  /** 수정 모드: 회원이 주제를 직접 바꿨을 때만 PATCH 에 category 를 보낸다 (CM-P2-09) */
  const [categoryTouched, setCategoryTouched] = useState(false);

  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingContentCaretRef = useRef<number | null>(null);
  /** setState 전에 연속 제출이 들어오는 경우(더블 탭 등) 동기적으로 막음 */
  const submitLockRef = useRef(false);
  /** 등록·수정 성공 후 화면 이동 중 */
  const navigatingAfterSubmitRef = useRef(false);

  /**
   * 새 편집기(WYSIWYG) — `COMMUNITY_WYSIWYG_EDITOR` 플래그.
   * 본문 원천은 항상 `content` 문자열(기존 저장 계약)이며, 편집기는 무손실 파싱된 경우에만 연다.
   */
  const editorMode = useCommunityWriteEditorMode();
  const [editorSeed, setEditorSeed] = useState<{ doc: EditorJsonNode; epoch: number } | null>(null);
  const [editorSnap, setEditorSnap] = useState<RichDocSnapshot | null>(null);
  /** 이번 작성 중 올린 사진 — 등록 후 안 쓴 것·작성 취소 시 정리 요청 (Owner 승인 ③) */
  const sessionUploadsRef = useRef(new Set<string>());
  /** 본문(편집기) 사진 수 — 10장 합계 판정 */
  const bodyImageCountRef = useRef(0);
  const [editorFallbackNotice, setEditorFallbackNotice] = useState(false);
  const editorApiRef = useRef<PhilifeBodyEditorApi | null>(null);
  const editorFileRef = useRef<HTMLInputElement>(null);
  /** 아래 도구줄 안 서식 단추 자리(편집기가 portal 로 채운다) */
  const [formatHost, setFormatHost] = useState<HTMLDivElement | null>(null);
  /** 링크 시트: null = 닫힘 */
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [linkErr, setLinkErr] = useState("");
  const me = getCurrentUser();

  useEffect(() => {
    imageUrlsCountRef.current = imageUrls.length;
  }, [imageUrls.length]);

  useLayoutEffect(() => {
    if (pendingContentCaretRef.current == null) return;
    const p = pendingContentCaretRef.current;
    pendingContentCaretRef.current = null;
    const ta = contentTextareaRef.current;
    if (!ta) return;
    ta.setSelectionRange(p, p);
    ta.focus();
  }, [content]);

  /** 별도 페이지: 화면 전체 층을 붙일 곳(body) — 클라이언트에서만 */
  const [pageLayerHost, setPageLayerHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!isSheet) setPageLayerHost(document.body);
  }, [isSheet]);

  /** 별도 페이지: 화면 전체 층 아래 본문이 키보드에 밀려 스크롤되지 않게 (시트는 시트가 잠근다) */
  useEffect(() => {
    if (isSheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isSheet]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) setWriteTopicOptionsLoad("loading");
      try {
        const j = await fetchPhilifeNeighborhoodTopicOptionsForWrite();
        if (cancelled) return;
        if (!j?.ok || !Array.isArray(j.writeTopics) || j.writeTopics.length === 0) {
          setWriteTopicOptions([]);
          setCategory((prev) => (isEditMode ? prev : ""));
          return;
        }
        setWriteTopicOptions(j.writeTopics);
        setCategory((prev) => {
          if (prev && j.writeTopics!.some((o) => o.slug === prev)) return prev;
          const initial = initialCategory?.trim().toLowerCase() ?? "";
          if (initial && j.writeTopics!.some((o) => o.slug === initial)) return initial;
          /** 수정: 숨김·비활성 주제여도 원 주제를 유지(목록 첫 주제로 바꾸지 않음) */
          if (isEditMode) return prev || initial;
          /** 신규: 미리 선택할 주제가 없으면 주제 선택 단계부터 */
          return "";
        });
      } catch {
        if (!cancelled) {
          setWriteTopicOptions([]);
          setCategory((prev) => (isEditMode ? prev : ""));
        }
      } finally {
        if (!cancelled) setWriteTopicOptionsLoad("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialCategory, isEditMode]);

  /**
   * 주제 선택 SSOT (iOS / APK / Windows 동일): 폼 category 만 갱신한다.
   * - 시트·풀페이지 모두 URL 을 바꾸지 않는다 — 피드 탭 머신·주제 목록 재요청을 건드리지 않음 (CM-W-04).
   * - 제출 성공 후 게시글 상세로 이동한다.
   */
  const applyWriteCategory = useCallback((slug: string) => {
    const next = slug.trim().toLowerCase();
    if (!next || next === "meetup") return;
    setCategory(next);
    setCategoryTouched(true);
    setTopicMenuOpen(false);
    setFieldErr((f) => ({ ...f, topic: undefined }));
  }, []);

  /** 업로드 실패도 결과로 돌려준다 — 네트워크·비 JSON(413)·서버 오류 (CM-P1-03) */
  const postMultipartFile = useCallback(
    async (f: File): Promise<{ ok?: boolean; url?: string; error?: string }> => {
      const r = await uploadCommunityImageFile(philifeUploadImageUrl(), f, {
        network: t("philife_write_err_network"),
        tooLarge: t("philife_write_err_image_too_large"),
        failed: t("philife_write_err_image_upload"),
      });
      if (r.ok) sessionUploadsRef.current.add(r.url);
      return r.ok ? { ok: true, url: r.url } : { ok: false, error: r.error };
    },
    [t]
  );

  /** 기존 편집기 사진 줄에 추가 */
  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!files.length) return;
    const cap = COMMUNITY_MEMBER_POST_MAX_IMAGES;
    setUploading(true);
    setErr("");
    try {
      for (const f of files) {
        const used = imageUrlsCountRef.current + bodyImageCountRef.current;
        if (used >= cap) {
          setErr(t("philife_write_err_image_limit"));
          break;
        }
        const j = await postMultipartFile(f);
        if (j.ok && j.url) {
          const url = j.url;
          imageUrlsCountRef.current += 1;
          /** 성공분은 즉시 반영 — 뒤 파일이 실패해도 앞 사진을 잃지 않는다 */
          setImageUrls((prev) => [...prev, url].slice(0, cap));
        } else {
          setErr(j.error ?? t("philife_write_err_image_upload"));
        }
      }
    } catch {
      setErr(t("philife_write_err_image_upload"));
    } finally {
      setUploading(false);
    }
  };

  const onContentPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const cd = e.clipboardData;
    if (!cd) return;

    const fromFiles = Array.from(cd.files ?? []).filter((f) => f.type.startsWith("image/"));
    const imageFiles: File[] = fromFiles;
    if (imageFiles.length === 0) {
      for (const it of Array.from(cd.items)) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) imageFiles.push(f);
        }
      }
    }

    const insertPlainAtSelection = (plain: string) => {
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      setContent((prev) => prev.slice(0, start) + plain + prev.slice(end));
      pendingContentCaretRef.current = start + plain.length;
    };

    if (imageFiles.length > 0) {
      e.preventDefault();
      const plainClip = cd.getData("text/plain") || "";
      const htmlClip = cd.getData("text/html") || "";
      /**
       * 이미지 파일+HTML 동시 클립보드가 일반적입니다.
       * 파일 분기에서도 HTML을 먼저 본문으로 복원하고 이미지 참조만 제거합니다.
       */
      const richClip = htmlClip.trim()
        ? interleavedMarkdownFromPastedHtml(htmlClip, plainClip)
        : plainClip;
      const pastedText = stripImageReferencesPreservingParagraphs(richClip);
      if (pastedText && !isPlainClipboardMostlyImageUrls(pastedText)) {
        insertPlainAtSelection(pastedText);
      }
      setUploading(true);
      setErr("");
      try {
        for (const f of imageFiles) {
          if (imageUrlsCountRef.current >= COMMUNITY_MEMBER_POST_MAX_IMAGES) {
            setErr(t("philife_write_err_image_limit"));
            break;
          }
          const j = await postMultipartFile(f);
          if (j.ok && j.url) {
            const url = j.url;
            imageUrlsCountRef.current += 1;
            setImageUrls((prev) => [...prev, url].slice(0, COMMUNITY_MEMBER_POST_MAX_IMAGES));
          } else {
            setErr(j.error ?? t("philife_write_err_image_upload"));
          }
        }
      } catch {
        setErr(t("philife_write_err_image_upload"));
      } finally {
        setUploading(false);
      }
      return;
    }

    const plain0 = cd.getData("text/plain") || "";
    const html = cd.getData("text/html") || "";
    const richMd = html.trim() ? interleavedMarkdownFromPastedHtml(html, plain0) : null;
    const workFromMd = richMd ? workItemsFromInterleavedMd(richMd) : [];
    const workFromHtml = html.trim() ? extractOrderedPastedImageSources(html, plain0) : [];
    const useInterleaved = Boolean(richMd && workFromMd.length > 0);
    let work =
      useInterleaved && workFromMd.length > 0
        ? workFromMd
        : workFromHtml.length > 0
          ? workFromHtml
          : [];
    const pageRef = firstLikelyArticlePageUrl(plain0) ?? undefined;

    if (work.length === 0 && !pageRef) {
      return;
    }

    e.preventDefault();
    const el = e.currentTarget;
    const sa = el.selectionStart;
    const sb = el.selectionEnd;
    const value = el.value;
    const before = value.slice(0, sa);
    const after = value.slice(sb);
    /**
     * 이미지가 있으면 교차 마크다운 우선.
     * plain 폴백 시에도 단독 이미지 URL 은 본문에서 제거(썸네일 주소 텍스트 노출 방지).
     */
    let middle =
      useInterleaved && richMd
        ? richMd
        : stripImageReferencesPreservingParagraphs(plain0 || "");
    if (!middle.trim() && useInterleaved && richMd) {
      middle = richMd;
    }
    setContent(before + middle + after);
    pendingContentCaretRef.current = sa + middle.length;
    setUploading(true);
    setErr("");

    let usedOgForInitialWork = false;
    if (work.length === 0 && pageRef) {
      let jg: { ok?: boolean; imageUrl?: string; error?: string } = {};
      try {
        const res = await fetch(philifeArticleOgImageUrl(), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageUrl: pageRef }),
        });
        jg = (await res.json()) as typeof jg;
      } catch {
        jg = { ok: false, error: t("philife_write_err_network") };
      }
      if (jg.ok && jg.imageUrl) {
        work = [{ kind: "http" as const, value: jg.imageUrl }];
        usedOgForInitialWork = true;
      } else {
        setErr(jg.error ?? t("philife_write_err_og_article"));
        setUploading(false);
        return;
      }
    }

    const MAX_PASTE_BYTES = 8 * 1024 * 1024;
    const pasteFormats = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    const embeddable = (s: string) => {
      try {
        const u = new URL(normalizeHttpUrlString(s));
        return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.length > 0;
      } catch {
        return false;
      }
    };
    const tryRehostFromHttp = async (rawUrl: string) => {
      let res: Response;
      try {
        res = await fetch(philifeUploadImageFromUrl(), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: rawUrl, pageReferer: pageRef || undefined }),
        });
      } catch {
        return { kind: "error" as const, message: t("philife_write_err_network") };
      }
      let j: { ok?: boolean; url?: string; error?: string } = {};
      try {
        j = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      } catch {
        return { kind: "error" as const, message: t("philife_write_err_parse") };
      }
      if (res.ok && j.ok && j.url) {
        sessionUploadsRef.current.add(j.url);
        return { kind: "hosted" as const, url: j.url };
      }
      return { kind: "error" as const, message: j.error };
    };
    const tryRehostDataUrl = async (dataUrl: string) => {
      let blob: Blob;
      try {
        blob = await (await fetch(dataUrl)).blob();
      } catch {
        return { kind: "err" as const, message: t("philife_write_err_image_upload") };
      }
      if (!blob.type.startsWith("image/") || !pasteFormats.has(blob.type)) {
        return { kind: "none" as const };
      }
      if (blob.size > MAX_PASTE_BYTES) {
        return { kind: "err" as const, message: t("philife_write_err_image_max_size") };
      }
      const ext =
        blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : blob.type === "image/gif" ? "gif" : "jpg";
      const f = new File([blob], `paste.${ext}`, { type: blob.type });
      const j = await postMultipartFile(f);
      if (j.ok && j.url) return { kind: "hosted" as const, url: j.url };
      return { kind: "err" as const, message: j.error ?? t("philife_write_err_image_upload") };
    };

    const urlPairs: { from: string; to: string }[] = [];
    try {
      /** 본문 이미지 + 첨부 줄 합계 기준 10장 */
      const cap = Math.max(
        0,
        COMMUNITY_MEMBER_POST_MAX_IMAGES - mergePostBodyImages({ content, candidates: imageUrls }).length
      );
      const out: string[] = [];
      let i = 0;

      while (i < work.length && out.length < cap) {
        const item = work[i]!;
        if (item.kind === "data") {
          const r = await tryRehostDataUrl(item.value);
          if (r.kind === "hosted") {
            out.push(r.url);
            urlPairs.push({ from: item.value, to: r.url });
          } else if (r.kind === "err" && r.message) {
            setErr(r.message);
          }
          i += 1;
          continue;
        }
        const raw = normalizeHttpUrlString(item.value);
        if (embeddable(raw)) {
          const rh = await tryRehostFromHttp(raw);
          if (rh.kind === "hosted") {
            out.push(rh.url);
            urlPairs.push({ from: raw, to: rh.url });
          } else if (rh.kind === "error" && rh.message) {
            /** 외부 URL 을 images/본문에 그대로 넣지 않음 — 불안정·URL 텍스트 노출 방지 */
            setErr(rh.message);
          }
        }
        i += 1;
      }

      if (out.length === 0 && pageRef && !usedOgForInitialWork) {
        let j2: { ok?: boolean; imageUrl?: string; error?: string } = {};
        try {
          const res2 = await fetch(philifeArticleOgImageUrl(), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pageUrl: pageRef }),
          });
          j2 = (await res2.json()) as typeof j2;
        } catch {
          j2 = { ok: false, error: t("philife_write_err_network") };
        }
        if (j2.ok && j2.imageUrl) {
          const rh = await tryRehostFromHttp(j2.imageUrl);
          if (rh.kind === "hosted") {
            out.push(rh.url);
            urlPairs.push({ from: normalizeHttpUrlString(j2.imageUrl), to: rh.url });
          } else {
            setErr(t("philife_write_err_thumb_upload"));
          }
        } else {
          setErr(j2.error ?? t("philife_write_err_og_meetup"));
        }
      }
      if (useInterleaved && richMd) {
        /**
         * 교차 본문: 현재 본문에서 URL 단위로 처리 — 재호스팅된 이미지는 DIBAY 주소로 교체,
         * 실패·10장 초과분은 이미지 문법을 지운다(외부 URL 이 남아 등록이 막히지 않게, CM-R-07·CM-P2-11).
         * 업로드 중 사용자가 그 문단을 고쳐도 위치와 무관하게 정확히 처리된다.
         */
        const hostedByKey = new Map(urlPairs.map((p) => [interleavedImageUrlKey(p.from), p.to]));
        const pastedKeys = new Set(work.map((w) => interleavedImageUrlKey(w.value)));
        setContent((prev) =>
          rewriteInterleavedImages(prev, (key) => {
            const hosted = hostedByKey.get(key);
            if (hosted) return hosted;
            return pastedKeys.has(key) ? null : undefined;
          })
        );
      }
      if (out.length) {
        /** 교차 본문 이미지는 본문이 원천 — 첨부 줄에는 plain 경로만 */
        if (!(useInterleaved && richMd)) {
          imageUrlsCountRef.current += out.length;
          setImageUrls((prev) => [...prev, ...out].slice(0, COMMUNITY_MEMBER_POST_MAX_IMAGES));
        }
        let newMid: string;
        if (useInterleaved && richMd) {
          newMid = middle;
        } else {
          /** plain 경로: 썸네일은 imageUrls — 본문에 이미지 주소 텍스트 남기지 않음 */
          const leakSources = [
            ...out,
            ...urlPairs.map((p) => p.from),
            ...urlPairs.map((p) => p.to),
          ];
          newMid = stripImageReferencesPreservingParagraphs(
            stripKnownImageUrlsFromText(middle, leakSources)
          );
        }
        if (newMid !== middle) {
          /**
           * 업로드(최대 20초) 동안 사용자가 입력한 글자를 덮어쓰지 않도록,
           * 붙여넣기로 넣은 구간만 현재 본문에서 치환한다 (CM-P2-08).
           */
          setContent((prev) => {
            const at = prev.indexOf(middle);
            return at < 0 ? prev : prev.slice(0, at) + newMid + prev.slice(at + middle.length);
          });
        }
      } else if (!pageRef) {
        setErr(t("philife_write_err_paste_align"));
      } else if (usedOgForInitialWork) {
        setErr(t("philife_write_err_thumb_display"));
      }
    } catch {
      setErr(t("philife_write_err_image_upload"));
    } finally {
      setUploading(false);
    }
  };

  const wantWysiwyg = editorMode.useWysiwyg;
  useEffect(() => {
    if (!wantWysiwyg) {
      setEditorSeed(null);
      setEditorSnap(null);
      return;
    }
    if (editorSeed) return;
    /** 서식 글 수정: 저장된 블록으로 연다(본문을 아직 안 고쳤을 때만 — 평문 원천과 같을 때) */
    if (initialContentBlocks?.length && content === (initialContent ?? "")) {
      setEditorFallbackNotice(false);
      const inBody = new Set(richBlocksImageUrls(initialContentBlocks));
      setImageUrls((prev) => prev.filter((u) => !inBody.has(u)));
      setEditorSeed({ doc: richBlocksToEditorDoc(initialContentBlocks), epoch: Date.now() });
      return;
    }
    const parsed = parseCommunityBodyToBlocks(content);
    if (!parsed.ok) {
      /** 무손실 변환 불가 본문 — 조용히 바꾸지 않고 기존 편집기 유지 */
      setEditorFallbackNotice(true);
      return;
    }
    setEditorFallbackNotice(false);
    /** 본문에 이미 있는 사진은 편집기 안에 있으므로 하단 줄에는 본문 밖 사진만 남긴다 */
    const inBody = new Set(extractImageUrlsFromInterleavedContent(content));
    setImageUrls((prev) => prev.filter((u) => !inBody.has(u)));
    setEditorSeed({ doc: plainBlocksToEditorDoc(parsed.blocks), epoch: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 편집기 진입 시점의 본문으로 1회 시드
  }, [wantWysiwyg]);

  const onEditorChange = useCallback((snap: RichDocSnapshot) => {
    bodyImageCountRef.current = snap.imageNodeCount;
    setEditorSnap(snap);
    setContent(snap.content);
  }, []);

  const editorUploadFile = useCallback(
    async (f: File): Promise<PhilifeBodyEditorUploadResult> => {
      const j = await postMultipartFile(f);
      return j.ok && j.url ? { ok: true, url: j.url } : { ok: false, error: j.error ?? t("philife_write_err_image_upload") };
    },
    [postMultipartFile, t]
  );

  /** 외부 이미지·data URL → post-images 재호스팅. 실패 시 외부 URL 을 저장하지 않는다 (CM-P2-11) */
  const editorRehostUrl = useCallback(
    async (raw: string, pageReferer?: string): Promise<PhilifeBodyEditorUploadResult> => {
      const failed = t("philife_write_err_image_upload");
      if (/^data:image\//i.test(raw)) {
        try {
          const blob = await (await fetch(raw)).blob();
          const ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : blob.type === "image/gif" ? "gif" : "jpg";
          return editorUploadFile(new File([blob], `paste.${ext}`, { type: blob.type || "image/jpeg" }));
        } catch {
          return { ok: false, error: failed };
        }
      }
      const url = normalizeHttpUrlString(raw.startsWith("//") ? `https:${raw}` : raw);
      try {
        const res = await fetch(philifeUploadImageFromUrl(), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, pageReferer: pageReferer || undefined }),
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
        if (res.ok && j.ok && j.url) {
          sessionUploadsRef.current.add(j.url);
          return { ok: true, url: j.url };
        }
        return { ok: false, error: j.error || failed };
      } catch {
        return { ok: false, error: t("philife_write_err_network") };
      }
    },
    [editorUploadFile, t]
  );

  const editorUploading = Boolean(editorSeed && editorSnap && editorSnap.uploadingCount > 0);
  const editorFailed = Boolean(editorSeed && editorSnap && editorSnap.failedCount > 0);

  /** 제출 직전 본문·이미지 확정 — 편집기 모드와 무관하게 같은 계약(평문 + `![](url)`, images = 본문 ∪ 첨부) */
  const composeBodyForSubmit = ():
    | { ok: true; content: string; images: string[]; contentBlocks?: unknown[] }
    | { ok: false; error: string } => {
    if (uploading || editorUploading) return { ok: false, error: t("philife_write_submit_blocked_uploading") };
    if (editorFailed) return { ok: false, error: t("philife_write_submit_blocked_failed") };
    const c = (editorSeed && editorSnap ? editorSnap.content : content).trim();
    return {
      ok: true,
      content: c,
      images: mergePostBodyImages({ content: c, candidates: imageUrls }),
      /** 편집기 사용 시 서식 블록 — 서버가 정제하고 `content` 를 블록에서 다시 만든다 */
      ...(editorSeed && editorSnap ? { contentBlocks: editorSnap.blocks } : {}),
    };
  };

  /** 이번 작성 중 올렸지만 최종 글에 없는 사진 정리 요청 — 서버가 미참조·본인·24시간 이내만 지운다 */
  const discardUnusedUploads = useCallback((keep: readonly string[]) => {
    const keepSet = new Set(keep);
    const urls = [...sessionUploadsRef.current].filter((u) => !keepSet.has(u));
    sessionUploadsRef.current.clear();
    discardCommunityUploads(urls);
  }, []);

  const editorBodyText = (editorSeed && editorSnap ? editorSnap.content : content).trim();

  /** 빈 칸 첫 곳으로 — 주제는 시트를 연다, 제목·본문은 커서 */
  const focusFirstInvalid = (fe: { topic?: string; title?: string; content?: string }) => {
    if (fe.topic) {
      setTopicMenuOpen(true);
      return;
    }
    if (fe.title) {
      titleInputRef.current?.focus();
      return;
    }
    if (fe.content) {
      if (editorSeed) editorApiRef.current?.focus();
      else contentTextareaRef.current?.focus();
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current || busy) return;
    submitLockRef.current = true;
    try {
      setErr("");
      const editId = editPostId?.trim() ?? "";

      if (editId) {
        const body = composeBodyForSubmit();
        if (!body.ok) {
          setErr(body.error);
          return;
        }
        const composedContent = body.content;
        const editFieldErr = {
          title: title.trim() ? undefined : t("philife_write_err_title"),
          content: composedContent ? undefined : t("philife_write_err_content"),
        };
        setFieldErr(editFieldErr);
        if (editFieldErr.title || editFieldErr.content) {
          focusFirstInvalid(editFieldErr);
          return;
        }
        const writeNext =
          typeof window !== "undefined" ? `${pathname}${window.location.search}` : pathname;
        if (!(await requireAuthAction("community_write", async () => {}, { next: writeNext }))) {
          return;
        }
        setBusy(true);
        try {
          const res = await fetch(philifeNeighborhoodPostUrl(editId), {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              /** 회원이 주제를 바꾸지 않았으면 생략 → 서버가 기존 주제 유지 (CM-P2-09) */
              ...(categoryTouched && category ? { category } : {}),
              title: title.trim(),
              content: composedContent,
              images: body.images,
              ...(body.contentBlocks ? { contentBlocks: body.contentBlocks } : {}),
            }),
          });
          let j: { ok?: boolean; error?: string };
          try {
            j = (await res.json()) as { ok?: boolean; error?: string };
          } catch {
            setErr(t("philife_write_err_server_response"));
            return;
          }
          if (!res.ok || !j.ok) {
            const msg = j.error ?? t("philife_write_err_register_failed");
            if (redirectForBlockedAction(router, msg, pathname)) return;
            setErr(msg);
            return;
          }
          discardUnusedUploads(body.images);
          const authorId = getCurrentUser()?.id?.trim();
          if (authorId) invalidateCommunityAuthorPostsClientCaches(authorId);
          /** 수정한 글이 피드에 이전 제목·썸네일로 남지 않게 persistent 캐시에서도 뺀다 (CM-R-09) */
          invalidateCommunityFeedCachesAfterPostModeration(editId);
          navigatingAfterSubmitRef.current = true;
          await leaveGuard.release();
          if (onSheetExitBeforeNavigate) {
            await onSheetExitBeforeNavigate();
          } else {
            onWillNavigateAfterSuccess?.();
          }
          router.replace(philifeAppPaths.post(editId));
          /**
           * 라우터 캐시(staleTimes.dynamic 300초)에 남은 수정 전 상세·수정 화면을 비운다 — 상세에 예전 제목이 보이고,
           * 다시 「수정」하면 예전 값으로 열려 저장 시 되돌아가던 결함 (실기 6차 2026-11-01, revisions 8→9 제목 되돌림)
           */
          router.refresh();
          return;
        } catch {
          setErr(t("philife_write_err_network_occurred"));
        } finally {
          /** 이동 시작 후에는 버튼을 다시 열지 않는다 — 중복 등록 방지 (CM-P3-16) */
          if (!navigatingAfterSubmitRef.current) setBusy(false);
        }
        return;
      }

      const locationKey = localLocationKey || null;
      const locationMeta = localLocationMeta;
      const locationName = localRegionLabel.trim();
      if (!locationKey || !locationMeta) {
        setErr(t("philife_write_err_region_required"));
        return;
      }
      if (writeTopicOptions.length === 0) {
        setErr(t("philife_write_no_topics_member"));
        return;
      }
      const nextFieldErr = {
        topic: category ? undefined : t("philife_write_topic_required"),
        title: title.trim() ? undefined : t("philife_write_err_title"),
        content: editorBodyText ? undefined : t("philife_write_err_content"),
      };
      setFieldErr(nextFieldErr);
      if (nextFieldErr.topic || nextFieldErr.title || nextFieldErr.content) {
        focusFirstInvalid(nextFieldErr);
        return;
      }
      const bodyForSubmit = composeBodyForSubmit();
      if (!bodyForSubmit.ok) {
        setErr(bodyForSubmit.error);
        return;
      }
      const composedContent = bodyForSubmit.content;

      const writeNext =
        typeof window !== "undefined" ? `${pathname}${window.location.search}` : pathname;
      if (!(await requireAuthAction("community_write", async () => {}, { next: writeNext }))) {
        return;
      }

      setBusy(true);
      try {
        const payload: Record<string, unknown> = {
          locationKey,
          city: locationMeta.city,
          district: locationMeta.district,
          locationName: locationMeta.name || locationName,
          category,
          title: title.trim(),
          content: composedContent,
          images: bodyForSubmit.images,
          ...(bodyForSubmit.contentBlocks ? { contentBlocks: bodyForSubmit.contentBlocks } : {}),
        };
        const res = await fetch(philifeNeighborhoodPostsUrl(), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        let j: { ok?: boolean; id?: string; error?: string };
        try {
          j = (await res.json()) as { ok?: boolean; id?: string; error?: string };
        } catch {
          setErr(t("philife_write_err_server_response"));
          return;
        }
        if (!res.ok || !j.ok || !j.id) {
          const msg = j.error ?? t("philife_write_err_register_failed");
          if (redirectForBlockedAction(router, msg, pathname)) return;
          setErr(msg);
          return;
        }
        discardUnusedUploads(bodyForSubmit.images);
        const authorId = getCurrentUser()?.id?.trim();
        if (authorId) invalidateCommunityAuthorPostsClientCaches(authorId);
        /** 새 글이 목록에 바로 보이도록 persistent 피드 캐시도 비운다 (CM-W-06) */
        clearAllPhilifeFeedPersistentCaches();

        /** 일반 글은 게시글 상세로 이동 (CM-W-05) */
        navigatingAfterSubmitRef.current = true;
        await leaveGuard.release();
        if (onSheetExitBeforeNavigate) {
          await onSheetExitBeforeNavigate();
        } else {
          onWillNavigateAfterSuccess?.();
        }
        router.replace(philifeAppPaths.post(j.id));
        /** 피드·상세 라우터 캐시 비우기 — 새 글이 목록에 바로 보이게 */
        router.refresh();
      } catch {
        setErr(t("philife_write_err_network_occurred"));
      } finally {
        if (!navigatingAfterSubmitRef.current) setBusy(false);
      }
    } finally {
      if (!navigatingAfterSubmitRef.current) submitLockRef.current = false;
    }
  };

  const sheetHasDraft = useCallback(
    (): boolean => Boolean(title.trim() || content.trim() || imageUrls.length > 0),
    [title, content, imageUrls.length]
  );

  const sheetBlockingDraft = isSheet ? sheetHasDraft() : false;

  useEffect(() => {
    if (!onSheetBlockingDraftChange) return;
    onSheetBlockingDraftChange(sheetBlockingDraft);
    return () => {
      onSheetBlockingDraftChange(false);
    };
  }, [sheetBlockingDraft, onSheetBlockingDraftChange]);

  /** 나가기 확인 1종 — ✕·뒤로·탭 이동 모두 같은 문구 (재설계 §3-7) */
  const confirmDiscard = useCallback(
    () =>
      dibayConfirm({
        title: t(isEditMode ? "philife_write_leave_title_edit" : "philife_write_leave_title"),
        description: t(isEditMode ? "philife_write_leave_body_edit" : "philife_write_leave_body"),
        cancelLabel: t("philife_write_leave_stay"),
        confirmLabel: t("philife_write_leave_go"),
        confirmTone: "destructive",
      }),
    [t, isEditMode]
  );
  const pageBackHref = editPostId?.trim() ? philifeAppPaths.post(editPostId.trim()) : philifeAppPaths.home;
  const hasDraftForLeave = useCallback(
    () => (isEditMode ? hasUnsavedWriteChanges || categoryTouched : sheetHasDraft()),
    [isEditMode, hasUnsavedWriteChanges, categoryTouched, sheetHasDraft]
  );

  /** 하드웨어·브라우저·스와이프 뒤로가기 이탈 가드 (CM-P2-10) */
  const leaveGuard = usePhilifeWriteLeaveGuard({
    active: true,
    consumeBackInternally: () => {
      if (topicMenuOpen) {
        setTopicMenuOpen(false);
        return true;
      }
      if (linkDraft !== null) {
        setLinkDraft(null);
        return true;
      }
      return false;
    },
    shouldConfirm: hasDraftForLeave,
    confirmLeave: confirmDiscard,
    onLeave: () => {
      discardUnusedUploads([]);
      if (isSheet && onSheetClose) {
        void Promise.resolve(onSheetClose()).catch(() => {});
        return;
      }
      runFixedDestinationBack(router, pageBackHref);
    },
  });

  const handleClose = useCallback(async () => {
    if (hasDraftForLeave() && !(await confirmDiscard())) return;
    discardUnusedUploads([]);
    await leaveGuard.release();
    if (isSheet && onSheetClose) {
      try {
        await Promise.resolve(onSheetClose());
      } catch {
        /* no-op */
      }
      return;
    }
    runFixedDestinationBack(router, pageBackHref);
  }, [isSheet, onSheetClose, router, hasDraftForLeave, confirmDiscard, leaveGuard, pageBackHref, discardUnusedUploads]);

  const selectedTopicOption = writeTopicOptions.find((o) => o.slug === category) ?? null;
  const topicLabel = selectedTopicOption
    ? philifeWriteTopicOptionLabel(t, selectedTopicOption, language)
    : isEditMode && category
      ? `${initialTopicName?.trim() || category} ${t("philife_write_topic_paused_suffix")}`
      : null;
  const noTopics = writeTopicOptionsLoad === "ready" && writeTopicOptions.length === 0 && !isEditMode;

  /** 업로드 중·실패 등록 차단 (CM-P2-07) */
  const submitBlockedReason =
    uploading || editorUploading
      ? t("philife_write_submit_blocked_uploading")
      : editorFailed
        ? t("philife_write_submit_blocked_failed")
        : "";
  const submitDisabled =
    uploading || editorUploading || editorFailed || writeTopicOptionsLoad !== "ready" || noTopics;
  const ctaReady = Boolean(category && title.trim() && editorBodyText) && !submitDisabled;
  /** 빈 칸 안내는 남은 첫 빈 칸만 — 칸을 채우면 띠도 바로 바뀌거나 사라진다 (실기 2026-11-01 iPhone) */
  const firstFieldErr = fieldErr.topic ?? fieldErr.title ?? fieldErr.content ?? "";
  const bandMessage = err || firstFieldErr || submitBlockedReason || (noTopics ? t("philife_write_no_topics_member") : "");

  const photoCount = editorSeed
    ? (editorSnap?.imageNodeCount ?? 0) + imageUrls.length
    : mergePostBodyImages({ content, candidates: imageUrls }).length;

  const onToolbarPhoto = () => {
    setErr("");
    if (editorSeed) editorFileRef.current?.click();
    else fileRef.current?.click();
  };

  const insertLink = () => {
    const v = (linkDraft ?? "").trim();
    if (!/^https?:\/\/\S+$/i.test(v)) {
      setLinkErr(t("philife_write_link_invalid"));
      return;
    }
    /** 시트 입력칸에서 입력기 조합을 먼저 끝낸 뒤(blur) 편집기에 넣는다 — 남은 글자가 편집기로 확정되지 않게 (실기 5차) */
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setLinkDraft(null);
    setLinkErr("");
    window.requestAnimationFrame(() => editorApiRef.current?.setLink(v));
  };

  const photoStripLabels = {
    add: t("philife_write_add_photos"),
    cover: t("philife_write_photo_cover"),
    remove: t("common_delete"),
    uploading: t("philife_write_image_uploading"),
  };

  const composer = (
    <div className={`${PHILIFE_COMPOSER_ROOT_CLASS} ${COMMUNITY_FONT_CLASS}`} data-testid="philife-write-composer">
      <PhilifeWriteComposerHeader
        title={t(isEditMode ? "philife_write_composer_title_edit" : "philife_write_composer_title")}
        closeLabel={t("common_close")}
        onClose={() => void handleClose()}
        ctaLabel={isEditMode ? t("common_save") : t("philife_write_cta_post")}
        ctaReady={ctaReady}
        ctaDisabled={submitDisabled}
        busy={busy}
      />
      {bandMessage ? (
        <div className={PHILIFE_COMPOSER_ERROR_BAND_CLASS} role="alert" data-testid="philife-composer-error">
          {bandMessage}
        </div>
      ) : null}

      <div ref={writeScrollBodyRef} data-form-keyboard-scroll-root="1" className={PHILIFE_COMPOSER_SCROLL_CLASS}>
        <form id={PHILIFE_WRITE_FORM_ID} onSubmit={onSubmit} className="min-w-0">
          {writeTopicOptionsLoad === "loading" ? (
            <div className="h-13 border-b border-sam-border-soft px-4 py-3" aria-busy="true">
              <div className="h-7 w-32 animate-pulse rounded-full bg-sam-surface-muted" />
            </div>
          ) : (
            <PhilifeWriteTopicRow
              label={topicLabel}
              placeholder={t("philife_write_topic_placeholder")}
              ariaLabel={t("philife_write_topic_select_aria")}
              invalid={Boolean(fieldErr.topic)}
              disabled={noTopics}
              onOpen={() => setTopicMenuOpen(true)}
            />
          )}
          {isEditMode && category && writeTopicOptionsLoad === "ready" && !selectedTopicOption ? (
            <p className={PHILIFE_COMPOSER_NOTICE_CLASS}>{t("philife_write_topic_paused_hint")}</p>
          ) : null}

          {editorMode.canOptIn ? (
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 border-b border-sam-border-soft px-4 py-2">
              <span className="min-w-0">
                <span className="sam-text-body block font-semibold">{t("philife_write_editor_beta_label")}</span>
                <span className="sam-text-helper block">{t("philife_write_editor_beta_hint")}</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5 shrink-0 accent-[var(--sam-primary)]"
                checked={editorMode.useWysiwyg}
                disabled={uploading || editorUploading}
                onChange={(e) => editorMode.setOptIn(e.target.checked)}
              />
            </label>
          ) : null}

          <input
            ref={titleInputRef}
            id="philife-write-title"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (fieldErr.title) setFieldErr((f) => ({ ...f, title: undefined }));
            }}
            className={`${PHILIFE_COMPOSER_TITLE_INPUT_CLASS} ${fieldErr.title ? PHILIFE_COMPOSER_FIELD_INVALID_CLASS : ""}`}
            placeholder={t("philife_write_title_placeholder")}
            aria-label={t("philife_write_title_label")}
            aria-invalid={Boolean(fieldErr.title) || undefined}
            autoComplete="off"
            enterKeyHint="next"
          />

          {editorSeed ? (
            <div className={PHILIFE_COMPOSER_BODY_CLASS}>
              <PhilifeBodyEditor
                key={editorSeed.epoch}
                initialDoc={editorSeed.doc}
                ownerUserId={me?.id ?? null}
                maxImages={Math.max(0, COMMUNITY_MEMBER_POST_MAX_IMAGES - imageUrls.length)}
                formatToolbarHost={formatHost}
                labels={{
                  placeholder: t("philife_write_content_placeholder"),
                  uploading: t("philife_write_image_uploading"),
                  failed: t("philife_write_image_failed"),
                  retry: t("philife_write_image_retry"),
                  remove: t("common_delete"),
                  moveUp: t("philife_write_image_move_up"),
                  moveDown: t("philife_write_image_move_down"),
                  imageLimit: t("philife_write_err_image_limit"),
                  caption: t("philife_write_image_caption"),
                  captionEdit: t("philife_write_image_caption_edit"),
                  captionSheetTitle: t("philife_write_image_caption_sheet_title"),
                  captionDone: t("philife_write_caption_done"),
                  heading: t("philife_write_fmt_heading"),
                  headingGlyph: t("philife_write_fmt_heading_glyph"),
                  bold: t("philife_write_fmt_bold"),
                  italic: t("philife_write_fmt_italic"),
                  bulletList: t("philife_write_fmt_bullet"),
                  orderedList: t("philife_write_fmt_ordered"),
                  quote: t("philife_write_fmt_quote"),
                }}
                uploadFile={editorUploadFile}
                rehostUrl={editorRehostUrl}
                onChange={(snap) => {
                  onEditorChange(snap);
                  if (fieldErr.content && snap.content.trim()) setFieldErr((f) => ({ ...f, content: undefined }));
                }}
                onNotice={setErr}
                onReady={(api) => {
                  editorApiRef.current = api;
                }}
              />
              <input
                ref={editorFileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = "";
                  editorApiRef.current?.insertFiles(files);
                }}
              />
            </div>
          ) : (
            <>
              {editorFallbackNotice ? (
                <p className={PHILIFE_COMPOSER_NOTICE_CLASS}>{t("philife_write_editor_fallback_notice")}</p>
              ) : null}
              <div className={PHILIFE_COMPOSER_BODY_CLASS}>
                <textarea
                  id="philife-write-content"
                  ref={contentTextareaRef}
                  value={content}
                  onChange={(e) => {
                    setContent(e.target.value);
                    if (fieldErr.content) setFieldErr((f) => ({ ...f, content: undefined }));
                  }}
                  onPaste={(e) => void onContentPaste(e)}
                  rows={8}
                  className={PHILIFE_COMPOSER_LEGACY_TEXTAREA_CLASS}
                  placeholder={t("philife_write_content_placeholder")}
                  aria-label={t("philife_write_content_label")}
                  aria-invalid={Boolean(fieldErr.content) || undefined}
                />
              </div>
            </>
          )}

          {/* 기존 편집기 사진 줄 · 새 편집기에서 수정하는 글의 기존 첨부 사진(삭제만) — 새 사진은 모두 본문에 */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => void onPickFiles(e)}
          />
          {imageUrls.length > 0 ? (
            <section className={PHILIFE_COMPOSER_EXTRA_SECTION_CLASS} data-testid="philife-write-attachments">
              <p className={PHILIFE_COMPOSER_EXTRA_HEAD_CLASS}>
                {editorSeed ? t("philife_write_existing_attachments") : t("philife_write_toolbar_photo")}
              </p>
              <PhilifeWritePhotoStrip
                urls={imageUrls}
                max={COMMUNITY_MEMBER_POST_MAX_IMAGES}
                uploading={uploading}
                showAdd={false}
                showCover={!editorSeed}
                onAdd={() => fileRef.current?.click()}
                onRemove={(i) => setImageUrls((prev) => prev.filter((_, idx) => idx !== i))}
                labels={photoStripLabels}
              />
            </section>
          ) : null}
        </form>
      </div>

      <PhilifeWriteComposerToolbar
        ariaLabel={t("philife_write_toolbar_aria")}
        photoLabel={t("philife_write_toolbar_photo")}
        photoCount={photoCount}
        photoMax={COMMUNITY_MEMBER_POST_MAX_IMAGES}
        photoBusy={uploading}
        onPhoto={onToolbarPhoto}
        linkLabel={editorSeed ? t("philife_write_toolbar_link") : undefined}
        onLink={
          editorSeed
            ? () => {
                setLinkErr("");
                setLinkDraft("");
              }
            : undefined
        }
        formatHostRef={editorSeed ? setFormatHost : undefined}
      />

      <PhilifeWriteTopicSheet
        open={topicMenuOpen}
        title={t("philife_write_topic_sheet_title")}
        options={writeTopicOptions.map((o) => ({
          slug: o.slug,
          label: philifeWriteTopicOptionLabel(t, o, language),
        }))}
        value={category}
        onSelect={applyWriteCategory}
        onClose={() => setTopicMenuOpen(false)}
      />

      <DibayBottomSheet
        open={linkDraft !== null}
        onClose={() => setLinkDraft(null)}
        title={t("philife_write_link_sheet_title")}
        zIndexClass={MAIN_BOTTOM_NAV_NESTED_DIALOG_Z_CLASS}
        footer={
          <button type="button" className={`${Sam.btn.primaryCombo} w-full`} onClick={insertLink}>
            {t("philife_write_link_insert")}
          </button>
        }
      >
        <input
          value={linkDraft ?? ""}
          onChange={(e) => {
            setLinkDraft(e.target.value);
            if (linkErr) setLinkErr("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              insertLink();
            }
          }}
          inputMode="url"
          autoComplete="off"
          enterKeyHint="done"
          autoFocus
          placeholder={t("philife_write_link_prompt")}
          aria-label={t("philife_write_link_sheet_title")}
          aria-invalid={Boolean(linkErr) || undefined}
          className={PHILIFE_COMPOSER_SHEET_INPUT_CLASS}
          data-testid="philife-composer-link-input"
        />
        {linkErr ? <p className="sam-text-helper mt-2 !text-sam-danger">{linkErr}</p> : null}
      </DibayBottomSheet>
    </div>
  );

  if (isSheet) return composer;
  /** 별도 페이지: 본문 영역(transform·overflow 조상) 밖 body 에 그려 전역 헤더·하단 탭 위를 덮는다 */
  return pageLayerHost ? createPortal(
        <div className={PHILIFE_COMPOSER_PAGE_LAYER_CLASS} style={keyboardStageStyle}>
          {composer}
        </div>,
        pageLayerHost
      ) : null;
}
