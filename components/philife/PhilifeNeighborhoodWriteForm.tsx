"use client";

import { dibayConfirm, dibayAlert } from "@/components/ui/dibay-overlay";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Link2 } from "lucide-react";
import { useCommunityLocalFilter } from "@/hooks/use-community-local-filter";
import { WriteScreenTier1Sync } from "@/components/write/WriteScreenTier1Sync";
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
import { philifeAdminPaths, philifeAppPaths } from "@domain/philife/paths";
import { clearAllPhilifeFeedPersistentCaches } from "@/lib/community/philife-feed-session-cache";
import { mergePostBodyImages, COMMUNITY_MEMBER_POST_MAX_IMAGES } from "@/lib/philife/post-body-images";
import { uploadCommunityImageFile } from "@/lib/philife/client-image-resize";
import { runFixedDestinationBack } from "@/lib/navigation/fixed-destination-back";
import { usePhilifeWriteLeaveGuard } from "@/components/philife/use-philife-write-leave-guard";
import { PhilifeWriteTopicDropdown } from "@/components/philife/PhilifeWriteTopicDropdown";
import { PhilifeWritePhotoStrip } from "@/components/philife/PhilifeWritePhotoStrip";
import { Sam } from "@/lib/ui/sam-component-classes";
import { TRADE_WRITE_FB_CONTROL, TRADE_WRITE_FB_FIELD_HEAD } from "@/lib/ui/trade-write-fb-ui";
import dynamic from "next/dynamic";
import { useCommunityWriteEditorMode } from "@/lib/philife/write-editor/use-community-write-editor-mode";
import {
  parseCommunityBodyToBlocks,
  type CommunityBodyBlock,
  type CommunityDocSnapshot,
} from "@/lib/philife/write-editor/content-codec";
import type {
  PhilifeBodyEditorApi,
  PhilifeBodyEditorUploadResult,
} from "@/components/philife/write-editor/PhilifeBodyEditor";
import { extractImageUrlsFromInterleavedContent } from "@/lib/philife/interleaved-body-markdown";
import { COMMUNITY_BUTTON_SECONDARY_CLASS, COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import {
  APP_MAIN_COLUMN_CLASS,
  APP_TRADE_WRITE_SHEET_SCROLL_COLUMN_CLASS,
} from "@/lib/ui/app-content-layout";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { PhilifeWriteActionFooter, PHILIFE_WRITE_FORM_ID } from "@/components/philife/PhilifeWriteActionFooter";
import {
  PHILIFE_WRITE_FB_BLOCK_TITLE,
  PHILIFE_WRITE_FB_CONTROL,
  PHILIFE_WRITE_FB_FIELD_LABEL,
  PHILIFE_WRITE_FB_SECTION,
  PHILIFE_WRITE_FORM_ROOT_CLASS,
  PHILIFE_WRITE_SCROLL_BODY_CLASS,
} from "@/lib/ui/philife-write-fb-ui";
import { useFormKeyboardViewport } from "@/lib/ui/use-form-keyboard-viewport";
import { useFormKeyboardFocusVisibility } from "@/lib/ui/use-form-keyboard-focus-visibility";
import type { AdPaymentMethod, AdProduct } from "@/lib/ads/types";
import { postAdTypeLabel } from "@/lib/ads/post-ad-label-keys";
import { useUserPointBalance } from "@/hooks/useUserPointBalance";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import {
  invalidateCommunityAuthorPostsClientCaches,
  invalidateCommunityFeedCachesAfterPostModeration,
} from "@/lib/community/invalidate-community-author-posts-client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  philifeWriteAdProductPointCost,
  philifeWriteAdProductTitle,
} from "@/lib/ads/philife-write-ad-product-i18n";
import { philifeWriteTopicOptionLabel } from "@/lib/philife/philife-write-topic-label";
import type { PhilifeNeighborhoodWriteTopicOption } from "@/lib/neighborhood/philife-neighborhood-topics";

/** 새 편집기는 글쓰기에서만 로드 — 피드·상세 번들 무영향 */
const PhilifeBodyEditor = dynamic(() => import("@/components/philife/write-editor/PhilifeBodyEditor"), {
  ssr: false,
  loading: () => <div className="min-h-[12rem]" aria-busy="true" />,
});

const PHILIFE_WRITE_HELPER_CLASS = "mt-1.5 text-[12px] leading-snug text-sam-muted";
const PHILIFE_WRITE_FIELD_ERROR_CLASS = "mt-1.5 text-[12px] font-medium leading-snug text-sam-danger";
const PHILIFE_WRITE_WARNING_PANEL_CLASS =
  "border-b border-[#e4e6eb] bg-[#fff8e6] px-3 py-3 sm:px-4";
const PHILIFE_WRITE_WARNING_LINK_CLASS =
  "font-medium text-[#050505] underline decoration-[#65676B]/50 underline-offset-2";
const PHILIFE_WRITE_CHOICE_CARD_BASE =
  "rounded-md border border-[#ccd0d5] px-3 py-3 text-left transition-colors";
const PHILIFE_WRITE_CHOICE_CARD_ACTIVE = "border-sam-primary-border bg-sam-primary-soft";
const PHILIFE_WRITE_CHOICE_CARD_IDLE = "bg-white hover:bg-[#f0f2f5]";
const PHILIFE_WRITE_THUMB_FRAME_CLASS =
  "relative overflow-hidden rounded-md bg-[#f0f2f5] ring-1 ring-[#e4e6eb]";
const PHILIFE_WRITE_THUMB_REMOVE_CLASS =
  "absolute right-1.5 top-1.5 z-[1] inline-flex min-h-7 items-center justify-center rounded-sm bg-[#050505]/75 px-2 text-[11px] font-medium text-white";
const MEETUP_INLINE_LABEL_CLASS = PHILIFE_WRITE_FB_FIELD_LABEL + " shrink-0 whitespace-nowrap";

function buildMeetupPostContent(
  parts: { intro: string; ageFee: string },
  ageFeeHeader: string
): string {
  const intro = parts.intro.replace(/\s+/g, " ").trim();
  const age = parts.ageFee.replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  lines.push(intro);
  if (age) {
    lines.push("");
    lines.push(ageFeeHeader);
    lines.push(age);
  }
  return lines.join("\n");
}

interface PhilifeNeighborhoodWriteFormProps {
  initialCategory?: string;
  /** Native owner edit — PATCH neighborhood-posts/[postId]; sheet entry must not set this. */
  editPostId?: string;
  initialTitle?: string;
  initialContent?: string;
  initialImages?: string[];
  /** 수정 모드: 원 주제 표시명 — 주제가 숨김·비활성이라 목록에 없을 때 표시 */
  initialTopicName?: string;
  /**
   * true이면 `WriteScreenTier1Sync`를 쓰지 않음 — 필라이프 피드 **시트**에서 전역 1단(RegionBar·주제 탭)을 유지할 때.
   */
  suppressWriteScreenTier1?: boolean;
  /** 풀페이지 제출 직전(`router` 이동 전) — 시트 닫기 등 */
  onWillNavigateAfterSuccess?: () => void;
  /**
   * 시트 전용: 제출 성공 직전 — 아래로 닫힘 애니메이션·`close()` 후 `await` 끝나고 `router.replace` 실행
   * (`onWillNavigateAfterSuccess` 대체)
   */
  onSheetExitBeforeNavigate?: () => Promise<void>;
  /** 시트 전용: 「취소하기」 — 아래로 닫힘 애니메이션 후 닫힘(동기 또는 Promise) */
  onSheetClose?: () => void | Promise<void>;
  /** 시트 전용: 다른 메뉴 이탈 가드용 — `suppressWriteScreenTier1` 일 때만 의미 있음 */
  onSheetBlockingDraftChange?: (hasDraft: boolean) => void;
}


/** 모임 오픈그룹: 공개(자유/비번) · 숨김(자유/비번) */
type PhilifeMeetAccessMode = "free_public" | "password_public" | "free_hidden" | "password_hidden";

/** 동네(필라이프) 일반 글·모임 생성 — `/philife/write` 등에서 사용 */
export function PhilifeNeighborhoodWriteForm({
  initialCategory,
  editPostId,
  initialTitle,
  initialContent,
  initialImages,
  initialTopicName,
  suppressWriteScreenTier1 = false,
  onWillNavigateAfterSuccess,
  onSheetExitBeforeNavigate,
  onSheetClose,
  onSheetBlockingDraftChange,
}: PhilifeNeighborhoodWriteFormProps) {
  const { t, language } = useI18n();
  const pointsLocale = language === "en" ? "en-US" : "ko-KR";
  const router = useRouter();
  const pathname = usePathname() ?? "/philife";
  /** 글쓰기 위치 = 커뮤니티 Local 필터(대표 주소 CITY seed / 명시 선택 CITY) — profiles 상세주소 미사용 (ADDR-PRIV-001) */
  const {
    locationKey: localLocationKey,
    locationMeta: localLocationMeta,
    filterLabel: localRegionLabel,
  } = useCommunityLocalFilter();
  const isEditMode = Boolean(editPostId?.trim());
  const meetAccessOptions = useMemo(
    () =>
      [
        {
          id: "free_public" as const,
          title: t("philife_write_access_free_public_title"),
          desc: t("philife_write_access_free_public_desc"),
        },
        {
          id: "password_public" as const,
          title: t("philife_write_access_password_public_title"),
          desc: t("philife_write_access_password_public_desc"),
        },
        {
          id: "free_hidden" as const,
          title: t("philife_write_access_free_hidden_title"),
          desc: t("philife_write_access_free_hidden_desc"),
        },
        {
          id: "password_hidden" as const,
          title: t("philife_write_access_password_hidden_title"),
          desc: t("philife_write_access_password_hidden_desc"),
        },
      ] as const,
    [t]
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const writeScrollBodyRef = useRef<HTMLDivElement>(null);
  const { effectiveViewportBottom } = useFormKeyboardViewport();
  useFormKeyboardFocusVisibility({
    scrollRootRef: writeScrollBodyRef,
    effectiveViewportBottom,
  });
  const [writeTopicOptions, setWriteTopicOptions] = useState<PhilifeNeighborhoodWriteTopicOption[]>([]);
  /** `writeTopicOptions.length === 0` 이 로딩 중인지·진짜 비어 있는지 구분 */
  const [writeTopicOptionsLoad, setWriteTopicOptionsLoad] = useState<"loading" | "ready">("loading");
  /** `ok: false` 또는 catch 시 서버/네트워크 힌트(설정·데이터 0이 아닐 수 있음) */
  const [writeTopicOptionsFetchErr, setWriteTopicOptionsFetchErr] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(() =>
    initialCategory === "meetup" ? "meetup" : (initialCategory?.trim().toLowerCase() || "")
  );
  const [title, setTitle] = useState(() => initialTitle ?? "");
  const [content, setContent] = useState(() => initialContent ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
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
  const [maxMembers, setMaxMembers] = useState(30);
  /** 주제 드롭다운 (CM-W-01) — 자동 선택 없음, 주제가 늘어나도 패널 안 스크롤 */
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  /** 필드별 입력 검증 안내 — 제출 시 표시, 입력하면 해제 */
  const [fieldErr, setFieldErr] = useState<{ topic?: string; title?: string; content?: string }>({});
  /** 수정 모드: 회원이 주제를 직접 바꿨을 때만 PATCH 에 category 를 보낸다 (CM-P2-09) */
  const [categoryTouched, setCategoryTouched] = useState(false);

  /** 서버 기본 모임 피드 주제 slug — UI 비노출 */
  const MEETUP_TOPIC_SLUG = "meetup";
  const [meetIntro, setMeetIntro] = useState("");
  const [ageFeeNote, setAgeFeeNote] = useState("");
  const [meetRegionText, setMeetRegionText] = useState(() => localRegionLabel.trim());
  /** 모임 채팅(오픈그룹) — `messenger_discoverable`·`entry_policy`·비번과 동기 */
  const [meetAccessMode, setMeetAccessMode] = useState<PhilifeMeetAccessMode>("free_public");
  const [meetPassword, setMeetPassword] = useState("");
  const [promoteAdEnabled, setPromoteAdEnabled] = useState(false);
  const [adProducts, setAdProducts] = useState<AdProduct[]>([]);
  const [adProductsLoading, setAdProductsLoading] = useState(false);
  const [selectedAdProduct, setSelectedAdProduct] = useState<AdProduct | null>(null);
  const [adPaymentMethod, setAdPaymentMethod] = useState<AdPaymentMethod>("points");
  const [adDepositorName, setAdDepositorName] = useState("");
  const [adMemo, setAdMemo] = useState("");

  const submitErrorAnchorRef = useRef<HTMLDivElement>(null);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);
  const pendingContentCaretRef = useRef<number | null>(null);
  /** setState 전에 연속 제출이 들어오는 경우(더블 탭 등) 동기적으로 막음 */
  const submitLockRef = useRef(false);
  /** 등록·수정 성공 후 화면 이동 중 */
  const navigatingAfterSubmitRef = useRef(false);

  /**
   * 새 편집기(WYSIWYG) — 플래그 기본 비노출, 관리자 검증 계정만 직접 켬.
   * 본문 원천은 항상 `content` 문자열(기존 저장 계약)이며, 편집기는 무손실 파싱된 경우에만 연다.
   */
  const editorMode = useCommunityWriteEditorMode();
  const [editorSeed, setEditorSeed] = useState<{ blocks: CommunityBodyBlock[]; epoch: number } | null>(null);
  const [editorSnap, setEditorSnap] = useState<CommunityDocSnapshot | null>(null);
  const [editorFallbackNotice, setEditorFallbackNotice] = useState(false);
  const editorApiRef = useRef<PhilifeBodyEditorApi | null>(null);
  const editorFileRef = useRef<HTMLInputElement>(null);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const me = getCurrentUser();
  const { balance: pointBalance } = useUserPointBalance(me?.id);

  useEffect(() => {
    if (!err) return;
    submitErrorAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [err]);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) setWriteTopicOptionsLoad("loading");
      if (!cancelled) setWriteTopicOptionsFetchErr(null);
      try {
        const j = await fetchPhilifeNeighborhoodTopicOptionsForWrite();
        if (cancelled) return;
        if (!j?.ok || !Array.isArray(j.writeTopics)) {
          setWriteTopicOptionsFetchErr(
            j && typeof (j as { error?: string }).error === "string" && (j as { error?: string }).error?.trim()
              ? (j as { error: string }).error
              : null
          );
          setWriteTopicOptions([]);
          setCategory((prev) =>
            prev === "meetup" || initialCategory === "meetup" ? "meetup" : isEditMode ? prev : ""
          );
          return;
        }
        if (j.writeTopics.length === 0) {
          setWriteTopicOptionsFetchErr(null);
          setWriteTopicOptions([]);
          setCategory((prev) =>
            prev === "meetup" || initialCategory === "meetup" ? "meetup" : isEditMode ? prev : ""
          );
          return;
        }
        setWriteTopicOptionsFetchErr(null);
        setWriteTopicOptions(j.writeTopics);
        setCategory((prev) => {
          if (prev === "meetup" || initialCategory === "meetup") return "meetup";
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
          setWriteTopicOptionsFetchErr(t("philife_write_err_topics_fetch"));
          setWriteTopicOptions([]);
          setCategory((prev) =>
            prev === "meetup" || initialCategory === "meetup" ? "meetup" : isEditMode ? prev : ""
          );
        }
      } finally {
        if (!cancelled) setWriteTopicOptionsLoad("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialCategory, isEditMode, t]);

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

  useEffect(() => {
    if (category === "meetup") {
      setMeetRegionText(localRegionLabel.trim());
    }
  }, [category, localRegionLabel]);

  useEffect(() => {
    if (!promoteAdEnabled || category === "meetup") {
      setAdProducts([]);
      setSelectedAdProduct(null);
      return;
    }
    let cancelled = false;
    setAdProductsLoading(true);
    void fetch(`/api/me/points/promotion-orders?catalog=1&domain=community`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => r.json())
      .then(
        (j: {
          catalog?: {
            id: string;
            durationDays: number;
            pointCost: number;
            fallbackTitleKo?: string;
            fallbackTitleEn?: string;
          }[];
        }) => {
          if (cancelled) return;
          const mapped: AdProduct[] = (j.catalog ?? []).map((c) => ({
            id: c.id,
            name: c.fallbackTitleKo || c.id,
            description: "",
            boardKey: "plife",
            adType: "top_fixed",
            durationDays: c.durationDays,
            pointCost: c.pointCost,
            priorityDefault: 0,
            isActive: true,
            createdAt: "",
            updatedAt: "",
          }));
          setAdProducts(mapped);
          setAdPaymentMethod("points");
        }
      )
      .catch(() => {
        if (!cancelled) setAdProducts([]);
      })
      .finally(() => {
        if (!cancelled) setAdProductsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [promoteAdEnabled, category]);

  /** 업로드 실패도 결과로 돌려준다 — 네트워크·비 JSON(413)·서버 오류 (CM-P1-03) */
  const postMultipartFile = useCallback(
    async (f: File): Promise<{ ok?: boolean; url?: string; error?: string }> => {
      const r = await uploadCommunityImageFile(philifeUploadImageUrl(), f, {
        network: t("philife_write_err_network"),
        tooLarge: t("philife_write_err_image_too_large"),
        failed: t("philife_write_err_image_upload"),
      });
      return r.ok ? { ok: true, url: r.url } : { ok: false, error: r.error };
    },
    [t]
  );

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (!files.length) return;
    const cap = category === "meetup" ? 1 : COMMUNITY_MEMBER_POST_MAX_IMAGES;
    setUploading(true);
    setErr("");
    try {
      if (category === "meetup") setImageUrls([]);
      let added = 0;
      for (const f of files) {
        const used = category === "meetup" ? added : imageUrlsCountRef.current;
        if (used >= cap) {
          setErr(t("philife_write_err_image_limit"));
          break;
        }
        const j = await postMultipartFile(f);
        if (j.ok && j.url) {
          const url = j.url;
          added += 1;
          imageUrlsCountRef.current += 1;
          /** 성공분은 즉시 반영 — 뒤 파일이 실패해도 앞 사진을 잃지 않는다 */
          setImageUrls((prev) => (category === "meetup" ? [url] : [...prev, url].slice(0, cap)));
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
    if (category === "meetup") return;
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

  const wantWysiwyg = editorMode.useWysiwyg && category !== "meetup";
  useEffect(() => {
    if (!wantWysiwyg) {
      setEditorSeed(null);
      setEditorSnap(null);
      return;
    }
    if (editorSeed) return;
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
    setEditorSeed({ blocks: parsed.blocks, epoch: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 편집기 진입 시점의 본문으로 1회 시드
  }, [wantWysiwyg]);

  const onEditorChange = useCallback((snap: CommunityDocSnapshot) => {
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
        if (res.ok && j.ok && j.url) return { ok: true, url: j.url };
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
    | { ok: true; content: string; images: string[] }
    | { ok: false; error: string } => {
    if (uploading || editorUploading) return { ok: false, error: t("philife_write_submit_blocked_uploading") };
    if (editorFailed) return { ok: false, error: t("philife_write_submit_blocked_failed") };
    const c = (editorSeed && editorSnap ? editorSnap.content : content).trim();
    return { ok: true, content: c, images: mergePostBodyImages({ content: c, candidates: imageUrls }) };
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current || busy) return;
    submitLockRef.current = true;
    try {
      setErr("");
      const editId = editPostId?.trim() ?? "";

      if (editId) {
        if (category === "meetup") {
          setErr(t("philife_write_err_meetup_name"));
          return;
        }
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
        if (editFieldErr.title || editFieldErr.content) return;
        if (!title.trim()) {
          setErr(t("philife_write_err_title"));
          return;
        }
        if (!composedContent) {
          setErr(t("philife_write_err_content"));
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
    if (category !== "meetup" && writeTopicOptions.length === 0) {
      setErr(t("philife_write_err_no_topics"));
      return;
    }
    if (category !== "meetup") {
      const nextFieldErr = {
        topic: category ? undefined : t("philife_write_topic_required"),
        title: title.trim() ? undefined : t("philife_write_err_title"),
        content: (editorSeed && editorSnap ? editorSnap.content : content).trim()
          ? undefined
          : t("philife_write_err_content"),
      };
      setFieldErr(nextFieldErr);
      if (nextFieldErr.topic || nextFieldErr.title || nextFieldErr.content) return;
    }
    const bodyForSubmit = category === "meetup" ? null : composeBodyForSubmit();
    if (bodyForSubmit && !bodyForSubmit.ok) {
      setErr(bodyForSubmit.error);
      return;
    }

    const composedContent =
      category === "meetup"
        ? buildMeetupPostContent(
            {
              intro: meetIntro,
              ageFee: ageFeeNote,
            },
            t("philife_write_age_fee_content_header")
          )
        : bodyForSubmit && bodyForSubmit.ok
          ? bodyForSubmit.content
          : "";

    if (!title.trim()) {
      setErr(category === "meetup" ? t("philife_write_err_meetup_name") : t("philife_write_err_title"));
      return;
    }
    if (!composedContent.trim()) {
      setErr(category === "meetup" ? t("philife_write_err_meetup_intro") : t("philife_write_err_content"));
      return;
    }
    if (category === "meetup") {
      const needsPw = meetAccessMode === "password_public" || meetAccessMode === "password_hidden";
      if (needsPw) {
        const p = meetPassword.trim();
        if (p.length < 4 || p.length > 128) {
          setErr(t("philife_write_err_password"));
          return;
        }
      }
    }

    if (category !== "meetup" && promoteAdEnabled) {
      if (!selectedAdProduct) {
        setErr(t("philife_write_err_ad_product"));
        return;
      }
      const short = Math.max(0, selectedAdProduct.pointCost - pointBalance);
      if (short > 0) {
        setErr(t("philife_write_err_points_short", { amount: short.toLocaleString() }));
        return;
      }
    }

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
        images: bodyForSubmit && bodyForSubmit.ok ? bodyForSubmit.images : [],
      };
      if (category === "meetup") {
        payload.meetTopicSlug = MEETUP_TOPIC_SLUG;
        const shortDesc =
          meetIntro.replace(/\s+/g, " ").trim().slice(0, 500) || composedContent.slice(0, 500);
        const regionFallback =
          meetRegionText.trim() ||
          locationName ||
          t("philife_write_default_neighborhood");
        const needsPassword = meetAccessMode === "password_public" || meetAccessMode === "password_hidden";
        const messengerDiscoverable = meetAccessMode === "free_public" || meetAccessMode === "password_public";
        /** 장기형 고정 — Philife 모임 피드·커뮤니티 메신저 오픈그룹 */
        payload.meeting = {
          tenure_type: "long",
          location_text: regionFallback,
          meeting_date: null,
          max_members: maxMembers,
          description: shortDesc,
          entry_policy: needsPassword ? "password" : "open",
          meeting_password: needsPassword ? meetPassword.trim() : undefined,
          messenger_discoverable: messengerDiscoverable,
          allow_waitlist: false,
          allow_member_invite: false,
          welcome_message: null,
          allow_feed: true,
          allow_album_upload: true,
          cover_image_url: imageUrls[0] ?? null,
          region_text: regionFallback,
          category_text: t("philife_write_meetup_category_text"),
          join_questions: [],
          use_notices: true,
          platform_approval_required: false,
        };
      }
      const res = await fetch(philifeNeighborhoodPostsUrl(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let j: { ok?: boolean; id?: string; error?: string; messengerRoomId?: string; meetingId?: string | null };
      try {
        j = (await res.json()) as {
          ok?: boolean;
          id?: string;
          error?: string;
          messengerRoomId?: string;
          meetingId?: string | null;
        };
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
      const authorId = getCurrentUser()?.id?.trim();
      if (authorId) invalidateCommunityAuthorPostsClientCaches(authorId);
      /** 새 글이 목록에 바로 보이도록 persistent 피드 캐시도 비운다 (CM-W-06) */
      clearAllPhilifeFeedPersistentCaches();

      let promoFailed = false;
      if (category !== "meetup" && promoteAdEnabled && selectedAdProduct) {
        try {
          const idem =
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : `promo-${Date.now()}`;
          const applyRes = await fetch("/api/me/points/promotion-orders", {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": idem,
            },
            body: JSON.stringify({
              targetType: "community_post",
              targetId: j.id,
              targetTitle: title.trim() || undefined,
              productId: selectedAdProduct.id,
              idempotencyKey: idem,
            }),
          });
          const aj = (await applyRes.json()) as { ok?: boolean; error?: string };
          if (!applyRes.ok || !aj.ok) {
            promoFailed = true;
            console.warn("[philife/write] promotion-orders failed", aj?.error ?? applyRes.status);
          }
        } catch (e) {
          promoFailed = true;
          console.warn("[philife/write] promotion-orders", e);
        }
      }

      if (promoFailed) {
        await dibayAlert({
          title:
            t("philife_write_promo_failed") ||
            "게시물은 등록됐지만 상위 노출 결제에 실패했습니다. 글 상세에서 다시 홍보해 주세요.",
        });
      }

      /** 모임 생성 시 커뮤니티 모임 피드로, 일반 글은 게시글 상세로 이동 (CM-W-05) */
      navigatingAfterSubmitRef.current = true;
      await leaveGuard.release();
      if (onSheetExitBeforeNavigate) {
        await onSheetExitBeforeNavigate();
      } else {
        onWillNavigateAfterSuccess?.();
      }
      if (category === "meetup") {
        const mid = typeof j.meetingId === "string" && j.meetingId.trim() ? j.meetingId.trim() : null;
        router.replace(mid ? philifeAppPaths.meeting(mid) : philifeAppPaths.meetingsFeed);
      } else {
        router.replace(philifeAppPaths.post(j.id));
      }
      } catch {
        setErr(t("philife_write_err_network_occurred"));
      } finally {
        if (!navigatingAfterSubmitRef.current) setBusy(false);
      }
    } finally {
      if (!navigatingAfterSubmitRef.current) submitLockRef.current = false;
    }
  };

  const adShortfall =
    selectedAdProduct && adPaymentMethod === "points"
      ? Math.max(0, selectedAdProduct.pointCost - pointBalance)
      : 0;

  const sheetHasDraft = useCallback((): boolean => {
    if (category === "meetup") {
      return Boolean(
        title.trim() ||
          content.trim() ||
          meetIntro.trim() ||
          imageUrls.length > 0 ||
          meetPassword.trim() ||
          ageFeeNote.trim() ||
          (meetRegionText.trim() &&
            meetRegionText.trim() !== localRegionLabel.trim())
      );
    }
    return Boolean(
      title.trim() ||
        content.trim() ||
        imageUrls.length > 0 ||
        promoteAdEnabled ||
        selectedAdProduct != null ||
        adDepositorName.trim() ||
        adMemo.trim()
    );
  }, [
    category,
    title,
    content,
    meetIntro,
    imageUrls.length,
    meetPassword,
    ageFeeNote,
    meetRegionText,
    localRegionLabel,
    promoteAdEnabled,
    selectedAdProduct,
    adDepositorName,
    adMemo,
  ]);

  const sheetBlockingDraft = useMemo(
    () => (suppressWriteScreenTier1 ? sheetHasDraft() : false),
    [suppressWriteScreenTier1, sheetHasDraft]
  );

  useEffect(() => {
    if (!onSheetBlockingDraftChange) return;
    onSheetBlockingDraftChange(sheetBlockingDraft);
    return () => {
      onSheetBlockingDraftChange(false);
    };
  }, [sheetBlockingDraft, onSheetBlockingDraftChange]);

  const confirmDiscard = useCallback(
    () =>
      dibayConfirm({
        title: t("philife_write_discard_confirm"),
        cancelLabel: t("common_cancel"),
        confirmLabel: t("common_confirm"),
        confirmTone: "destructive",
      }),
    [t]
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
      return false;
    },
    shouldConfirm: hasDraftForLeave,
    confirmLeave: confirmDiscard,
    onLeave: () => {
      if (suppressWriteScreenTier1 && onSheetClose) {
        void Promise.resolve(onSheetClose()).catch(() => {});
        return;
      }
      runFixedDestinationBack(router, pageBackHref);
    },
  });

  const handleSheetCancel = useCallback(async () => {
    if (!onSheetClose) return;
    if (hasDraftForLeave() && !(await confirmDiscard())) return;
    await leaveGuard.release();
    try {
      await Promise.resolve(onSheetClose());
    } catch {
      /* no-op */
    }
  }, [onSheetClose, hasDraftForLeave, confirmDiscard, leaveGuard]);

  const handlePageCancel = useCallback(async () => {
    if (hasDraftForLeave() && !(await confirmDiscard())) return;
    await leaveGuard.release();
    runFixedDestinationBack(router, pageBackHref);
  }, [router, hasDraftForLeave, confirmDiscard, leaveGuard, pageBackHref]);

  const handleWriteCancel = suppressWriteScreenTier1 && onSheetClose ? handleSheetCancel : handlePageCancel;

  const selectedTopicOption = writeTopicOptions.find((o) => o.slug === category) ?? null;
  const photoStripLabels = {
    add: t("philife_write_add_photos"),
    cover: t("philife_write_photo_cover"),
    remove: t("common_delete"),
    uploading: t("philife_write_image_uploading"),
  };

  /** 업로드 중 등록 차단 (CM-P2-07) · 주제 미선택 차단 (CM-W-01) */
  const submitBlockedReason =
    uploading || editorUploading
      ? t("philife_write_submit_blocked_uploading")
      : editorFailed
        ? t("philife_write_submit_blocked_failed")
        : "";
  const submitDisabled =
    uploading ||
    editorUploading ||
    editorFailed ||
    (category !== "meetup" &&
      (writeTopicOptionsLoad !== "ready" || (!isEditMode && writeTopicOptions.length === 0)));

  const tier1Title =
    category === "meetup"
      ? title.trim() || t("philife_write_meetup_create_title")
      : t("tier1_community_write");

  const rootClass = [
    "flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden bg-white",
    COMMUNITY_FONT_CLASS,
    "text-[#050505]",
    suppressWriteScreenTier1 ? "" : "min-h-[100dvh]",
  ]
    .filter(Boolean)
    .join(" ");

  const scrollWrapClass = suppressWriteScreenTier1
    ? PHILIFE_WRITE_SCROLL_BODY_CLASS
    : `${PHILIFE_WRITE_SCROLL_BODY_CLASS} ${APP_MAIN_COLUMN_CLASS}`;

  return (
    <div className={rootClass}>
      {suppressWriteScreenTier1 ? null : (
        <WriteScreenTier1Sync
          backHref={pageBackHref}
          title={tier1Title}
          hasUnsavedChanges={hasUnsavedWriteChanges}
          onRequestClose={() => void handlePageCancel()}
        />
      )}

      {category === "meetup" ? (
        <div className={`${PHILIFE_WRITE_FB_SECTION} bg-[#f0f2f5]`}>
          <Link
            href={philifeAppPaths.write}
            className={`inline-flex items-center px-3 py-1 ${COMMUNITY_BUTTON_SECONDARY_CLASS}`}
          >
            {t("philife_write_back_to_post")}
          </Link>
        </div>
      ) : null}

      <div
        ref={writeScrollBodyRef}
        data-form-keyboard-scroll-root="1"
        className={scrollWrapClass}
      >
        <div className={suppressWriteScreenTier1 ? APP_TRADE_WRITE_SHEET_SCROLL_COLUMN_CLASS : "w-full"}>
        <form id={PHILIFE_WRITE_FORM_ID} onSubmit={onSubmit} className={PHILIFE_WRITE_FORM_ROOT_CLASS}>
        {category === "meetup" ? (
            <>
              <section className={PHILIFE_WRITE_FB_SECTION}>
                <h4 className={PHILIFE_WRITE_FB_BLOCK_TITLE}>{t("philife_write_meetup_name_label")}</h4>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={PHILIFE_WRITE_FB_CONTROL}
                  placeholder={t("philife_write_meetup_name_placeholder")}
                  autoComplete="off"
                />
              </section>

              <section className={PHILIFE_WRITE_FB_SECTION}>
                <textarea
                  value={meetIntro}
                  onChange={(e) => setMeetIntro(e.target.value)}
                  rows={4}
                  className={`${PHILIFE_WRITE_FB_CONTROL} !min-h-[7rem]`}
                  placeholder={t("philife_write_meetup_intro_placeholder")}
                />
              </section>

              <section className={PHILIFE_WRITE_FB_SECTION}>
                <h4 className={PHILIFE_WRITE_FB_BLOCK_TITLE}>{t("philife_write_cover_image_label")}</h4>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple={false}
                  className="hidden"
                  onChange={(e) => void onPickFiles(e)}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="mt-1 rounded-md border border-[#ccd0d5] bg-white px-4 py-2 sam-text-body text-[#050505]"
                >
                  {uploading
                    ? t("common_uploading")
                    : imageUrls[0]
                      ? t("philife_write_cover_change")
                      : t("philife_write_cover_add")}
                </button>
                {imageUrls[0] ? (
                  <div className={`relative mt-2 h-36 ${PHILIFE_WRITE_THUMB_FRAME_CLASS}`}>
                    <SamarketThumbnail
                      src={imageUrls[0]}
                      alt=""
                      fill
                      roundedClassName="rounded-ui-rect"
                      className="h-full w-full"
                    />
                    <button
                      type="button"
                      className={PHILIFE_WRITE_THUMB_REMOVE_CLASS}
                      onClick={() => setImageUrls([])}
                    >
                      {t("common_delete")}
                    </button>
                  </div>
                ) : (
                  <p className={PHILIFE_WRITE_HELPER_CLASS}>{t("philife_write_cover_helper")}</p>
                )}
              </section>

              <section className={PHILIFE_WRITE_FB_SECTION}>
                <h4 className={PHILIFE_WRITE_FB_BLOCK_TITLE}>{t("philife_write_region_label")}</h4>
                <input
                  value={meetRegionText}
                  onChange={(e) => setMeetRegionText(e.target.value)}
                  className={PHILIFE_WRITE_FB_CONTROL}
                  placeholder={t("philife_write_region_placeholder")}
                />
              </section>

              <section className={PHILIFE_WRITE_FB_SECTION}>
                <h4 className={PHILIFE_WRITE_FB_BLOCK_TITLE}>{t("philife_write_chat_type_label")}</h4>
                <p className={PHILIFE_WRITE_HELPER_CLASS}>{t("philife_write_chat_type_hint")}</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {meetAccessOptions.map((opt) => {
                    const on = meetAccessMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setMeetAccessMode(opt.id);
                          if (opt.id === "free_public" || opt.id === "free_hidden") setMeetPassword("");
                        }}
                        className={`${PHILIFE_WRITE_CHOICE_CARD_BASE} ${on ? PHILIFE_WRITE_CHOICE_CARD_ACTIVE : PHILIFE_WRITE_CHOICE_CARD_IDLE}`}
                      >
                        <p className="text-[14px] font-semibold text-sam-fg">{opt.title}</p>
                        <p className="mt-1 text-[13px] font-normal leading-[1.45] text-sam-muted">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
                {meetAccessMode === "password_public" || meetAccessMode === "password_hidden" ? (
                  <div className="mt-3">
                    <label className={PHILIFE_WRITE_FB_FIELD_LABEL} htmlFor="meet-room-password">
                      {t("philife_write_room_password_label")}
                    </label>
                    <input
                      id="meet-room-password"
                      type="password"
                      value={meetPassword}
                      onChange={(e) => setMeetPassword(e.target.value)}
                      autoComplete="new-password"
                      className={PHILIFE_WRITE_FB_CONTROL}
                      placeholder={t("philife_write_password_placeholder")}
                    />
                  </div>
                ) : null}
              </section>

              <section className={PHILIFE_WRITE_FB_SECTION}>
              <div className="flex w-full min-w-0 flex-nowrap items-center gap-x-2 overflow-x-auto sm:gap-x-3">
                <label className={`${MEETUP_INLINE_LABEL_CLASS} shrink-0 whitespace-nowrap`} htmlFor="meet-max-members">
                  {t("philife_write_max_members_label")}
                </label>
                <input
                  id="meet-max-members"
                  type="number"
                  min={2}
                  max={500}
                  value={maxMembers}
                  onChange={(e) => setMaxMembers(Number(e.target.value))}
                  className="sam-input h-11 w-[4.25rem] shrink-0 px-2 py-2 text-center text-[14px] font-semibold tabular-nums"
                />
                <label className={`${MEETUP_INLINE_LABEL_CLASS} shrink-0 whitespace-nowrap`} htmlFor="meet-age-fee">
                  {t("philife_write_age_fee_label")}{" "}
                  <span className="font-normal text-sam-meta">{t("philife_write_optional_paren")}</span>
                </label>
                <input
                  id="meet-age-fee"
                  type="text"
                  value={ageFeeNote}
                  onChange={(e) => setAgeFeeNote(e.target.value)}
                  className={`min-w-[7rem] flex-1 ${PHILIFE_WRITE_FB_CONTROL}`}
                  placeholder={t("philife_write_age_fee_placeholder")}
                  autoComplete="off"
                />
              </div>
              </section>

              <section className={PHILIFE_WRITE_FB_SECTION}>
              <p className="text-[13px] leading-[1.45] text-[#65676B]">{t("philife_write_meetup_info_panel")}</p>
              </section>
            </>
          ) : (
            <>
              <section className={PHILIFE_WRITE_FB_SECTION}>
                <p className={TRADE_WRITE_FB_FIELD_HEAD}>
                  {t("philife_write_topic_current")}
                  <span className="ml-0.5 text-sam-danger" aria-hidden>
                    *
                  </span>
                </p>
                {writeTopicOptionsLoad === "loading" ? (
                  <div className="h-12 w-full animate-pulse rounded-ui-rect bg-sam-surface-muted" aria-busy="true" />
                ) : writeTopicOptions.length === 0 && !isEditMode ? (
                  <div className={`${PHILIFE_WRITE_WARNING_PANEL_CLASS} text-[14px] text-sam-fg`}>
                    <p>
                      {t("philife_write_no_topics_before")}
                      <strong>{t("philife_write_general_topics")}</strong>
                      {t("philife_write_no_topics_after_link1")}
                      <Link href={philifeAdminPaths.topics} className={PHILIFE_WRITE_WARNING_LINK_CLASS}>
                        {t("philife_write_feed_topics_admin")}
                      </Link>
                      {t("philife_write_no_topics_mid")}
                      <Link href={philifeAdminPaths.sections} className={PHILIFE_WRITE_WARNING_LINK_CLASS}>
                        {t("philife_write_feed_sections_admin")}
                      </Link>
                      {t("philife_write_no_topics_end")}
                    </p>
                    {writeTopicOptionsFetchErr ? (
                      <p className="mt-2 font-mono text-xs text-sam-danger">
                        {t("philife_write_err_api_prefix")} {writeTopicOptionsFetchErr}
                        <span className="ml-1 text-sam-muted">{t("philife_write_api_env_hint")}</span>
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <PhilifeWriteTopicDropdown
                    options={writeTopicOptions.map((o) => ({
                      slug: o.slug,
                      label: philifeWriteTopicOptionLabel(t, o, language),
                    }))}
                    value={category}
                    onChange={applyWriteCategory}
                    placeholder={t("philife_write_topic_placeholder")}
                    ariaLabel={t("philife_write_topic_select_aria")}
                    unlistedValueLabel={
                      isEditMode && category && !selectedTopicOption
                        ? `${initialTopicName?.trim() || category} ${t("philife_write_topic_paused_suffix")}`
                        : null
                    }
                    invalid={Boolean(fieldErr.topic)}
                    open={topicMenuOpen}
                    onOpenChange={setTopicMenuOpen}
                  />
                )}
                {fieldErr.topic ? <p className={PHILIFE_WRITE_FIELD_ERROR_CLASS}>{fieldErr.topic}</p> : null}
                {isEditMode && category && writeTopicOptionsLoad === "ready" && !selectedTopicOption ? (
                  <p className={PHILIFE_WRITE_HELPER_CLASS}>{t("philife_write_topic_paused_hint")}</p>
                ) : null}
              </section>

              {editorMode.canOptIn ? (
                <section className={PHILIFE_WRITE_FB_SECTION}>
                  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-sam-fg">
                        {t("philife_write_editor_beta_label")}
                      </span>
                      <span className={PHILIFE_WRITE_HELPER_CLASS}>{t("philife_write_editor_beta_hint")}</span>
                    </span>
                    <input
                      type="checkbox"
                      className="h-5 w-5 shrink-0 accent-[var(--sam-primary)]"
                      checked={editorMode.useWysiwyg}
                      disabled={uploading || editorUploading}
                      onChange={(e) => editorMode.setOptIn(e.target.checked)}
                    />
                  </label>
                </section>
              ) : null}

              <section className={PHILIFE_WRITE_FB_SECTION}>
                <label htmlFor="philife-write-title" className={TRADE_WRITE_FB_FIELD_HEAD}>
                  {t("philife_write_title_label")}
                  <span className="ml-0.5 text-sam-danger" aria-hidden>
                    *
                  </span>
                </label>
                <input
                  id="philife-write-title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (fieldErr.title) setFieldErr((f) => ({ ...f, title: undefined }));
                  }}
                  className={`${TRADE_WRITE_FB_CONTROL} min-h-12 ${fieldErr.title ? "border-sam-danger" : ""}`}
                  placeholder={t("philife_write_title_placeholder")}
                  aria-invalid={Boolean(fieldErr.title) || undefined}
                  autoComplete="off"
                  enterKeyHint="next"
                />
                {fieldErr.title ? <p className={PHILIFE_WRITE_FIELD_ERROR_CLASS}>{fieldErr.title}</p> : null}
              </section>

              {editorSeed ? (
                <section className={PHILIFE_WRITE_FB_SECTION}>
                  <p className={TRADE_WRITE_FB_FIELD_HEAD}>
                    {t("philife_write_content_label")}
                    <span className="ml-0.5 text-sam-danger" aria-hidden>
                      *
                    </span>
                  </p>
                  <div
                    className={`rounded-ui-rect border bg-sam-surface px-3 py-2.5 focus-within:border-sam-primary ${
                      fieldErr.content ? "border-sam-danger" : "border-sam-border"
                    }`}
                  >
                    <PhilifeBodyEditor
                      key={editorSeed.epoch}
                      initialBlocks={editorSeed.blocks}
                      maxImages={Math.max(0, COMMUNITY_MEMBER_POST_MAX_IMAGES - imageUrls.length)}
                      labels={{
                        placeholder: t("philife_write_content_placeholder"),
                        uploading: t("philife_write_image_uploading"),
                        failed: t("philife_write_image_failed"),
                        retry: t("philife_write_image_retry"),
                        remove: t("common_delete"),
                        moveUp: t("philife_write_image_move_up"),
                        moveDown: t("philife_write_image_move_down"),
                        imageLimit: t("philife_write_err_image_limit"),
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
                  </div>
                  {fieldErr.content ? <p className={PHILIFE_WRITE_FIELD_ERROR_CLASS}>{fieldErr.content}</p> : null}
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
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => editorFileRef.current?.click()}
                      className={`${Sam.btn.outlineCombo} ${Sam.btn.sm} gap-1.5`}
                    >
                      <ImagePlus className="h-4 w-4" aria-hidden />
                      {t("philife_write_toolbar_photo")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setLinkDraft((v) => (v === null ? "" : null))}
                      className={`${Sam.btn.outlineCombo} ${Sam.btn.sm} gap-1.5`}
                      aria-expanded={linkDraft !== null}
                    >
                      <Link2 className="h-4 w-4" aria-hidden />
                      {t("philife_write_toolbar_link")}
                    </button>
                    <span className="ml-auto text-[13px] tabular-nums text-sam-muted">
                      {t("philife_write_photo_count", {
                        count: (editorSnap?.imageNodeCount ?? 0) + imageUrls.length,
                        max: COMMUNITY_MEMBER_POST_MAX_IMAGES,
                      })}
                    </span>
                  </div>
                  {linkDraft !== null ? (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={linkDraft}
                        onChange={(e) => setLinkDraft(e.target.value)}
                        inputMode="url"
                        autoComplete="off"
                        enterKeyHint="done"
                        placeholder={t("philife_write_link_prompt")}
                        className={`${TRADE_WRITE_FB_CONTROL} min-h-11 min-w-0 flex-1`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const v = (linkDraft ?? "").trim();
                          if (!/^https?:\/\/\S+$/i.test(v)) {
                            setErr(t("philife_write_link_invalid"));
                            return;
                          }
                          editorApiRef.current?.insertLinkLine(v);
                          setLinkDraft(null);
                        }}
                        className={`${Sam.btn.primaryCombo} ${Sam.btn.sm} shrink-0`}
                      >
                        {t("common_confirm")}
                      </button>
                    </div>
                  ) : null}
                  {imageUrls.length > 0 ? (
                    <div className="mt-3">
                      <PhilifeWritePhotoStrip
                        urls={imageUrls}
                        max={COMMUNITY_MEMBER_POST_MAX_IMAGES}
                        uploading={false}
                        showAdd={false}
                        onAdd={() => {}}
                        onRemove={(i) => setImageUrls((prev) => prev.filter((_, idx) => idx !== i))}
                        labels={photoStripLabels}
                      />
                    </div>
                  ) : null}
                </section>
              ) : (
                <>
                  {editorFallbackNotice ? (
                    <p className={`${PHILIFE_WRITE_FB_SECTION} ${PHILIFE_WRITE_HELPER_CLASS}`}>
                      {t("philife_write_editor_fallback_notice")}
                    </p>
                  ) : null}
                  <section className={PHILIFE_WRITE_FB_SECTION}>
                    <label htmlFor="philife-write-content" className={TRADE_WRITE_FB_FIELD_HEAD}>
                      {t("philife_write_content_label")}
                      <span className="ml-0.5 text-sam-danger" aria-hidden>
                        *
                      </span>
                    </label>
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
                      className={`${TRADE_WRITE_FB_CONTROL} min-h-[12rem] resize-none leading-[1.6] ${
                        fieldErr.content ? "border-sam-danger" : ""
                      }`}
                      placeholder={t("philife_write_content_placeholder")}
                      aria-invalid={Boolean(fieldErr.content) || undefined}
                    />
                    {fieldErr.content ? <p className={PHILIFE_WRITE_FIELD_ERROR_CLASS}>{fieldErr.content}</p> : null}
                  </section>
                  <section className={PHILIFE_WRITE_FB_SECTION}>
                    <p className={TRADE_WRITE_FB_FIELD_HEAD}>{t("philife_write_toolbar_photo")}</p>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => void onPickFiles(e)}
                    />
                    <PhilifeWritePhotoStrip
                      urls={imageUrls}
                      max={COMMUNITY_MEMBER_POST_MAX_IMAGES}
                      uploading={uploading}
                      onAdd={() => fileRef.current?.click()}
                      onRemove={(i) => setImageUrls((prev) => prev.filter((_, idx) => idx !== i))}
                      labels={photoStripLabels}
                    />
                  </section>
                </>
              )}
            </>
          )}

          {/*
            Write-form top promote UI HIDDEN.
            A2 top exposure SSOT = post detail「게시물 홍보하기」(MemberPostPromoteSheet).
          */}
          {false && category !== "meetup" && writeTopicOptions.length > 0 ? (
            <section className={PHILIFE_WRITE_FB_SECTION} aria-label={t("philife_write_ad_section_aria")}>
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={promoteAdEnabled}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setPromoteAdEnabled(on);
                    if (!on) {
                      setSelectedAdProduct(null);
                      setAdDepositorName("");
                      setAdMemo("");
                      setAdPaymentMethod("points");
                    }
                  }}
                  className="mt-1 h-4 w-4 shrink-0 rounded-sam-sm border-sam-warning/40 text-sam-warning"
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-sam-fg">{t("philife_write_ad_promote_label")}</span>
                </span>
              </label>
              {promoteAdEnabled ? (
                <div className="mt-3 space-y-3 border-t border-sam-warning/20 pt-3">
                  <p className="text-[12px] leading-snug text-[#65676B]">
                    {t("philife_write_promo_immediate_hint")}
                  </p>
                  <div className="flex items-center justify-between rounded-md border border-[#ccd0d5] bg-[#f0f2f5] px-3 py-2 text-[14px]">
                    <span className="font-medium text-[#050505]">{t("philife_write_my_points")}</span>
                    <span className="font-bold text-[#050505]">
                      {philifeWriteAdProductPointCost(t, pointBalance, pointsLocale)}
                    </span>
                  </div>
                  {adProductsLoading ? (
                    <p className="py-2 text-center text-[15px] text-sam-muted">{t("philife_write_ad_products_loading")}</p>
                  ) : adProducts.length === 0 ? (
                    <p className="text-[13px] text-sam-muted">{t("philife_write_ad_products_empty")}</p>
                  ) : (
                    <div className="space-y-2" role="radiogroup" aria-label={t("philife_write_ad_products_aria")}>
                      {adProducts.map((p) => {
                        const isSelected = selectedAdProduct?.id === p.id;
                        const lacking = Math.max(0, p.pointCost - pointBalance);
                        const disabled = lacking > 0;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                              if (disabled) return;
                              setSelectedAdProduct(p);
                              setAdPaymentMethod("points");
                            }}
                            className={`w-full rounded-sam-md border px-3 py-2.5 text-left transition-colors ${
                              disabled
                                ? "cursor-not-allowed border-sam-border/60 bg-sam-surface-muted opacity-60"
                                : isSelected
                                  ? "border-sam-warning/40 bg-sam-warning-soft"
                                  : "border-sam-border bg-sam-surface hover:bg-sam-surface-muted"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[14px] font-semibold text-[#050505]">
                                  {philifeWriteAdProductTitle(t, p)}
                                </p>
                                <p className="mt-0.5 text-[12px] text-[#65676B]">
                                  {t("philife_write_ad_type_duration_line", {
                                    type: postAdTypeLabel(t, p.adType),
                                    days: t("philife_write_ad_duration_days", { days: p.durationDays }),
                                  })}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-[14px] font-bold text-[#050505]">
                                  {philifeWriteAdProductPointCost(t, p.pointCost, pointsLocale)}
                                </p>
                                {lacking > 0 ? (
                                  <p className="text-[12px] text-sam-danger">
                                    {t("philife_write_ad_points_short", {
                                      points: lacking.toLocaleString(pointsLocale),
                                    })}
                                  </p>
                                ) : (
                                  <p className="text-[12px] text-sam-success">{t("philife_write_ad_available")}</p>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selectedAdProduct && adShortfall > 0 ? (
                    <p className="text-[13px] text-sam-danger">
                      {t("philife_write_points_short_full", {
                        amount: adShortfall.toLocaleString(pointsLocale),
                      })}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          <div ref={submitErrorAnchorRef} className="min-h-0 scroll-mt-24" />
        </form>
        </div>
      </div>

      <PhilifeWriteActionFooter
        busy={busy}
        submitDisabled={submitDisabled}
        error={err || submitBlockedReason}
        submitIdleLabel={isEditMode ? t("common_save") : undefined}
        onCancel={() => void handleWriteCancel()}
      />
    </div>
  );
}
