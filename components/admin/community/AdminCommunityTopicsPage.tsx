"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { CommunitySectionAdminRow } from "@/lib/community-feed/types";
import type { CommunityTopicAdminRow } from "@/lib/community-topics/server";
import { normalizeFeedSlug, normalizeSectionSlug } from "@/lib/community-feed/constants";
import type { CommunityFeedListSkin } from "@/lib/community-feed/topic-feed-skin";
import {
  COMMUNITY_FEED_LIST_SKINS,
  normalizeCommunityFeedListSkin,
} from "@/lib/community-feed/topic-feed-skin";
import { topicBelongsToPhilifeNeighborhoodSection } from "@/lib/neighborhood/meetup-feed-topics";
import type { CommunityTopicContentStats } from "@/lib/community-topics/admin-topic-content-stats";

const ADMIN_TOPIC_SKIN_I18N: Record<CommunityFeedListSkin, `admin_topics_skin_${CommunityFeedListSkin}`> = {
  compact_media: "admin_topics_skin_compact_media",
  compact_media_left: "admin_topics_skin_compact_media_left",
  text_primary: "admin_topics_skin_text_primary",
  location_pin: "admin_topics_skin_location_pin",
  hashtags_below: "admin_topics_skin_hashtags_below",
};

/**
 * App 2-tier Community IA — 운영자에게는 「주제(content topics)」만 노출한다.
 * 인기/추천 정렬 시드(is_feed_sort)·모임(allow_meetup) 주제는 이 화면에서 만들 수 없고
 * 목록에도 나오지 않는다 — Composer writeEligible 과 동일 SSOT (`!allow_meetup`).
 */
const DEFAULT_FEED_LIST_SKIN: CommunityFeedListSkin = "compact_media";

export function AdminCommunityTopicsPage({
  sections,
  topics: initial,
  philifeNeighborhoodSectionSlug,
  topicStatsBySlug = {},
}: {
  sections: CommunitySectionAdminRow[];
  topics: CommunityTopicAdminRow[];
  philifeNeighborhoodSectionSlug: string;
  topicStatsBySlug?: Record<string, CommunityTopicContentStats>;
}) {
  const router = useRouter();
  const { t: tr } = useI18n();
  const [topics, setTopics] = useState(initial);
  const [busy, setBusy] = useState(false);
  const defaultPhilifeSectionId = useMemo(
    () =>
      sections.find((s) => normalizeSectionSlug(s.slug) === normalizeSectionSlug(philifeNeighborhoodSectionSlug))?.id ??
      sections[0]?.id ??
      "",
    [sections, philifeNeighborhoodSectionSlug]
  );

  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [feedListSkin, setFeedListSkin] = useState<CommunityFeedListSkin>(DEFAULT_FEED_LIST_SKIN);
  const [edit, setEdit] = useState<CommunityTopicAdminRow | null>(null);

  const contentTopics = useMemo(
    () =>
      topics.filter((t) => {
        if (!topicBelongsToPhilifeNeighborhoodSection(t.section_slug, philifeNeighborhoodSectionSlug)) {
          return false;
        }
        if (t.is_feed_sort) return false;
        if (t.allow_meetup) return false;
        return true;
      }),
    [topics, philifeNeighborhoodSectionSlug]
  );

  useEffect(() => {
    if (!edit) return;
    const stillContentTopic = contentTopics.some((t) => t.id === edit.id);
    if (!stillContentTopic) setEdit(null);
  }, [contentTopics, edit]);

  async function refresh() {
    const res = await fetch("/api/admin/community/topics", { credentials: "include", cache: "no-store" });
    const j = await res.json();
    if (j.ok && Array.isArray(j.topics)) {
      setTopics(j.topics as CommunityTopicAdminRow[]);
    }
    router.refresh();
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!defaultPhilifeSectionId) {
      alert(tr("admin_topics_alert_select_section"));
      return;
    }
    const finalSlug = normalizeFeedSlug(name) || normalizeFeedSlug(nameEn);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/community/topics", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_id: defaultPhilifeSectionId,
          name,
          name_en: nameEn.trim() || null,
          slug: finalSlug,
          sort_order: sortOrder,
          is_active: isActive,
          is_visible: isVisible,
          is_feed_sort: false,
          feed_sort_mode: null,
          allow_question: true,
          allow_meetup: false,
          color: null,
          feed_list_skin: feedListSkin,
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        alert(
          j.error === "slug_duplicate_in_section" ? tr("admin_topics_err_slug_duplicate") : j.error ?? tr("admin_topics_err_save")
        );
        return;
      }
      setName("");
      setNameEn("");
      setSortOrder(0);
      setIsActive(true);
      setIsVisible(true);
      setFeedListSkin(DEFAULT_FEED_LIST_SKIN);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/topics/${edit.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_id: edit.section_id,
          name: edit.name,
          name_en: edit.name_en,
          slug: edit.slug,
          sort_order: edit.sort_order,
          is_active: edit.is_active,
          is_visible: edit.is_visible,
          is_feed_sort: edit.is_feed_sort,
          feed_sort_mode: edit.feed_sort_mode,
          allow_question: edit.allow_question,
          allow_meetup: edit.allow_meetup,
          color: edit.color,
          icon: edit.icon,
          feed_list_skin: edit.feed_list_skin,
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        alert(
          j.error === "slug_duplicate_in_section" ? tr("admin_topics_err_slug_duplicate") : j.error ?? tr("admin_topics_err_save")
        );
        return;
      }
      setEdit(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(id: string) {
    if (!confirm(tr("admin_topics_confirm_delete"))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/topics/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await res.json();
      if (!j.ok) {
        alert(j.error === "topic_has_posts" ? tr("admin_topics_err_has_posts") : j.error ?? tr("admin_topics_err_delete"));
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 text-sam-fg">
      <AdminPageHeader
        titleKey="admin_topics_page_title"
        description={tr("admin_topics_header_desc_simple", { section: philifeNeighborhoodSectionSlug })}
        titleClassName="text-[1.5rem] font-bold leading-tight tracking-tight text-sam-fg"
        descriptionClassName="mt-1.5 max-w-3xl font-normal leading-relaxed text-sam-muted sam-text-body-secondary"
      />

      <AdminCard
        title={tr("admin_topics_form_add_content")}
        titleClassName="sam-text-section-title text-sam-fg"
      >
        {sections.length === 0 ? (
          <p className="mb-3 sam-text-body-secondary text-amber-800">
            {tr("admin_topics_no_sections_before")}
            <a
              href="/admin/community/sections"
              className="font-medium text-sam-primary hover:text-sam-primary-hover hover:underline"
            >
              {tr("admin_topics_no_sections_link")}
            </a>
            {tr("admin_topics_no_sections_after")}
          </p>
        ) : null}
        <form
          onSubmit={onCreate}
          className="flex flex-col gap-3.5 text-sam-fg sam-text-body-secondary"
        >
          <div className="flex flex-wrap items-end gap-2.5 sm:gap-3">
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">{tr("admin_topics_label_topic_name")}</span>
              <input
                className="min-h-10 min-w-[9rem] rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">{tr("admin_topics_label_name_en_simple")}</span>
              <input
                className="min-h-10 min-w-[9rem] rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">{tr("admin_topics_label_skin")}</span>
              <select
                className="min-h-10 min-w-[12rem] rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg"
                value={feedListSkin}
                onChange={(e) =>
                  setFeedListSkin(normalizeCommunityFeedListSkin(e.target.value))
                }
              >
                {COMMUNITY_FEED_LIST_SKINS.map((skin) => (
                  <option key={skin} value={skin}>
                    {tr(ADMIN_TOPIC_SKIN_I18N[skin])}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">{tr("admin_topics_label_order")}</span>
              <input
                type="number"
                className="h-10 w-20 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 self-end pb-1.5 text-sam-fg sam-text-body-secondary">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              {tr("admin_topics_checkbox_use")}
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 self-end pb-1.5 text-sam-fg sam-text-body-secondary">
              <input type="checkbox" checked={isVisible} onChange={(e) => setIsVisible(e.target.checked)} />
              {tr("admin_topics_checkbox_display")}
            </label>
            <button
              type="submit"
              disabled={busy || sections.length === 0}
              className="self-end rounded-ui-rect bg-sam-ink px-3.5 py-2 text-white transition-opacity sam-text-body-secondary font-medium enabled:hover:opacity-95 disabled:opacity-50"
            >
              {tr("admin_topics_btn_add")}
            </button>
          </div>
        </form>
      </AdminCard>

      <AdminCard
        titleClassName="sam-text-section-title text-sam-fg"
        title={tr("admin_topics_list_content")}
      >
        {contentTopics.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{tr("admin_topics_empty_content")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sam-fg sam-text-body-secondary">
              <thead>
                <tr className="border-b border-sam-border text-sam-meta">
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_order")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_topic_name")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_slug")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_skin")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_posts")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_comments")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_reports")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_use")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_display")}</th>
                  <th className="px-0 py-2.5 text-left font-medium sam-text-helper">{tr("admin_topics_col_manage")}</th>
                </tr>
              </thead>
              <tbody>
                {contentTopics.map((topic) => {
                  const slugKey = (topic.slug ?? "").trim().toLowerCase();
                  const stats = topicStatsBySlug[slugKey] ?? {
                    postCount: 0,
                    commentCount: 0,
                    reportCount: 0,
                  };
                  const skin = normalizeCommunityFeedListSkin(topic.feed_list_skin);
                  return edit?.id === topic.id ? (
                    <tr key={topic.id} className="border-b border-sam-border-soft bg-amber-50/40 align-top">
                      <td className="py-2.5 pr-2">
                        <input
                          type="number"
                          className="w-16 rounded border px-1 py-1"
                          value={edit.sort_order}
                          onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="py-2.5 pr-2">
                        <div className="flex flex-col gap-1">
                          <input
                            className="w-full rounded border px-1 py-1"
                            value={edit.name}
                            onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                            placeholder={tr("admin_topics_label_topic_name")}
                          />
                          <input
                            className="w-full rounded border px-1 py-1 sam-text-xxs"
                            value={edit.name_en ?? ""}
                            onChange={(e) => setEdit({ ...edit, name_en: e.target.value.trim() || null })}
                            placeholder={tr("admin_topics_label_name_en_simple")}
                          />
                        </div>
                      </td>
                      <td className="py-2.5 pr-2 sam-text-xxs text-sam-muted">{edit.slug}</td>
                      <td className="py-2.5 pr-2">
                        <select
                          className="min-w-[10rem] rounded border px-1 py-1 text-sam-fg"
                          value={normalizeCommunityFeedListSkin(edit.feed_list_skin)}
                          onChange={(e) =>
                            setEdit({
                              ...edit,
                              feed_list_skin: normalizeCommunityFeedListSkin(e.target.value),
                            })
                          }
                        >
                          {COMMUNITY_FEED_LIST_SKINS.map((s) => (
                            <option key={s} value={s}>
                              {tr(ADMIN_TOPIC_SKIN_I18N[s])}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 pr-2">{stats.postCount}</td>
                      <td className="py-2.5 pr-2">{stats.commentCount}</td>
                      <td className="py-2.5 pr-2">{stats.reportCount}</td>
                      <td className="py-2.5 pr-2">
                        <input
                          type="checkbox"
                          checked={edit.is_active}
                          onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })}
                        />
                      </td>
                      <td className="py-2.5 pr-2">
                        <input
                          type="checkbox"
                          checked={edit.is_visible}
                          onChange={(e) => setEdit({ ...edit, is_visible: e.target.checked })}
                        />
                      </td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          disabled={busy}
                          className="mr-2 text-sam-primary hover:text-sam-primary-hover hover:underline disabled:opacity-50"
                          onClick={saveEdit}
                        >
                          {tr("common_save")}
                        </button>
                        <button type="button" className="text-sam-muted hover:underline" onClick={() => setEdit(null)}>
                          {tr("admin_topics_btn_cancel")}
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={topic.id} className="border-b border-sam-border-soft">
                      <td className="py-2.5 pr-2">{topic.sort_order}</td>
                      <td className="py-2.5 pr-2 text-sam-fg">
                        {topic.name}
                        {topic.name_en ? (
                          <span className="ml-1 text-sam-muted sam-text-xxs">· {topic.name_en}</span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-2 sam-text-xxs text-sam-muted">{topic.slug}</td>
                      <td className="py-2.5 pr-2 sam-text-xxs">{tr(ADMIN_TOPIC_SKIN_I18N[skin])}</td>
                      <td className="py-2.5 pr-2">{stats.postCount}</td>
                      <td className="py-2.5 pr-2">{stats.commentCount}</td>
                      <td className="py-2.5 pr-2">{stats.reportCount}</td>
                      <td className="py-2.5 pr-2">{topic.is_active ? "Y" : "N"}</td>
                      <td className="py-2.5 pr-2">{topic.is_visible ? "Y" : "N"}</td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          className="mr-2 text-sam-primary hover:text-sam-primary-hover hover:underline"
                          onClick={() => setEdit({ ...topic })}
                        >
                          {tr("admin_topics_btn_edit")}
                        </button>
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={() => removeRow(topic.id)}
                        >
                          {tr("admin_topics_btn_delete")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
