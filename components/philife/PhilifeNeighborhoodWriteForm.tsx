"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useRegion } from "@/contexts/RegionContext";
import { WriteScreenTier1Sync } from "@/components/write/WriteScreenTier1Sync";
import {
  philifeNeighborhoodPostsUrl,
  philifeUploadImageUrl,
} from "@domain/philife/api";
import { fetchPhilifeNeighborhoodTopicOptions } from "@/lib/philife/fetch-neighborhood-topic-options-client";
import { philifeAppPaths } from "@domain/philife/paths";
import {
  neighborhoodLocationKeyFromRegion,
  neighborhoodLocationMetaFromRegion,
  neighborhoodLocationLabelFromRegion,
} from "@/lib/neighborhood/location-key";
import { PHILIFE_PAGE_ROOT_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import type { AdPaymentMethod, AdProduct } from "@/lib/ads/types";
import { AD_TYPE_LABELS } from "@/lib/ads/types";
import { getUserPointBalance } from "@/lib/ads/mock-ad-data";
import { getCurrentUser } from "@/lib/auth/get-current-user";

/** 모임 생성 섹션 제목 타이포 통일 */
const MEETUP_SECTION_LABEL_BASE =
  "px-0 sam-text-body-secondary font-medium leading-snug tracking-normal text-sam-fg";
/** 세로 스택 블록용(왼쪽 열 정렬) */
const MEETUP_SECTION_LABEL_CLASS = `${MEETUP_SECTION_LABEL_BASE} block w-full max-w-full`;

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
}

type WriteTopicOption = { slug: string; name: string };

/** 모임 오픈그룹: 공개(자유/비번) · 숨김(자유/비번) */
type PhilifeMeetAccessMode = "free_public" | "password_public" | "free_hidden" | "password_hidden";

/** 동네(필라이프) 일반 글·모임 생성 — `/philife/write` 등에서 사용 */
export function PhilifeNeighborhoodWriteForm({
  initialCategory,
}: PhilifeNeighborhoodWriteFormProps) {
  const router = useRouter();
  const { currentRegion } = useRegion();
  const fileRef = useRef<HTMLInputElement>(null);
  const [writeTopicOptions, setWriteTopicOptions] = useState<WriteTopicOption[]>([]);
  const [category, setCategory] = useState<string>(() => (initialCategory === "meetup" ? "meetup" : ""));
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
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
  /** setState 전에 연속 제출이 들어오는 경우(더블 탭 등) 동기적으로 막음 */
  const submitLockRef = useRef(false);
  const me = getCurrentUser();
  const pointBalance = me?.id ? getUserPointBalance(me.id) : 0;

  useEffect(() => {
    if (!err) return;
    submitErrorAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [err]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const j = await fetchPhilifeNeighborhoodTopicOptions();
        if (cancelled) return;
        if (!j?.ok || !Array.isArray(j.writeTopics)) {
          setWriteTopicOptions([]);
          setCategory((prev) => (prev === "meetup" || initialCategory === "meetup" ? "meetup" : ""));
          return;
        }
        if (j.writeTopics.length === 0) {
          setWriteTopicOptions([]);
          setCategory((prev) => (prev === "meetup" || initialCategory === "meetup" ? "meetup" : ""));
          return;
        }
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
          setWriteTopicOptions([]);
          setCategory((prev) => (prev === "meetup" || initialCategory === "meetup" ? "meetup" : ""));
        }
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

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    setErr("");
    try {
      const next = category === "meetup" ? [] : [...imageUrls];
      for (const f of Array.from(files)) {
        if (next.length >= (category === "meetup" ? 1 : 10)) break;
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch(philifeUploadImageUrl(), { method: "POST", body: fd });
        const j = (await res.json()) as { ok?: boolean; url?: string; error?: string };
        if (j.ok && j.url) next.push(j.url);
        else setErr(j.error ?? "이미지 업로드 실패");
      }
      setImageUrls(next);
    } finally {
      setUploading(false);
      e.target.value = "";
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
        images: category === "meetup" ? [] : imageUrls,
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

  const tier1Title = category === "meetup" ? title.trim() || "모임 만들기" : "커뮤니티 글쓰기";
  const tier1Subtitle =
    category === "meetup"
      ? "새 모임을 만들고 참여자를 모집할 수 있어요."
      : "일상, 정보, 질문 글을 자유롭게 작성할 수 있어요.";

  return (
    <div className={`${PHILIFE_PAGE_ROOT_CLASS} pt-2 ${APP_MAIN_GUTTER_X_CLASS}`}>
      <WriteScreenTier1Sync
        backHref={philifeAppPaths.home}
        title={tier1Title}
        subtitle={tier1Subtitle}
      />

      {category !== "meetup" ? (
        <div className="mb-2">
          <Link
            href={philifeAppPaths.writeMeeting}
            className="flex w-full items-center justify-center rounded-ui-rect border border-sam-border bg-sam-surface py-2.5 sam-text-body-secondary font-medium text-sam-muted transition-colors hover:bg-sam-app hover:text-sam-fg"
          >
            모임 만들기
          </Link>
        </div>
      ) : (
        <div className="mb-3">
          <Link
            href={philifeAppPaths.write}
            className="inline-flex items-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app"
          >
            ← 일반 글쓰기로
          </Link>
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="space-y-[4pt] rounded-ui-rect border border-sam-border bg-sam-surface p-4"
      >
        {category === "meetup" ? (
            <>
              <div>
                <label className={MEETUP_SECTION_LABEL_CLASS}>모임 이름</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-[4pt] w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body"
                  placeholder="예: 필리핀 ooooo 방"
                  autoComplete="off"
                />
              </div>

              <div>
                <textarea
                  value={meetIntro}
                  onChange={(e) => setMeetIntro(e.target.value)}
                  rows={4}
                  className="mt-[4pt] w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body placeholder:text-sam-meta"
                  placeholder="이 모임에 대한 간단한 소개를 작성해 주세요."
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
                  className="mt-[4pt] rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary font-medium text-sam-fg"
                >
                  {uploading ? "업로드 중…" : imageUrls[0] ? "대표 이미지 변경" : "대표 이미지 추가"}
                </button>
                {imageUrls[0] ? (
                  <div className="mt-[4pt] relative h-36 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                    <img src={imageUrls[0]} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      className="absolute right-2 top-2 rounded-ui-rect bg-black/50 px-2 py-1 sam-text-xxs text-white"
                      onClick={() => setImageUrls([])}
                    >
                      삭제
                    </button>
                  </div>
                ) : (
                  <p className="mt-[4pt] sam-text-helper text-sam-muted">모임 목록과 상세에 노출될 대표 이미지를 선택할 수 있습니다.</p>
                )}
              </div>

              <div>
                <label className={MEETUP_SECTION_LABEL_CLASS}>모임 지역</label>
                <input
                  value={meetRegionText}
                  onChange={(e) => setMeetRegionText(e.target.value)}
                  className="mt-[4pt] w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body"
                  placeholder="예: 마카티, BGC, 세부"
                />
              </div>

              <div>
                <label className={MEETUP_SECTION_LABEL_CLASS}>모임 채팅 유형</label>
                <p className="mt-[4pt] sam-text-helper text-sam-muted">
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
                        className={`rounded-ui-rect border px-3 py-3 text-left transition ${
                          on
                            ? "border-emerald-600 bg-emerald-50 ring-1 ring-emerald-600/30"
                            : "border-sam-border bg-sam-app hover:bg-sam-surface-muted"
                        }`}
                      >
                        <p className="sam-text-body-secondary font-semibold text-sam-fg">{opt.title}</p>
                        <p className="mt-1 sam-text-helper leading-snug text-sam-muted">{opt.desc}</p>
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
                      className="mt-[4pt] w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2.5 sam-text-body"
                      placeholder="4자 이상 입력"
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
                  className="w-[4.25rem] shrink-0 rounded-ui-rect border border-sam-border px-2 py-1.5 text-center sam-text-body tabular-nums"
                />
                <label className={`${MEETUP_SECTION_LABEL_BASE} shrink-0 whitespace-nowrap`} htmlFor="meet-age-fee">
                  연령 / 가입비 <span className="font-normal text-sam-muted">(선택)</span>
                </label>
                <input
                  id="meet-age-fee"
                  type="text"
                  value={ageFeeNote}
                  onChange={(e) => setAgeFeeNote(e.target.value)}
                  className="min-w-[7rem] flex-1 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 sam-text-body placeholder:text-sam-meta"
                  placeholder="예: 만 20세 이상, 월 500페소"
                  autoComplete="off"
                />
              </div>

              <div className="rounded-ui-rect border border-sam-border-soft bg-sam-app/60 px-4 py-3 sam-text-body-secondary text-sam-muted">
                Philife 「모임」 피드에 올라가고, 모임 채팅은 커뮤니티 메신저 오픈그룹으로 연결됩니다. 다른 회원은 모임
                카드·초대 링크로 들어온 뒤, 비밀·숨김 비밀은 채팅 입장 시 비밀번호를 입력합니다.
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="sam-text-body-secondary font-medium text-sam-fg">카테고리</label>
                {writeTopicOptions.length === 0 ? (
                  <p className="mt-[4pt] rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-body-secondary text-amber-900">
                    등록된 일반 주제가 없습니다. 어드민 「피드 섹션 관리」에서 동네 피드 섹션을 확인한 뒤, 「피드 주제
                    관리」에서 같은 섹션으로 일반 주제를 추가해 주세요.
                  </p>
                ) : (
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-[4pt] w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body"
                  >
                    {writeTopicOptions.map((o) => (
                      <option key={o.slug} value={o.slug}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="sam-text-body-secondary font-medium text-sam-fg">제목</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-[4pt] w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                  placeholder="제목을 입력하세요"
                />
              </div>
              <div>
                <label className="sam-text-body-secondary font-medium text-sam-fg">내용</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  className="mt-[4pt] w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                  placeholder="동네 이웃과 나누고 싶은 이야기를 적어 주세요"
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
                  className="rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body-secondary font-medium text-sam-fg"
                >
                  {uploading ? "업로드 중…" : "사진 추가"}
                </button>
                {imageUrls.length > 0 ? (
                  <ul className="mt-[4pt] flex flex-wrap gap-[4pt]">
                    {imageUrls.map((url, i) => (
                      <li key={url} className="relative h-16 w-16 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          className="absolute right-0 top-0 rounded-bl-[4px] bg-black/50 px-1 sam-text-xxs text-white"
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

          {category !== "meetup" ? (
            <div className="rounded-ui-rect border border-amber-100 bg-amber-50/50 p-3">
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
                  className="mt-1 h-4 w-4 shrink-0 rounded border-amber-300 text-amber-600"
                />
                <span className="min-w-0">
                  <span className="block sam-text-body font-semibold text-sam-fg">피드 상단 광고로 노출하기 (선택)</span>
                  <span className="mt-0.5 block sam-text-helper leading-snug text-sam-muted">
                    대부분의 글은 일반 등록만으로도 피드에 올라가요. 더 많은 이웃에게 보이게 하려면 아래에서 상품을 고른 뒤 등록하면 됩니다.
                  </span>
                </span>
              </label>
              {promoteAdEnabled ? (
                <div className="mt-3 space-y-3 border-t border-amber-100 pt-3">
                  <div className="flex items-center justify-between rounded-ui-rect bg-sam-surface/80 px-3 py-2 sam-text-body-secondary">
                    <span className="text-sky-800">내 포인트</span>
                    <span className="font-bold text-sky-900">{pointBalance.toLocaleString()}P</span>
                  </div>
                  {adProductsLoading ? (
                    <p className="py-2 text-center sam-text-body-secondary text-sam-muted">광고 상품 불러오는 중…</p>
                  ) : adProducts.length === 0 ? (
                    <p className="sam-text-helper text-sam-muted">현재 신청 가능한 광고 상품이 없습니다.</p>
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
                            className={`w-full rounded-ui-rect border px-3 py-2.5 text-left transition-colors ${
                              isSelected
                                ? "border-amber-400 bg-amber-50"
                                : "border-sam-border bg-sam-surface hover:bg-sam-app"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="sam-text-body-secondary font-semibold text-sam-fg">{p.name}</p>
                                <p className="mt-0.5 sam-text-xxs text-sam-muted">
                                  {AD_TYPE_LABELS[p.adType]} · {p.durationDays}일
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="sam-text-body font-bold text-sam-fg">{p.pointCost.toLocaleString()}P</p>
                                {lacking > 0 ? (
                                  <p className="sam-text-xxs text-red-500">{lacking.toLocaleString()}P 부족</p>
                                ) : (
                                  <p className="sam-text-xxs text-emerald-600">사용 가능</p>
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
                      <p className="sam-text-helper font-semibold text-sam-fg">결제 방식</p>
                      <div className="flex gap-2">
                        {(["points", "bank_transfer"] as AdPaymentMethod[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setAdPaymentMethod(m)}
                            className={`flex-1 rounded-ui-rect border py-2 sam-text-helper font-medium ${
                              adPaymentMethod === m
                                ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                                : "border-sam-border bg-sam-surface text-sam-fg"
                            }`}
                          >
                            {m === "points" ? "포인트" : "계좌 입금"}
                          </button>
                        ))}
                      </div>
                      {adPaymentMethod === "points" && adShortfall > 0 ? (
                        <p className="sam-text-helper text-red-600">
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
                            className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
                          />
                          <input
                            type="text"
                            value={adMemo}
                            onChange={(e) => setAdMemo(e.target.value)}
                            placeholder="메모 (선택)"
                            className="w-full rounded-ui-rect border border-sam-border px-3 py-2 sam-text-body"
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
                className="rounded-ui-rect border border-red-100 bg-red-50 px-3 py-2 sam-text-body text-red-700"
                role="alert"
              >
                {err}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={busy}
            className={`relative z-10 w-full rounded-ui-rect py-3.5 sam-text-body-lg font-semibold text-white disabled:opacity-50 ${
              category === "meetup" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-sam-ink hover:bg-sam-surface-dark"
            }`}
          >
            {busy ? "등록 중…" : "등록하기"}
          </button>
      </form>
    </div>
  );
}
