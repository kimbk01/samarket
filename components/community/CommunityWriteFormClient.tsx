"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { useRegion } from "@/contexts/RegionContext";
import type { CommunityTopicDTO } from "@/lib/community-feed/types";
import { normalizeSectionSlug } from "@/lib/community-feed/constants";
import { philifePostsRootUrl, philifeUploadImageUrl } from "@domain/philife/api";
import { philifeAppPaths } from "@domain/philife/paths";
import {
  COMMUNITY_BUTTON_PRIMARY_CLASS,
  PHILIFE_FB_INPUT_CLASS,
  PHILIFE_FB_TEXTAREA_CLASS,
} from "@/lib/philife/philife-flat-ui-classes";

export function CommunityWriteFormClient({
  sectionSlug,
  topics,
}: {
  sectionSlug: string;
  topics: CommunityTopicDTO[];
}) {
  const router = useRouter();
  const { currentRegionName } = useRegion();
  const sec = normalizeSectionSlug(sectionSlug);

  const writableTopics = topics.filter((t) => !t.is_feed_sort);
  const [topicSlug, setTopicSlug] = useState(writableTopics[0]?.slug ?? "");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isQuestion, setIsQuestion] = useState(false);
  const [meetupPlace, setMeetupPlace] = useState("");
  const [meetupDate, setMeetupDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedTopic = useMemo(
    () => writableTopics.find((t) => t.slug === topicSlug) ?? null,
    [writableTopics, topicSlug]
  );

  useEffect(() => {
    setMeetupPlace((prev) => (prev === "" ? prev : ""));
    setMeetupDate((prev) => (prev === "" ? prev : ""));
  }, [topicSlug]);

  useEffect(() => {
    if (selectedTopic && !selectedTopic.allow_question) {
      setIsQuestion((prev) => (prev ? false : prev));
    }
  }, [selectedTopic]);

  const onPickFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    setErr((prev) => (prev === "" ? prev : ""));
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

  const removeImage = (idx: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== idx));
  };

  const skinHint =
    selectedTopic?.feed_list_skin === "location_pin"
      ? "장소·맛집형: 아래 장소를 입력하면 목록에 핀과 함께 강조됩니다. (주제에서 ‘모임’ 허용 필요)"
      : selectedTopic?.feed_list_skin === "hashtags_below"
        ? "본문에 #태그 를 넣으면 피드 목록에 태그 미리보기 줄이 표시됩니다."
        : selectedTopic?.feed_list_skin === "text_primary"
          ? "이 주제는 목록에서 썸네일 없이 글 위주로 보입니다."
          : null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr((prev) => (prev === "" ? prev : ""));
    if (!topicSlug) {
      setErr("주제를 선택하세요.");
      return;
    }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = {
        sectionSlug: sec,
        topicSlug,
        title,
        content,
        is_question: selectedTopic?.allow_question ? isQuestion : false,
        region_label: currentRegionName ?? "Malate",
        imageUrls,
      };
      if (selectedTopic?.allow_meetup) {
        if (meetupPlace.trim()) payload.meetup_place = meetupPlace.trim();
        if (meetupDate.trim()) payload.meetup_date = meetupDate.trim();
      }

      const res = await fetch(philifePostsRootUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok?: boolean; id?: string; error?: string };
      if (data.ok && data.id) {
        router.push(`/philife/${data.id}`);
        return;
      }
      setErr(data.error ?? "등록에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-sam-app pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-sam-border bg-sam-surface px-4 py-2">
        <AppBackButton backHref={philifeAppPaths.home} ariaLabel="닫기" />
        <h1 className="sam-app-header-title">커뮤니티 글쓰기</h1>
      </header>

      <form onSubmit={onSubmit} className="mx-auto max-w-lg space-y-3 px-4 py-4">
        <div className="sam-form-field">
          <label className="sam-form-label">주제 <span className="sam-form-required">*</span></label>
          <select
            value={topicSlug}
            onChange={(e) => setTopicSlug(e.target.value)}
            className={`mt-1 w-full ${PHILIFE_FB_INPUT_CLASS}`}
          >
            {writableTopics.length === 0 ? <option value="">주제 없음 — DB 확인</option> : null}
            {writableTopics.map((t) => (
              <option key={t.id} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {skinHint ? <p className="rounded-sam-md border border-sam-info/15 bg-sam-info-soft px-3 py-2 sam-text-body-secondary text-sam-info">{skinHint}</p> : null}
        <div className="sam-form-field">
          <label className="sam-form-label">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`mt-1 w-full ${PHILIFE_FB_INPUT_CLASS}`}
            placeholder="제목을 입력하세요"
            maxLength={200}
          />
        </div>
        <div className="sam-form-field">
          <label className="sam-form-label">내용</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            className={`mt-1 ${PHILIFE_FB_TEXTAREA_CLASS}`}
            placeholder="이웃과 나누고 싶은 이야기를 적어주세요."
          />
        </div>
        {selectedTopic?.allow_meetup ? (
          <div className="sam-section space-y-3">
            <p className="sam-form-label">모임·장소 (선택)</p>
            <div className="sam-form-field">
              <label className="sam-form-description">장소명 · 상호</label>
              <input
                value={meetupPlace}
                onChange={(e) => setMeetupPlace(e.target.value)}
                className={`mt-1 w-full ${PHILIFE_FB_INPUT_CLASS}`}
                placeholder="예: 조치원역 2번 출구, ○○식당"
                maxLength={200}
              />
            </div>
            <div className="sam-form-field">
              <label className="sam-form-description">일정 (선택)</label>
              <input
                type="datetime-local"
                value={meetupDate}
                onChange={(e) => setMeetupDate(e.target.value)}
                className={`mt-1 w-full ${PHILIFE_FB_INPUT_CLASS}`}
              />
            </div>
          </div>
        ) : null}
        <div className="sam-form-field">
          <label className="sam-form-label">사진 (최대 10장)</label>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onPickFiles} />
          <div className="mt-2 flex flex-wrap gap-2">
            {imageUrls.map((url, idx) => (
              <div key={`${url}-${idx}`} className="relative h-20 w-20 overflow-hidden rounded-sam-md border border-sam-border bg-sam-surface-muted">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute right-0 top-0 rounded-bl-sam-md bg-sam-ink/70 px-1.5 py-0.5 sam-text-xxs text-sam-on-primary"
                >
                  삭제
                </button>
              </div>
            ))}
            {imageUrls.length < 10 ? (
              <button
                type="button"
                disabled={uploading || busy}
                onClick={() => fileRef.current?.click()}
                className="flex h-20 w-20 items-center justify-center rounded-sam-md border border-dashed border-sam-border sam-text-body-secondary"
              >
                {uploading ? "…" : "+ 추가"}
              </button>
            ) : null}
          </div>
        </div>
        {selectedTopic?.allow_question ? (
          <label className="flex items-center gap-2 sam-text-body">
            <input type="checkbox" checked={isQuestion} onChange={(e) => setIsQuestion(e.target.checked)} />
            질문글로 올리기
          </label>
        ) : null}
        {err ? <p className="sam-text-helper text-sam-danger">{err}</p> : null}
        <button
          type="submit"
          disabled={busy || !title.trim() || !content.trim()}
          className={`w-full ${COMMUNITY_BUTTON_PRIMARY_CLASS}`}
        >
          {busy ? "등록 중…" : "등록하기"}
        </button>
      </form>
    </div>
  );
}
