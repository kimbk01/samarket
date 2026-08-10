"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRegion } from "@/contexts/RegionContext";
import { WriteScreenTier1Sync } from "@/components/write/WriteScreenTier1Sync";
import {
  philifeArticleOgImageUrl,
  philifeNeighborhoodPostsUrl,
  philifeUploadImageFromUrl,
  philifeUploadImageUrl,
} from "@domain/philife/api";
import { normalizeHttpUrlString } from "@/lib/philife/http-url-string";
import {
  applyInterleavedImageUrlReplacements,
  extractImageUrlsFromInterleavedContent,
  hasInterleavedMarkdownImageSyntax,
  interleavedMarkdownFromPastedHtml,
  workItemsFromInterleavedMd,
} from "@/lib/philife/interleaved-body-markdown";
import {
  extractOrderedPastedImageSources,
  firstLikelyArticlePageUrl,
} from "@/lib/philife/neighborhood-write-paste";
import { fetchPhilifeNeighborhoodTopicOptionsForWrite } from "@/lib/philife/fetch-neighborhood-topic-options-client";
import { philifeAdminPaths, philifeAppPaths } from "@domain/philife/paths";
import { buildCommunityFeedHref } from "@/lib/community/community-nav";
import {
  neighborhoodLocationKeyFromRegion,
  neighborhoodLocationMetaFromRegion,
  neighborhoodLocationLabelFromRegion,
} from "@/lib/neighborhood/location-key";
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
  PHILIFE_WRITE_SELECT_CLASS,
} from "@/lib/ui/philife-write-fb-ui";
import type { AdPaymentMethod, AdProduct } from "@/lib/ads/types";
import { postAdTypeLabel } from "@/lib/ads/post-ad-label-keys";
import { useUserPointBalance } from "@/hooks/useUserPointBalance";
import { redirectForBlockedAction } from "@/lib/auth/client-access-flow";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { requireAuthAction } from "@/lib/auth/require-auth-action";
import { invalidateCommunityAuthorPostsClientCaches } from "@/lib/community/invalidate-community-author-posts-client";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  philifeWriteAdProductPointCost,
  philifeWriteAdProductTitle,
} from "@/lib/ads/philife-write-ad-product-i18n";
import { philifeWriteTopicOptionLabel } from "@/lib/philife/philife-write-topic-label";
import type { PhilifeNeighborhoodWriteTopicOption } from "@/lib/neighborhood/philife-neighborhood-topics";

const PHILIFE_WRITE_HELPER_CLASS = "mt-1 text-[12px] leading-snug text-[#65676B]";
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
  const { currentRegion } = useRegion();
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
  const [writeTopicOptions, setWriteTopicOptions] = useState<PhilifeNeighborhoodWriteTopicOption[]>([]);
  /** `writeTopicOptions.length === 0` 이 로딩 중인지·진짜 비어 있는지 구분 */
  const [writeTopicOptionsLoad, setWriteTopicOptionsLoad] = useState<"loading" | "ready">("loading");
  /** `ok: false` 또는 catch 시 서버/네트워크 힌트(설정·데이터 0이 아닐 수 있음) */
  const [writeTopicOptionsFetchErr, setWriteTopicOptionsFetchErr] = useState<string | null>(null);
  const [category, setCategory] = useState<string>(() => (initialCategory === "meetup" ? "meetup" : ""));
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const imageUrlsCountRef = useRef(0);
  const [uploading, setUploading] = useState(false);
  const [maxMembers, setMaxMembers] = useState(30);

  /** 서버 기본 모임 피드 주제 slug — UI 비노출 */
  const MEETUP_TOPIC_SLUG = "meetup";
  const [meetIntro, setMeetIntro] = useState("");
  const [ageFeeNote, setAgeFeeNote] = useState("");
  const [meetRegionText, setMeetRegionText] = useState(() => currentRegion?.label?.trim() || "");
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
          setCategory((prev) => (prev === "meetup" || initialCategory === "meetup" ? "meetup" : ""));
          return;
        }
        if (j.writeTopics.length === 0) {
          setWriteTopicOptionsFetchErr(null);
          setWriteTopicOptions([]);
          setCategory((prev) => (prev === "meetup" || initialCategory === "meetup" ? "meetup" : ""));
          return;
        }
        setWriteTopicOptionsFetchErr(null);
        setWriteTopicOptions(j.writeTopics);
        setCategory((prev) => {
          if (prev === "meetup" || initialCategory === "meetup") return "meetup";
          if (j.writeTopics!.some((o) => o.slug === prev)) return prev;
          if (initialCategory && j.writeTopics!.some((o) => o.slug === initialCategory)) {
            return initialCategory;
          }
          return j.writeTopics![0]!.slug;
        });
      } catch {
        if (!cancelled) {
          setWriteTopicOptionsFetchErr(t("philife_write_err_topics_fetch"));
          setWriteTopicOptions([]);
          setCategory((prev) => (prev === "meetup" || initialCategory === "meetup" ? "meetup" : ""));
        }
      } finally {
        if (!cancelled) setWriteTopicOptionsLoad("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialCategory, t]);

  useEffect(() => {
    if (category === "meetup") {
      setMeetRegionText(currentRegion?.label?.trim() || "");
    }
  }, [category, currentRegion]);

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

  const postMultipartFile = useCallback(async (f: File) => {
    const fd = new FormData();
    fd.append("file", f);
    const res = await fetch(philifeUploadImageUrl(), { method: "POST", body: fd });
    return (await res.json()) as { ok?: boolean; url?: string; error?: string };
  }, []);

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    setErr("");
    try {
      const next = category === "meetup" ? [] : [...imageUrls];
      for (const f of Array.from(files)) {
        if (next.length >= (category === "meetup" ? 1 : 10)) break;
        const j = await postMultipartFile(f);
        if (j.ok && j.url) next.push(j.url);
        else setErr(j.error ?? t("philife_write_err_image_upload"));
      }
      setImageUrls(next);
    } finally {
      setUploading(false);
      e.target.value = "";
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
      const plainClip = cd.getData("text/plain");
      if (plainClip) {
        insertPlainAtSelection(plainClip);
      }
      setUploading(true);
      setErr("");
      try {
        const cap = Math.max(0, 10 - imageUrlsCountRef.current);
        const newUrls: string[] = [];
        for (const f of imageFiles) {
          if (newUrls.length >= cap) break;
          const j = await postMultipartFile(f);
          if (j.ok && j.url) newUrls.push(j.url);
          else if (j.error) setErr(j.error);
        }
        if (newUrls.length) {
          setImageUrls((prev) => [...newUrls, ...prev].slice(0, 10));
        }
      } finally {
        setUploading(false);
      }
      return;
    }

    const plain0 = cd.getData("text/plain") || "";
    const html = cd.getData("text/html") || "";
    const richMd = html.trim() ? interleavedMarkdownFromPastedHtml(html, plain0) : null;
    const useInterleaved = Boolean(richMd && richMd.includes("!["));
    let work = useInterleaved && richMd
      ? workItemsFromInterleavedMd(richMd)
      : html.trim()
        ? extractOrderedPastedImageSources(html, plain0)
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
    const middle = useInterleaved && richMd ? richMd : plain0;
    setContent(before + middle + after);
    pendingContentCaretRef.current = sa + middle.length;
    setUploading(true);
    setErr("");

    let usedOgForInitialWork = false;
    if (work.length === 0 && pageRef) {
      const res = await fetch(philifeArticleOgImageUrl(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageUrl: pageRef }),
      });
      const jg = (await res.json()) as { ok?: boolean; imageUrl?: string; error?: string };
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
      const r0 = await fetch(dataUrl);
      const blob = await r0.blob();
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
      const cap = Math.max(0, 10 - imageUrlsCountRef.current);
      const out: string[] = [];
      let i = 0;
      let placedPrimary = false;

      while (i < work.length && out.length < cap) {
        const item = work[i]!;
        if (!placedPrimary) {
          if (item.kind === "data") {
            const r = await tryRehostDataUrl(item.value);
            if (r.kind === "hosted") {
              out.push(r.url);
              urlPairs.push({ from: item.value, to: r.url });
              placedPrimary = true;
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
              placedPrimary = true;
            } else if (rh.kind === "error" && raw) {
              out.push(raw);
              urlPairs.push({ from: raw, to: raw });
              placedPrimary = true;
            }
          }
          i += 1;
          continue;
        }
        if (item.kind === "data") {
          i += 1;
          continue;
        }
        const ex = normalizeHttpUrlString(item.value);
        if (embeddable(ex) && out.length < cap) {
          out.push(ex);
          urlPairs.push({ from: ex, to: ex });
        }
        i += 1;
      }

      if (out.length === 0 && pageRef && !usedOgForInitialWork) {
        const res2 = await fetch(philifeArticleOgImageUrl(), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageUrl: pageRef }),
        });
        const j2 = (await res2.json()) as { ok?: boolean; imageUrl?: string; error?: string };
        if (j2.ok && j2.imageUrl) {
          const rh = await tryRehostFromHttp(j2.imageUrl);
          const n = normalizeHttpUrlString(j2.imageUrl);
          if (rh.kind === "hosted") {
            out.push(rh.url);
            urlPairs.push({ from: n, to: rh.url });
          } else if (embeddable(j2.imageUrl)) {
            out.push(n);
            urlPairs.push({ from: n, to: n });
          } else {
            setErr(t("philife_write_err_thumb_upload"));
          }
        } else {
          setErr(j2.error ?? t("philife_write_err_og_meetup"));
        }
      }
      if (out.length) {
        setImageUrls((prev) => [...out, ...prev].slice(0, 10));
        if (useInterleaved && richMd && urlPairs.length) {
          const newMid = applyInterleavedImageUrlReplacements(middle, urlPairs);
          if (newMid !== middle) {
            setContent(before + newMid + after);
            pendingContentCaretRef.current = sa + newMid.length;
          }
        }
      } else if (!pageRef) {
        setErr(t("philife_write_err_paste_align"));
      } else if (usedOgForInitialWork) {
        setErr(t("philife_write_err_thumb_display"));
      }
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitLockRef.current || busy) return;
    submitLockRef.current = true;
    try {
      setErr("");
      const locationKey = neighborhoodLocationKeyFromRegion(currentRegion);
    const locationMeta = neighborhoodLocationMetaFromRegion(currentRegion);
    const locationName = neighborhoodLocationLabelFromRegion(currentRegion);
    if (!locationKey || !locationMeta) {
      setErr(t("philife_write_err_region_required"));
      return;
    }
    if (category !== "meetup" && writeTopicOptions.length === 0) {
      setErr(t("philife_write_err_no_topics"));
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
        : content.trim();

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
        locationName: locationMeta.name || locationName || currentRegion?.label || "",
        category,
        title: title.trim(),
        content: composedContent,
        images:
          category === "meetup"
            ? []
            : (() => {
                const bodyText = content.trim();
                if (hasInterleavedMarkdownImageSyntax(bodyText)) {
                  const u = extractImageUrlsFromInterleavedContent(bodyText);
                  return u.length > 0 ? u : imageUrls;
                }
                return imageUrls;
              })(),
      };
      if (category === "meetup") {
        payload.meetTopicSlug = MEETUP_TOPIC_SLUG;
        const shortDesc =
          meetIntro.replace(/\s+/g, " ").trim().slice(0, 500) || composedContent.slice(0, 500);
        const regionFallback =
          meetRegionText.trim() ||
          currentRegion?.label?.trim() ||
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
        window.alert(
          t("philife_write_promo_failed") ||
            "게시물은 등록됐지만 상위 노출 결제에 실패했습니다. 글 상세에서 다시 홍보해 주세요."
        );
      }

      /** 모임 생성 시 커뮤니티 모임 피드로, 일반 글은 게시글로 이동 */
      if (onSheetExitBeforeNavigate) {
        await onSheetExitBeforeNavigate();
      } else {
        onWillNavigateAfterSuccess?.();
      }
      if (category === "meetup") {
        const mid = typeof j.meetingId === "string" && j.meetingId.trim() ? j.meetingId.trim() : null;
        router.replace(mid ? philifeAppPaths.meeting(mid) : philifeAppPaths.meetingsFeed);
      } else {
        // Return to Community hub with same topic (or Latest when none).
        const topic =
          category && category !== "meetup" ? category.trim().toLowerCase() : "";
        router.replace(
          buildCommunityFeedHref(philifeAppPaths.home, {
            selection: topic
              ? { kind: "topic", topicSlug: topic, allSort: "latest" }
              : { kind: "all", topicSlug: "", allSort: "latest" },
          })
        );
      }
      } catch {
        setErr(t("philife_write_err_network_occurred"));
      } finally {
        setBusy(false);
      }
    } finally {
      submitLockRef.current = false;
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
            meetRegionText.trim() !== (currentRegion?.label ?? "").trim())
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
    currentRegion?.label,
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

  const handleSheetCancel = useCallback(async () => {
    if (!onSheetClose) return;
    if (sheetHasDraft()) {
      if (!window.confirm(t("philife_write_discard_confirm"))) return;
    }
    try {
      await Promise.resolve(onSheetClose());
    } catch {
      /* no-op */
    }
  }, [onSheetClose, sheetHasDraft, t]);

  const handlePageCancel = useCallback(() => {
    if (sheetHasDraft()) {
      if (!window.confirm(t("philife_write_discard_confirm"))) return;
    }
    router.push(philifeAppPaths.home);
  }, [router, sheetHasDraft, t]);

  const handleWriteCancel = suppressWriteScreenTier1 && onSheetClose ? handleSheetCancel : handlePageCancel;

  const submitDisabled =
    category !== "meetup" && (writeTopicOptionsLoad !== "ready" || writeTopicOptions.length === 0);

  const tier1Title =
    category === "meetup"
      ? title.trim() || t("philife_write_meetup_create_title")
      : t("tier1_community_write");

  const rootClass = [
    "flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden bg-white",
    COMMUNITY_FONT_CLASS,
    "text-[#050505]",
    suppressWriteScreenTier1 ? "" : "min-h-screen",
  ]
    .filter(Boolean)
    .join(" ");

  const scrollWrapClass = suppressWriteScreenTier1
    ? PHILIFE_WRITE_SCROLL_BODY_CLASS
    : `${PHILIFE_WRITE_SCROLL_BODY_CLASS} ${APP_MAIN_COLUMN_CLASS}`;

  return (
    <div className={rootClass}>
      {suppressWriteScreenTier1 ? null : (
        <WriteScreenTier1Sync backHref={philifeAppPaths.home} title={tier1Title} />
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

      <div className={scrollWrapClass}>
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
                <h4 className={PHILIFE_WRITE_FB_BLOCK_TITLE}>{t("philife_write_category_label")}</h4>
                {writeTopicOptionsLoad === "loading" ? (
                  <p className="mt-2 text-[14px] font-normal text-sam-muted">{t("philife_write_topics_loading")}</p>
                ) : writeTopicOptions.length === 0 ? (
                  <div className={`mt-2 ${PHILIFE_WRITE_WARNING_PANEL_CLASS} text-[14px] text-sam-fg`}>
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
                  <>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={PHILIFE_WRITE_SELECT_CLASS}
                      aria-label={t("philife_write_topic_select_aria")}
                    >
                      {writeTopicOptions.map((o) => (
                        <option key={o.slug} value={o.slug} title={o.slug}>
                          {philifeWriteTopicOptionLabel(t, o, language)}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </section>
              <section className={PHILIFE_WRITE_FB_SECTION}>
                <h4 className={PHILIFE_WRITE_FB_BLOCK_TITLE}>{t("philife_write_title_label")}</h4>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={PHILIFE_WRITE_FB_CONTROL}
                  placeholder={t("philife_write_title_placeholder")}
                />
              </section>
              <section className={PHILIFE_WRITE_FB_SECTION}>
                <h4 className={PHILIFE_WRITE_FB_BLOCK_TITLE}>{t("philife_write_content_label")}</h4>
                <textarea
                  ref={contentTextareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={(e) => void onContentPaste(e)}
                  rows={8}
                  className={`${PHILIFE_WRITE_FB_CONTROL} min-h-[10rem]`}
                  placeholder={t("philife_write_content_placeholder")}
                />
              </section>
              <section className={PHILIFE_WRITE_FB_SECTION}>
                <h4 className={PHILIFE_WRITE_FB_BLOCK_TITLE}>{t("philife_write_add_photos")}</h4>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => void onPickFiles(e)}
                />
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="rounded-md border border-[#ccd0d5] bg-white px-4 py-2 sam-text-body text-[#050505]"
                >
                  {uploading ? t("common_uploading") : t("philife_write_add_photos")}
                </button>
                {imageUrls.length > 0 ? (
                  <ul className="mt-[4pt] flex flex-wrap gap-[4pt]">
                    {imageUrls.map((url, i) => (
                      <li key={url} className={`relative h-16 w-16 ${PHILIFE_WRITE_THUMB_FRAME_CLASS}`}>
                        <SamarketThumbnail
                          src={url}
                          alt=""
                          size={64}
                          roundedClassName="rounded-ui-rect"
                          className="h-16 w-16"
                        />
                        <button
                          type="button"
                          className="absolute right-1 top-1 z-[1] inline-flex h-5 w-5 items-center justify-center rounded-sam-sm bg-[#1E3932]/80 text-[11px] font-medium text-white"
                          onClick={() => setImageUrls((prev) => prev.filter((_, idx) => idx !== i))}
                          aria-label={t("common_delete")}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
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
        error={err}
        onCancel={() => void handleWriteCancel()}
      />
    </div>
  );
}
