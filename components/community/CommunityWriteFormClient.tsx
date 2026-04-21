"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { useRegion } from "@/contexts/RegionContext";
import type { CommunityTopicDTO } from "@/lib/community-feed/types";
import { normalizeSectionSlug } from "@/lib/community-feed/constants";
import { philifePostsRootUrl, philifeUploadImageUrl } from "@domain/philife/api";
import { philifeAppPaths } from "@domain/philife/paths";

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
    setMeetupPlace("");
    setMeetupDate("");
  }, [topicSlug]);

  useEffect(() => {
    if (selectedTopic && !selectedTopic.allow_question) {
      setIsQuestion(false);
    }
  }, [selectedTopic]);

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
    setErr("");
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
    <div className="min-h-screen bg-sam-surface pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-sam-border-soft bg-sam-surface px-2 py-2">
        <AppBackButton backHref={philifeAppPaths.home} ariaLabel="닫기" />
        <h1 className="sam-text-body-lg font-semibold text-sam-fg">커뮤니티 글쓰기</h1>
      </header>

      <form onSubmit={onSubmit} className="mx-auto max-w-lg space-y-4 px-4 py-4">
        <div>
          <label className="sam-text-helper font-medium text-sam-muted">주제 (필수)</label>
          <select
            value={topicSlug}
            onChange={(e) => setTopicSlug(e.target.value)}
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body"
          >
            {writableTopics.length === 0 ? <option value="">주제 없음 — DB 확인</option> : null}
            {writableTopics.map((t) => (
              <option key={t.id} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {skinHint ? <p className="rounded-ui-rect bg-sky-50 px-3 py-2 sam-text-helper leading-snug text-sky-900">{skinHint}</p> : null}
        <div>
          <label className="sam-text-helper font-medium text-sam-muted">제목</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body"
            placeholder="제목을 입력하세요"
            maxLength={200}
          />
        </div>
        <div>
          <label className="sam-text-helper font-medium text-sam-muted">내용</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            className="mt-1 w-full rounded-ui-rect border border-sam-border px-3 py-2.5 sam-text-body"
            placeholder="이웃과 나누고 싶은 이야기를 적어주세요."
          />
        </div>
        {selectedTopic?.allow_meetup ? (
          <div className="space-y-3 rounded-ui-rect border border-sam-border-soft bg-sam-app/80 px-3 py-3">
            <p className="sam-text-helper font-semibold text-sam-muted">모임·장소 (선택)</p>
            <div>
              <label className="sam-text-xxs font-medium text-sam-muted">장소명 · 상호</label>
              <input
                value={meetupPlace}
                onChange={(e) => setMeetupPlace(e.target.value)}
                className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body"
                placeholder="예: 조치원역 2번 출구, ○○식당"
                maxLength={200}
              />
            </div>
            <div>
              <label className="sam-text-xxs font-medium text-sam-muted">일정 (선택)</label>
              <input
                type="datetime-local"
                value={meetupDate}
                onChange={(e) => setMeetupDate(e.target.value)}
                className="mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-body"
              />
            </div>
          </div>
        ) : null}
        <div>
          <label className="sam-text-helper font-medium text-sam-muted">사진 (최대 10장)</label>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onPickFiles} />
          <div className="mt-2 flex flex-wrap gap-2">
            {imageUrls.map((url, idx) => (
              <div key={`${url}-${idx}`} className="relative h-20 w-20 overflow-hidden rounded-ui-rect bg-sam-surface-muted">
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute right-0 top-0 rounded-bl bg-black/60 px-1.5 py-0.5 sam-text-xxs text-white"
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
                className="flex h-20 w-20 items-center justify-center rounded-ui-rect border border-dashed border-sam-border sam-text-helper text-sam-muted"
              >
                {uploading ? "…" : "+ 추가"}
              </button>
            ) : null}
          </div>
        </div>
        {selectedTopic?.allow_question ? (
          <label className="flex items-center gap-2 sam-text-body text-sam-fg">
            <input type="checkbox" checked={isQuestion} onChange={(e) => setIsQuestion(e.target.checked)} />
            질문글로 올리기
          </label>
        ) : null}
        {err ? <p className="sam-text-body-secondary text-red-600">{err}</p> : null}
        <button
          type="submit"
          disabled={busy || !title.trim() || !content.trim()}
          className="w-full rounded-ui-rect bg-sam-ink py-3.5 sam-text-body font-semibold text-white disabled:opacity-40"
        >
          {busy ? "등록 중…" : "등록하기"}
        </button>
      </form>
    </div>
  );
}
