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
import { APP_MAIN_GUTTER_X_CLASS } from "@/lib/ui/app-content-layout";
import type { AdPaymentMethod, AdProduct } from "@/lib/ads/types";
import { AD_TYPE_LABELS } from "@/lib/ads/types";
import { getUserPointBalance } from "@/lib/ads/mock-ad-data";
import { getCurrentUser } from "@/lib/auth/get-current-user";

type MeetEntryPolicy = "open" | "password";
/** 모임 생성 섹션 제목 타이포 통일 */
const MEETUP_SECTION_LABEL_BASE =
  "px-0 text-[13px] font-medium leading-snug tracking-normal text-gray-800";
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
  const [meetEntryPolicy, setMeetEntryPolicy] = useState<MeetEntryPolicy>("open");
  const [meetPassword, setMeetPassword] = useState("");
  const [allowWaitlist, setAllowWaitlist] = useState(false);
  const [allowMemberInvite, setAllowMemberInvite] = useState(false);
  const [meetAllowFeed, setMeetAllowFeed] = useState(true);
  const [meetAllowAlbumUpload, setMeetAllowAlbumUpload] = useState(true);

  /** 서버 기본 모임 피드 주제 slug — UI 비노출 */
  const MEETUP_TOPIC_SLUG = "meetup";
  const [meetIntro, setMeetIntro] = useState("");
  const [ageFeeNote, setAgeFeeNote] = useState("");

  const [promoteAdEnabled, setPromoteAdEnabled] = useState(false);
  const [adProducts, setAdProducts] = useState<AdProduct[]>([]);
  const [adProductsLoading, setAdProductsLoading] = useState(false);
  const [selectedAdProduct, setSelectedAdProduct] = useState<AdProduct | null>(null);
  const [adPaymentMethod, setAdPaymentMethod] = useState<AdPaymentMethod>("points");
  const [adDepositorName, setAdDepositorName] = useState("");
  const [adMemo, setAdMemo] = useState("");

  const submitErrorAnchorRef = useRef<HTMLDivElement>(null);
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
    if (category === "meetup" && meetEntryPolicy !== "password") {
      setMeetPassword("");
    }
  }, [category, meetEntryPolicy]);

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
      const next = [...imageUrls];
      for (const f of Array.from(files)) {
        if (next.length >= 10) break;
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
      if (meetEntryPolicy === "password") {
        const p = meetPassword.trim();
        if (p.length < 4 || p.length > 128) {
          setErr("입장 비밀번호는 4~128자로 입력해 주세요.");
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
        /** 장기형 고정 — 일시·장소 UI 없음(API placeholder) */
        payload.meeting = {
          tenure_type: "long",
          location_text: "",
          meeting_date: null,
          max_members: maxMembers,
          description: shortDesc,
          entry_policy: meetEntryPolicy,
          ...(meetEntryPolicy === "password" ? { meeting_password: meetPassword.trim() } : {}),
          allow_waitlist: allowWaitlist,
          allow_member_invite: allowMemberInvite,
          welcome_message: null,
          allow_feed: meetAllowFeed,
          allow_album_upload: meetAllowAlbumUpload,
        };
      }
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
        setErr("서버 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (!res.ok || !j.ok || !j.id) {
        setErr(j.error ?? "등록에 실패했습니다.");
        return;
      }
      /** 본문 등록 직후 상세로 이동 — 광고 API는 체감 대기 없이 백그라운드 (실패해도 글은 이미 생성됨) */
      router.replace(philifeAppPaths.post(j.id));
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
    <div className={`min-h-screen bg-[#f0f2f5] pb-28 pt-2 ${APP_MAIN_GUTTER_X_CLASS}`}>
      <WriteScreenTier1Sync
        backHref={philifeAppPaths.home}
        title={tier1Title}
        subtitle={tier1Subtitle}
      />

      {category !== "meetup" ? (
        <div className="mb-2">
          <Link
            href={philifeAppPaths.writeMeeting}
            className="flex w-full items-center justify-center rounded-ui-rect border border-gray-200/90 bg-white py-2.5 text-[13px] font-medium text-gray-600 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-800"
          >
            모임 만들기
          </Link>
        </div>
      ) : (
        <div className="mb-3">
          <Link
            href={philifeAppPaths.write}
            className="inline-flex items-center rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[13px] font-medium text-gray-800 hover:bg-gray-50"
          >
            ← 일반 글쓰기로
          </Link>
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="space-y-[4pt] rounded-ui-rect border border-gray-100 bg-white p-4 shadow-sm"
      >
        {category === "meetup" ? (
            <>
              <div>
                <label className={MEETUP_SECTION_LABEL_CLASS}>모임 이름</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-[4pt] w-full rounded-ui-rect border border-gray-200 px-3 py-2.5 text-[14px]"
                  placeholder="예: 필리핀 ooooo 방"
                  autoComplete="off"
                />
              </div>

              <div>
                <textarea
                  value={meetIntro}
                  onChange={(e) => setMeetIntro(e.target.value)}
                  rows={4}
                  className="mt-[4pt] w-full rounded-ui-rect border border-gray-200 px-3 py-2.5 text-[14px] placeholder:text-gray-400"
                  placeholder="이 모임에 대한 간단한 소개를 작성해 주세요."
                />
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
                  className="w-[4.25rem] shrink-0 rounded-ui-rect border border-gray-200 px-2 py-1.5 text-center text-[14px] tabular-nums"
                />
                <label className={`${MEETUP_SECTION_LABEL_BASE} shrink-0 whitespace-nowrap`} htmlFor="meet-age-fee">
                  연령 / 가입비 <span className="font-normal text-gray-500">(선택)</span>
                </label>
                <input
                  id="meet-age-fee"
                  type="text"
                  value={ageFeeNote}
                  onChange={(e) => setAgeFeeNote(e.target.value)}
                  className="min-w-[7rem] flex-1 rounded-ui-rect border border-gray-200 bg-white px-2.5 py-1.5 text-[14px] placeholder:text-gray-400"
                  placeholder="예: 만 20세 이상, 월 500페소"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-[4pt]" role="group" aria-labelledby="meetup-entry-heading">
                <p id="meetup-entry-heading" className={MEETUP_SECTION_LABEL_CLASS}>
                  참여 설정
                </p>
                <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-[4pt] rounded-ui-rect border border-gray-100 bg-gray-50/50 p-3">
                  {(
                    [
                      { policy: "open" as const, label: "즉시 참여" },
                      { policy: "password" as const, label: "비밀번호 참여" },
                    ] as const
                  ).map(({ policy, label }) => (
                    <label
                      key={policy}
                      className="flex min-h-[44px] cursor-pointer items-center gap-[4pt] rounded-ui-rect px-2 py-1.5 text-[13px] font-normal text-gray-800 hover:bg-white/80"
                    >
                      <input
                        type="radio"
                        name="meet_entry"
                        checked={meetEntryPolicy === policy}
                        onChange={() => {
                          setMeetEntryPolicy(policy);
                          if (policy !== "password") setMeetPassword("");
                        }}
                        className="h-4 w-4 shrink-0 border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      {label}
                    </label>
                  ))}
                </div>
                {meetEntryPolicy === "password" ? (
                  <div className="rounded-ui-rect border border-amber-100 bg-amber-50/80 p-3">
                    <label className={MEETUP_SECTION_LABEL_CLASS}>입장 비밀번호</label>
                    <input
                      type="password"
                      autoComplete="new-password"
                      value={meetPassword}
                      onChange={(e) => setMeetPassword(e.target.value)}
                      className="mt-[4pt] w-full rounded-ui-rect border border-amber-200 px-3 py-2 text-[14px]"
                      placeholder="4자 이상"
                    />
                  </div>
                ) : null}
              </div>

              <div className="space-y-[4pt] rounded-ui-rect border border-gray-100 bg-gray-50/80 p-3 text-[13px]">
                <p className={MEETUP_SECTION_LABEL_CLASS}>추가 옵션</p>
                  <label className="flex cursor-pointer items-center gap-[4pt]">
                    <input
                      type="checkbox"
                      checked={allowWaitlist}
                      onChange={(e) => setAllowWaitlist(e.target.checked)}
                      className="h-4 w-4 rounded-ui-rect border-gray-300 text-emerald-600"
                    />
                    정원 초과 시 대기 허용
                  </label>
                  <label className="flex cursor-pointer items-center gap-[4pt]">
                    <input
                      type="checkbox"
                      checked={allowMemberInvite}
                      onChange={(e) => setAllowMemberInvite(e.target.checked)}
                      className="h-4 w-4 rounded-ui-rect border-gray-300 text-emerald-600"
                    />
                    멤버 초대 허용
                  </label>
                  <label className="flex cursor-pointer items-center gap-[4pt]">
                    <input
                      type="checkbox"
                      checked={meetAllowFeed}
                      onChange={(e) => setMeetAllowFeed(e.target.checked)}
                      className="h-4 w-4 rounded-ui-rect border-gray-300 text-emerald-600"
                    />
                    피드 글 허용
                  </label>
                  <label className="flex cursor-pointer items-center gap-[4pt]">
                    <input
                      type="checkbox"
                      checked={meetAllowAlbumUpload}
                      onChange={(e) => setMeetAllowAlbumUpload(e.target.checked)}
                      className="h-4 w-4 rounded-ui-rect border-gray-300 text-emerald-600"
                    />
                    앨범 업로드 허용
                  </label>
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="text-[13px] font-medium text-gray-700">카테고리</label>
                {writeTopicOptions.length === 0 ? (
                  <p className="mt-[4pt] rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                    등록된 일반 주제가 없습니다. 어드민 「피드 섹션 관리」에서 동네 피드 섹션을 확인한 뒤, 「피드 주제
                    관리」에서 같은 섹션으로 일반 주제를 추가해 주세요.
                  </p>
                ) : (
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-[4pt] w-full rounded-ui-rect border border-gray-200 bg-white px-3 py-2 text-[14px]"
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
                <label className="text-[13px] font-medium text-gray-700">제목</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-[4pt] w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-[14px]"
                  placeholder="제목을 입력하세요"
                />
              </div>
              <div>
                <label className="text-[13px] font-medium text-gray-700">내용</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  className="mt-[4pt] w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-[14px]"
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
                  className="rounded-ui-rect border border-gray-200 bg-gray-50 px-3 py-2 text-[13px] font-medium text-gray-800"
                >
                  {uploading ? "업로드 중…" : "사진 추가"}
                </button>
                {imageUrls.length > 0 ? (
                  <ul className="mt-[4pt] flex flex-wrap gap-[4pt]">
                    {imageUrls.map((url, i) => (
                      <li key={url} className="relative h-16 w-16 overflow-hidden rounded-ui-rect bg-gray-100">
                        <img src={url} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          className="absolute right-0 top-0 rounded-bl-[4px] bg-black/50 px-1 text-[11px] text-white"
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
                  <span className="block text-[14px] font-semibold text-gray-900">피드 상단 광고로 노출하기 (선택)</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-gray-600">
                    대부분의 글은 일반 등록만으로도 피드에 올라가요. 더 많은 이웃에게 보이게 하려면 아래에서 상품을 고른 뒤 등록하면 됩니다.
                  </span>
                </span>
              </label>
              {promoteAdEnabled ? (
                <div className="mt-3 space-y-3 border-t border-amber-100 pt-3">
                  <div className="flex items-center justify-between rounded-ui-rect bg-white/80 px-3 py-2 text-[13px]">
                    <span className="text-sky-800">내 포인트</span>
                    <span className="font-bold text-sky-900">{pointBalance.toLocaleString()}P</span>
                  </div>
                  {adProductsLoading ? (
                    <p className="py-2 text-center text-[13px] text-gray-500">광고 상품 불러오는 중…</p>
                  ) : adProducts.length === 0 ? (
                    <p className="text-[12px] text-gray-500">현재 신청 가능한 광고 상품이 없습니다.</p>
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
                                : "border-gray-200 bg-white hover:bg-gray-50"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-gray-900">{p.name}</p>
                                <p className="mt-0.5 text-[11px] text-gray-500">
                                  {AD_TYPE_LABELS[p.adType]} · {p.durationDays}일
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="text-[14px] font-bold text-gray-900">{p.pointCost.toLocaleString()}P</p>
                                {lacking > 0 ? (
                                  <p className="text-[10px] text-red-500">{lacking.toLocaleString()}P 부족</p>
                                ) : (
                                  <p className="text-[10px] text-emerald-600">사용 가능</p>
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
                      <p className="text-[12px] font-semibold text-gray-800">결제 방식</p>
                      <div className="flex gap-2">
                        {(["points", "bank_transfer"] as AdPaymentMethod[]).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setAdPaymentMethod(m)}
                            className={`flex-1 rounded-ui-rect border py-2 text-[12px] font-medium ${
                              adPaymentMethod === m
                                ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                                : "border-gray-200 bg-white text-gray-700"
                            }`}
                          >
                            {m === "points" ? "포인트" : "계좌 입금"}
                          </button>
                        ))}
                      </div>
                      {adPaymentMethod === "points" && adShortfall > 0 ? (
                        <p className="text-[12px] text-red-600">
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
                            className="w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-[14px]"
                          />
                          <input
                            type="text"
                            value={adMemo}
                            onChange={(e) => setAdMemo(e.target.value)}
                            placeholder="메모 (선택)"
                            className="w-full rounded-ui-rect border border-gray-200 px-3 py-2 text-[14px]"
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
                className="rounded-ui-rect border border-red-100 bg-red-50 px-3 py-2 text-[14px] text-red-700"
                role="alert"
              >
                {err}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={busy}
            className={`relative z-10 w-full rounded-ui-rect py-3.5 text-[16px] font-semibold text-white shadow-sm disabled:opacity-50 ${
              category === "meetup" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-900 hover:bg-gray-800"
            }`}
          >
            {busy ? "등록 중…" : "등록하기"}
          </button>
      </form>
    </div>
  );
}
