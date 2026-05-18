"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppBackButton } from "@/components/navigation/AppBackButton";
import { SamarketThumbnail } from "@/components/common/SamarketThumbnail";
import { useRegion } from "@/contexts/RegionContext";
import type { CommunityTopicDTO } from "@/lib/community-feed/types";
import { normalizeSectionSlug } from "@/lib/community-feed/constants";
import { philifePostsRootUrl, philifeUploadImageUrl } from "@domain/philife/api";
import { philifeAppPaths } from "@domain/philife/paths";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  const { t } = useI18n();
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
        else setErr(j.error ?? t("community_write_image_upload_failed"));
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
      ? t("community_write_skin_location_pin")
      : selectedTopic?.feed_list_skin === "hashtags_below"
        ? t("community_write_skin_hashtags")
        : selectedTopic?.feed_list_skin === "text_primary"
          ? t("community_write_skin_text_primary")
          : null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr((prev) => (prev === "" ? prev : ""));
    if (!topicSlug) {
      setErr(t("community_write_select_topic_err"));
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
      setErr(data.error ?? t("community_write_submit_failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-sam-app pb-10">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-sam-border bg-sam-surface px-4 py-2">
        <AppBackButton backHref={philifeAppPaths.home} ariaLabel={t("common_close")} />
        <h1 className="sam-app-header-title">{t("tier1_community_write")}</h1>
      </header>

      <form onSubmit={onSubmit} className="mx-auto max-w-lg space-y-3 px-4 py-4">
        <div className="sam-form-field">
          <label className="sam-form-label">
            {t("community_write_topic_label")} <span className="sam-form-required">*</span>
          </label>
          <select
            value={topicSlug}
            onChange={(e) => setTopicSlug(e.target.value)}
            className={`mt-1 w-full ${PHILIFE_FB_INPUT_CLASS}`}
          >
            {writableTopics.length === 0 ? <option value="">{t("community_write_topic_empty")}</option> : null}
            {writableTopics.map((t) => (
              <option key={t.id} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {skinHint ? <p className="rounded-sam-md border border-sam-info/15 bg-sam-info-soft px-3 py-2 sam-text-body-secondary text-sam-info">{skinHint}</p> : null}
        <div className="sam-form-field">
          <label className="sam-form-label">{t("philife_write_title_label")}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`mt-1 w-full ${PHILIFE_FB_INPUT_CLASS}`}
            placeholder={t("philife_write_title_placeholder")}
            maxLength={200}
          />
        </div>
        <div className="sam-form-field">
          <label className="sam-form-label">{t("philife_write_content_label")}</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            className={`mt-1 ${PHILIFE_FB_TEXTAREA_CLASS}`}
            placeholder={t("community_write_content_neighbor_placeholder")}
          />
        </div>
        {selectedTopic?.allow_meetup ? (
          <div className="sam-section space-y-3">
            <p className="sam-form-label">{t("community_write_meetup_place_section")}</p>
            <div className="sam-form-field">
              <label className="sam-form-description">{t("community_write_place_name")}</label>
              <input
                value={meetupPlace}
                onChange={(e) => setMeetupPlace(e.target.value)}
                className={`mt-1 w-full ${PHILIFE_FB_INPUT_CLASS}`}
                placeholder={t("community_write_place_placeholder")}
                maxLength={200}
              />
            </div>
            <div className="sam-form-field">
              <label className="sam-form-description">{t("community_write_schedule_optional")}</label>
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
          <label className="sam-form-label">{t("community_write_photos_max")}</label>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={onPickFiles} />
          <div className="mt-2 flex flex-wrap gap-2">
            {imageUrls.map((url, idx) => (
              <div key={`${url}-${idx}`} className="relative h-20 w-20 overflow-hidden rounded-sam-md border border-sam-border bg-sam-surface-muted">
                <SamarketThumbnail
                  src={url}
                  fill
                  roundedClassName="rounded-sam-md"
                  className="bg-sam-surface-muted"
                />
                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute right-0 top-0 rounded-bl-sam-md bg-sam-ink/70 px-1.5 py-0.5 sam-text-xxs text-sam-on-primary"
                >
                  {t("community_delete")}
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
                {uploading ? "…" : t("community_write_add_photo")}
              </button>
            ) : null}
          </div>
        </div>
        {selectedTopic?.allow_question ? (
          <label className="flex items-center gap-2 sam-text-body">
            <input type="checkbox" checked={isQuestion} onChange={(e) => setIsQuestion(e.target.checked)} />
            {t("community_write_question_toggle")}
          </label>
        ) : null}
        {err ? <p className="sam-text-helper text-sam-danger">{err}</p> : null}
        <button
          type="submit"
          disabled={busy || !title.trim() || !content.trim()}
          className={`w-full ${COMMUNITY_BUTTON_PRIMARY_CLASS}`}
        >
          {busy ? t("community_write_submitting") : t("community_write_submit")}
        </button>
      </form>
    </div>
  );
}
