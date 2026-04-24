"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  neighborhoodLocationKeyFromRegion,
  neighborhoodLocationMetaFromRegion,
  neighborhoodLocationLabelFromRegion,
} from "@/lib/neighborhood/location-key";
import {
  COMMUNITY_BUTTON_PRIMARY_CLASS,
  COMMUNITY_BUTTON_SECONDARY_CLASS,
  PHILIFE_FB_CARD_CLASS,
  PHILIFE_FB_INPUT_CLASS,
  PHILIFE_FB_TEXTAREA_CLASS,
  PHILIFE_PAGE_ROOT_CLASS,
  COMMUNITY_FONT_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import type { AdPaymentMethod, AdProduct } from "@/lib/ads/types";
import { AD_TYPE_LABELS } from "@/lib/ads/types";
import { getUserPointBalance } from "@/lib/ads/mock-ad-data";
import { getCurrentUser } from "@/lib/auth/get-current-user";

/** 모임 생성 섹션 제목 타이포 통일 */
const MEETUP_SECTION_LABEL_BASE = "px-0 text-[13px] font-normal leading-[1.45] text-sam-muted";
/** 세로 스택 블록용(왼쪽 열 정렬) */
const MEETUP_SECTION_LABEL_CLASS = `${MEETUP_SECTION_LABEL_BASE} block w-full max-w-full`;
const WRITE_HELPER_TEXT_CLASS = "mt-2 text-[13px] font-normal leading-[1.45] text-sam-muted";
const WRITE_INFO_PANEL_CLASS =
  "rounded-sam-md border border-sam-border bg-sam-surface-muted px-4 py-3 text-[13px] font-normal leading-[1.45] text-sam-muted";
const WRITE_WARNING_PANEL_CLASS = "rounded-sam-md border border-sam-warning/25 bg-sam-warning-soft/70 p-3";
const WRITE_WARNING_LINK_CLASS =
  "font-medium text-sam-fg underline decoration-sam-warning/50 underline-offset-2";
const WRITE_SELECT_CLASS =
  "sam-select bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%23667085%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M19%209l-7%207-7-7%22%2F%3E%3C%2Fsvg%3E')] [background-position:right_0.75rem_center] [background-size:1rem] bg-no-repeat";
const WRITE_CHOICE_CARD_BASE = "rounded-sam-md border px-3 py-3 text-left transition-colors";
const WRITE_CHOICE_CARD_ACTIVE =
  "border-sam-primary-border bg-sam-primary-soft shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sam-primary)_18%,transparent)]";
const WRITE_CHOICE_CARD_IDLE = "border-sam-border bg-sam-surface hover:bg-sam-surface-muted";
const WRITE_THUMB_FRAME_CLASS =
  "relative overflow-hidden rounded-sam-md bg-sam-surface-muted ring-1 ring-sam-border";
const WRITE_THUMB_REMOVE_CLASS =
  "absolute right-2 top-2 inline-flex items-center justify-center rounded-sam-sm bg-sam-ink/70 px-2 py-1 text-[11px] font-medium text-white backdrop-blur-[1px]";

function buildMeetupPostContent(parts: { intro: string; ageFee: string }): string {
  const intro = parts.intro.replace(/\s+/g, " ").trim();
  const age = parts.ageFee.replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  lines.push(intro);
  if (age) {
    lines.push("");
    lines.push("— 연령 / 가입비 —");
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

type WriteTopicOption = { slug: string; name: string };

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
  const router = useRouter();
  const { currentRegion } = useRegion();
  const fileRef = useRef<HTMLInputElement>(null);
  const [writeTopicOptions, setWriteTopicOptions] = useState<WriteTopicOption[]>([]);
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
  const pointBalance = me?.id ? getUserPointBalance(me.id) : 0;

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
          setWriteTopicOptionsFetchErr("네트워크 오류이거나 JSON이 아닙니다.");
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
  }, [initialCategory]);

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
    void fetch(`/api/ads/products?boardKey=plife`)
      .then((r) => r.json())
      .then((j: { products?: AdProduct[] }) => {
        if (!cancelled) setAdProducts(j.products ?? []);
      })
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
        else setErr(j.error ?? "이미지 업로드 실패");
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
    let imageFiles: File[] = fromFiles;
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
      const t = cd.getData("text/plain");
      if (t) {
        insertPlainAtSelection(t);
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
        setErr(jg.error ?? "기사·페이지에서 대표 이미지(og)를 가져오지 못했습니다.");
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
        return { kind: "error" as const, message: "네트워크 오류" };
      }
      let j: { ok?: boolean; url?: string; error?: string } = {};
      try {
        j = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      } catch {
        return { kind: "error" as const, message: "응답 파싱 실패" };
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
        return { kind: "err" as const, message: "이미지는 8MB 이하만 가능합니다." };
      }
      const ext =
        blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : blob.type === "image/gif" ? "gif" : "jpg";
      const f = new File([blob], `paste.${ext}`, { type: blob.type });
      const j = await postMultipartFile(f);
      if (j.ok && j.url) return { kind: "hosted" as const, url: j.url };
      return { kind: "err" as const, message: j.error ?? "이미지 업로드 실패" };
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
            setErr("썸네일을 서버에 올리지 못했습니다. 잠시 후 다시 붙여 넣어 주세요.");
          }
        } else {
          setErr(
            j2.error ??
              "기사에서 대표 이미지(og)를 가져오지 못했습니다. 주소·차단·형식을 확인해 주세요."
          );
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
        setErr("이미지를 맞추지 못했습니다. 첫 장은 서버 저장, 추가는 외부 링크만 씁니다. JPEG, PNG, WebP, GIF, 8MB 이하.");
      } else if (usedOgForInitialWork) {
        setErr("썸네일 주소는 찾았으나 서버·외부 표시에 모두 실패했습니다. 잠시 후 다시 시도해 주세요.");
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
      setErr("동네를 먼저 설정해 주세요.");
      return;
    }
    if (category !== "meetup" && writeTopicOptions.length === 0) {
      setErr("글 주제가 설정되어 있지 않습니다. 어드민 → 피드 주제에서 동네 피드 섹션에 일반 주제를 추가해 주세요.");
      return;
    }

    const composedContent =
      category === "meetup"
        ? buildMeetupPostContent({
            intro: meetIntro,
            ageFee: ageFeeNote,
          })
        : content.trim();

    if (!title.trim()) {
      setErr(category === "meetup" ? "모임 이름을 입력해 주세요." : "제목을 입력해 주세요.");
      return;
    }
    if (!composedContent.trim()) {
      setErr(category === "meetup" ? "소개를 입력해 주세요." : "내용을 입력해 주세요.");
      return;
    }
    if (category === "meetup") {
      const needsPw = meetAccessMode === "password_public" || meetAccessMode === "password_hidden";
      if (needsPw) {
        const p = meetPassword.trim();
        if (p.length < 4 || p.length > 128) {
          setErr("비밀번호 입장·숨김 비밀 모임은 비밀번호를 4~128자로 입력해 주세요.");
          return;
        }
      }
    }

    if (category !== "meetup" && promoteAdEnabled) {
      if (!selectedAdProduct) {
        setErr("광고 노출을 선택하셨다면 광고 상품을 골라 주세요.");
        return;
      }
      if (adPaymentMethod === "points") {
        const short = Math.max(0, selectedAdProduct.pointCost - pointBalance);
        if (short > 0) {
          setErr(`포인트가 ${short.toLocaleString()}P 부족합니다. 충전하거나 계좌 입금을 선택해 주세요.`);
          return;
        }
      }
      if (adPaymentMethod === "bank_transfer" && !adDepositorName.trim()) {
        setErr("계좌 입금을 선택한 경우 입금자명을 입력해 주세요.");
        return;
      }
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
                const t = content.trim();
                if (hasInterleavedMarkdownImageSyntax(t)) {
                  const u = extractImageUrlsFromInterleavedContent(t);
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
          meetRegionText.trim() || currentRegion?.label?.trim() || locationName || "동네";
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
          category_text: "모임",
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
        setErr("서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (!res.ok || !j.ok || !j.id) {
        setErr(j.error ?? "등록에 실패했습니다.");
        return;
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
        router.replace(philifeAppPaths.post(j.id));
      }
      if (category !== "meetup" && promoteAdEnabled && selectedAdProduct) {
        void (async () => {
          try {
            const applyRes = await fetch("/api/ads/apply", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                postId: j.id,
                adProductId: selectedAdProduct.id,
                paymentMethod: adPaymentMethod,
                depositorName: adPaymentMethod === "bank_transfer" ? adDepositorName.trim() : undefined,
                memo: adMemo.trim() || undefined,
              }),
            });
            const aj = (await applyRes.json()) as { ok?: boolean; error?: string };
            if (!applyRes.ok || !aj.ok) {
              console.warn("[philife/write] ads/apply failed", aj?.error ?? applyRes.status);
            }
          } catch(e) {
            console.warn("[philife/write] ads/apply", e);
          }
        })();
      }
      } catch {
        setErr("네트워크 오류가 발생했습니다.");
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
      if (!window.confirm("입력한 내용이 저장되지 않습니다.\n취소하고 닫을까요?")) return;
    }
    try {
      await Promise.resolve(onSheetClose());
    } catch {
      /* no-op */
    }
  }, [onSheetClose, sheetHasDraft]);

  const tier1Title =
    category === "meetup" ? title.trim() || "모임 만들기" : "커뮤니티 글쓰기";

  const rootClass = suppressWriteScreenTier1
    ? [
        "flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden",
        COMMUNITY_FONT_CLASS,
        "bg-sam-app text-sam-fg",
        "pt-2",
        APP_MAIN_GUTTER_X_CLASS,
      ].join(" ")
    : `${PHILIFE_PAGE_ROOT_CLASS} pt-2 ${APP_MAIN_GUTTER_X_CLASS}`;

  return (
    <div className={rootClass}>
      {suppressWriteScreenTier1 ? null : (
        <WriteScreenTier1Sync backHref={philifeAppPaths.home} title={tier1Title} />
      )}

      {category === "meetup" ? (
        <div className="mb-3">
          <Link
            href={philifeAppPaths.write}
            className={`inline-flex items-center px-4 ${COMMUNITY_BUTTON_SECONDARY_CLASS}`}
          >
            ← 일반 글쓰기로
          </Link>
        </div>
      ) : null}

      <form
        onSubmit={onSubmit}
        className={`space-y-4 sam-card-pad ${PHILIFE_FB_CARD_CLASS}`}
      >
        {category === "meetup" ? (
            <>
              <div>
                <label className={MEETUP_SECTION_LABEL_CLASS}>모임 이름</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={`mt-2 w-full min-h-[2.75rem] ${PHILIFE_FB_INPUT_CLASS}`}
                  placeholder="모임 이름을 입력하세요"
                  autoComplete="off"
                />
              </div>

              <div>
                <textarea
                  value={meetIntro}
                  onChange={(e) => setMeetIntro(e.target.value)}
                  rows={4}
                  className={`mt-2 !min-h-[7rem] ${PHILIFE_FB_TEXTAREA_CLASS}`}
                  placeholder="모임 소개를 입력하세요…"
                />
              </div>

              <div>
                <label className={MEETUP_SECTION_LABEL_CLASS}>대표 이미지</label>
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
                  className={`mt-2 px-4 ${COMMUNITY_BUTTON_SECONDARY_CLASS}`}
                >
                  {uploading ? "업로드 중…" : imageUrls[0] ? "대표 이미지 변경" : "대표 이미지 추가"}
                </button>
                {imageUrls[0] ? (
                  <div className={`mt-2 h-36 ${WRITE_THUMB_FRAME_CLASS}`}>
                    <img src={imageUrls[0]} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      className={WRITE_THUMB_REMOVE_CLASS}
                      onClick={() => setImageUrls([])}
                    >
                      삭제
                    </button>
                  </div>
                ) : (
                <p className={WRITE_HELPER_TEXT_CLASS}>모임 목록과 상세에 노출될 대표 이미지를 선택할 수 있습니다.</p>
                )}
              </div>

              <div>
                <label className={MEETUP_SECTION_LABEL_CLASS}>모임 지역</label>
                <input
                  value={meetRegionText}
                  onChange={(e) => setMeetRegionText(e.target.value)}
                  className={`mt-2 w-full min-h-[2.75rem] ${PHILIFE_FB_INPUT_CLASS}`}
                  placeholder="지역을 입력하세요 (예: 마카티)"
                />
              </div>

              <div>
                <label className={MEETUP_SECTION_LABEL_CLASS}>모임 채팅 유형</label>
                <p className={WRITE_HELPER_TEXT_CLASS}>
                  자유·비밀은 메신저 「모임 찾기」에 노출될 수 있어요. 숨김은 링크로 초대한 사람만 찾을 수 있어요.
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {(
                    [
                      {
                        id: "free_public" as const,
                        title: "자유 방",
                        desc: "누구나 입장. 목록에 노출.",
                      },
                      {
                        id: "password_public" as const,
                        title: "비밀 방",
                        desc: "비밀번호로 입장. 목록에 노출.",
                      },
                      {
                        id: "free_hidden" as const,
                        title: "숨김 (자유)",
                        desc: "목록 비노출. 링크로 입장.",
                      },
                      {
                        id: "password_hidden" as const,
                        title: "숨김 비밀",
                        desc: "목록 비노출. 링크 + 비밀번호.",
                      },
                    ] as const
                  ).map((opt) => {
                    const on = meetAccessMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setMeetAccessMode(opt.id);
                          if (opt.id === "free_public" || opt.id === "free_hidden") setMeetPassword("");
                        }}
                        className={`${WRITE_CHOICE_CARD_BASE} ${on ? WRITE_CHOICE_CARD_ACTIVE : WRITE_CHOICE_CARD_IDLE}`}
                      >
                        <p className="text-[14px] font-semibold text-sam-fg">{opt.title}</p>
                        <p className="mt-1 text-[13px] font-normal leading-[1.45] text-sam-muted">{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
                {meetAccessMode === "password_public" || meetAccessMode === "password_hidden" ? (
                  <div className="mt-3">
                    <label className={MEETUP_SECTION_LABEL_CLASS} htmlFor="meet-room-password">
                      입장 비밀번호
                    </label>
                    <input
                      id="meet-room-password"
                      type="password"
                      value={meetPassword}
                      onChange={(e) => setMeetPassword(e.target.value)}
                      autoComplete="new-password"
                      className={`mt-2 w-full min-h-[2.75rem] ${PHILIFE_FB_INPUT_CLASS}`}
                      placeholder="비밀번호 (4자 이상)"
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex w-full min-w-0 flex-nowrap items-center gap-x-2 overflow-x-auto sm:gap-x-3">
                <label className={`${MEETUP_SECTION_LABEL_BASE} shrink-0 whitespace-nowrap`} htmlFor="meet-max-members">
                  최대 인원
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
                <label className={`${MEETUP_SECTION_LABEL_BASE} shrink-0 whitespace-nowrap`} htmlFor="meet-age-fee">
                  연령 / 가입비 <span className="font-normal text-sam-meta">(선택)</span>
                </label>
                <input
                  id="meet-age-fee"
                  type="text"
                  value={ageFeeNote}
                  onChange={(e) => setAgeFeeNote(e.target.value)}
                  className={`min-w-[7rem] flex-1 ${PHILIFE_FB_INPUT_CLASS}`}
                  placeholder="연령·가입비 (선택)"
                  autoComplete="off"
                />
              </div>

              <div className={WRITE_INFO_PANEL_CLASS}>
                Philife 「모임」 피드에 올라가고, 모임 채팅은 커뮤니티 메신저 오픈그룹으로 연결됩니다. 다른 회원은 모임
                카드·초대 링크로 들어온 뒤, 비밀·숨김 비밀은 채팅 입장 시 비밀번호를 입력합니다.
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-[13px] font-normal text-sam-muted">카테고리</label>
                {writeTopicOptionsLoad === "loading" ? (
                  <p className="mt-2 text-[14px] font-normal text-sam-muted">주제 목록을 불러오는 중…</p>
                ) : writeTopicOptions.length === 0 ? (
                  <div className={`mt-2 ${WRITE_WARNING_PANEL_CLASS} text-[14px] text-sam-fg`}>
                    <p>
                      쓸 수 있는 <strong>일반 주제</strong>가 없습니다.{" "}
                      <Link
                        href={philifeAdminPaths.topics}
                        className={WRITE_WARNING_LINK_CLASS}
                      >
                        피드 주제 관리
                      </Link>
                      에서 동네 섹션에 맞는 주제를 추가·노출하거나,{" "}
                      <Link
                        href={philifeAdminPaths.sections}
                        className={WRITE_WARNING_LINK_CLASS}
                      >
                        피드 섹션
                      </Link>
                      을 확인하세요.
                    </p>
                    {writeTopicOptionsFetchErr ? (
                      <p className="mt-2 font-mono text-xs text-sam-danger">
                        API: {writeTopicOptionsFetchErr}
                        <span className="ml-1 text-sam-muted">
                          (이 메시지가 뜨면 .env·Supabase 연결·서버 오류를 확인하세요.)
                        </span>
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className={`mt-2 ${WRITE_SELECT_CLASS}`}
                      aria-label="일반 글 — 게시판 주제(community_topics slug)"
                    >
                      {writeTopicOptions.map((o) => (
                        <option key={o.slug} value={o.slug} title={o.slug}>
                          {o.name} ({o.slug})
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </div>
              <div>
                <label className="text-[13px] font-normal text-sam-muted">제목</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className={`mt-2 w-full min-h-[2.75rem] ${PHILIFE_FB_INPUT_CLASS}`}
                  placeholder="제목을 입력하세요…"
                />
              </div>
              <div>
                <label className="text-[13px] font-normal text-sam-muted">내용</label>
                <textarea
                  ref={contentTextareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={(e) => void onContentPaste(e)}
                  rows={8}
                  className={`mt-2 ${PHILIFE_FB_TEXTAREA_CLASS}`}
                  placeholder="내용을 입력하세요…"
                />
              </div>
              <div>
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
                  className={`px-4 ${COMMUNITY_BUTTON_SECONDARY_CLASS}`}
                >
                  {uploading ? "업로드 중…" : "사진 추가"}
                </button>
                {imageUrls.length > 0 ? (
                  <ul className="mt-[4pt] flex flex-wrap gap-[4pt]">
                    {imageUrls.map((url, i) => (
                      <li key={url} className={`h-16 w-16 ${WRITE_THUMB_FRAME_CLASS}`}>
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-sam-sm bg-sam-ink/70 text-[11px] font-medium text-white backdrop-blur-[1px]"
                          onClick={() => setImageUrls((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </>
          )}

          {category !== "meetup" && writeTopicOptions.length > 0 ? (
            <div className={WRITE_WARNING_PANEL_CLASS}>
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
                  <span className="block text-[14px] font-semibold text-sam-fg">피드 상단 광고로 노출하기 (선택)</span>
                </span>
              </label>
              {promoteAdEnabled ? (
                <div className="mt-3 space-y-3 border-t border-sam-warning/20 pt-3">
                  <div className="flex items-center justify-between rounded-sam-md border border-sam-border bg-sam-surface px-3 py-2 text-[14px]">
                    <span className="text-sam-primary">내 포인트</span>
                    <span className="font-bold text-sam-fg">{pointBalance.toLocaleString()}P</span>
                  </div>
                  {adProductsLoading ? (
                    <p className="py-2 text-center text-[15px] text-sam-muted">광고 상품 불러오는 중…</p>
                  ) : adProducts.length === 0 ? (
                    <p className="text-[13px] text-sam-muted">현재 신청 가능한 광고 상품이 없습니다.</p>
                  ) : (
                    <div className="space-y-2" role="radiogroup" aria-label="광고 상품">
                      {adProducts.map((p) => {
                        const isSelected = selectedAdProduct?.id === p.id;
                        const lacking = Math.max(0, p.pointCost - pointBalance);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedAdProduct(p)}
                            className={`w-full rounded-sam-md border px-3 py-2.5 text-left transition-colors ${
                              isSelected
                                ? "border-sam-warning/40 bg-sam-warning-soft"
                                : "border-sam-border bg-sam-surface hover:bg-sam-surface-muted"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[14px] font-semibold text-sam-fg">{p.name}</p>
                                <p className="mt-0.5 text-[12px] text-sam-muted">
                                  {AD_TYPE_LABELS[p.adType]} · {p.durationDays}일
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-[14px] font-bold text-sam-fg">{p.pointCost.toLocaleString()}P</p>
                                {lacking > 0 ? (
                                  <p className="text-[12px] text-sam-danger">{lacking.toLocaleString()}P 부족</p>
                                ) : (
                                  <p className="text-[12px] text-sam-success">사용 가능</p>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {selectedAdProduct ? (
                    <div className="space-y-2">
                      <p className="text-[13px] font-semibold text-sam-muted">결제 방식</p>
                      <div className="flex gap-2">
                        {(["points", "bank_transfer"] as AdPaymentMethod[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setAdPaymentMethod(m)}
                            className={`flex-1 rounded-sam-md border py-2 text-[14px] font-semibold ${
                              adPaymentMethod === m
                                ? "border-sam-primary-border bg-sam-primary-soft text-sam-primary"
                                : "border-sam-border bg-sam-surface text-sam-fg"
                            }`}
                          >
                            {m === "points" ? "포인트" : "계좌 입금"}
                          </button>
                        ))}
                      </div>
                      {adPaymentMethod === "points" && adShortfall > 0 ? (
                        <p className="text-[13px] text-sam-danger">
                          포인트가 {adShortfall.toLocaleString()}P 부족합니다. 충전하거나 계좌 입금을 선택해 주세요.
                        </p>
                      ) : null}
                      {adPaymentMethod === "bank_transfer" ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={adDepositorName}
                            onChange={(e) => setAdDepositorName(e.target.value)}
                            placeholder="입금자명 (필수)"
                            className={`w-full min-h-[2.75rem] ${PHILIFE_FB_INPUT_CLASS}`}
                          />
                          <input
                            type="text"
                            value={adMemo}
                            onChange={(e) => setAdMemo(e.target.value)}
                            placeholder="메모 (선택)"
                            className={`w-full min-h-[2.75rem] ${PHILIFE_FB_INPUT_CLASS}`}
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div ref={submitErrorAnchorRef} className="min-h-0 scroll-mt-24">
            {err ? (
              <p
                className="rounded-sam-md border border-sam-danger/20 bg-sam-danger-soft px-3 py-2 text-[14px] text-sam-danger"
                role="alert"
              >
                {err}
              </p>
            ) : null}
          </div>
          {suppressWriteScreenTier1 && onSheetClose ? (
            <div className="flex w-full min-w-0 flex-row flex-nowrap items-stretch gap-2 sm:gap-3">
              <button
                type="button"
                onClick={handleSheetCancel}
                disabled={busy}
                className={`relative z-10 min-h-[2.75rem] min-w-0 flex-1 ${COMMUNITY_BUTTON_SECONDARY_CLASS}`}
              >
                취소하기
              </button>
              <button
                type="submit"
                disabled={
                  busy ||
                  (category !== "meetup" &&
                    (writeTopicOptionsLoad !== "ready" || writeTopicOptions.length === 0))
                }
                className={`relative z-10 min-h-[2.75rem] min-w-0 flex-1 ${COMMUNITY_BUTTON_PRIMARY_CLASS}`}
              >
                {busy ? "등록 중…" : "등록하기"}
              </button>
            </div>
          ) : (
            <button
              type="submit"
              disabled={
                busy ||
                (category !== "meetup" && (writeTopicOptionsLoad !== "ready" || writeTopicOptions.length === 0))
              }
              className={`relative z-10 w-full ${COMMUNITY_BUTTON_PRIMARY_CLASS}`}
            >
              {busy ? "등록 중…" : "등록하기"}
            </button>
          )}
      </form>
    </div>
  );
}
