"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { CommunitySectionAdminRow } from "@/lib/community-feed/types";
import type { CommunityTopicAdminRow } from "@/lib/community-topics/server";
import { normalizeFeedSlug, normalizeSectionSlug } from "@/lib/community-feed/constants";
import { COMMUNITY_FEED_LIST_SKINS, type CommunityFeedListSkin } from "@/lib/community-feed/topic-feed-skin";

const COMMUNITY_FEED_SKIN_LABEL_KEYS: Record<CommunityFeedListSkin, MessageKey> = {
  compact_media: "admin_topics_skin_compact_media",
  compact_media_left: "admin_topics_skin_compact_media_left",
  text_primary: "admin_topics_skin_text_primary",
  location_pin: "admin_topics_skin_location_pin",
  hashtags_below: "admin_topics_skin_hashtags_below",
};
import { isPhilifeGeneralOnlyTopicSlug } from "@/lib/neighborhood/philife-topic-slug-rules";
import {
  qualifiesForPhilifeMeetupAdminList,
  topicBelongsToPhilifeNeighborhoodSection,
} from "@/lib/neighborhood/meetup-feed-topics";

/**
 * - 일반 게시판: 운영자가 만드는 주제(slug·이름) — '추가' 폼은 이것만.
 * - 인기(조회)·추천(랭킹) 탭: is_feed_sort 시드(기본) — 여기서 신규 "게시판"으로 추가하지 않음.
 * - 최신/추천(정렬): URL·피드 `sort` 등(보는 방식).
 * - 모임: allow_meetup + 모임 API
 */
type TopicsMenuTab = "general" | "meetup";

function labelAdminFeedTopicRow(
  row: CommunityTopicAdminRow,
  philifeNeighborhoodSectionSlug: string,
  tr: (key: MessageKey, vars?: Record<string, string | number>) => string
): string {
  if (
    qualifiesForPhilifeMeetupAdminList(
      row.allow_meetup,
      row.slug,
      row.section_slug,
      philifeNeighborhoodSectionSlug
    )
  ) {
    return tr("admin_topics_row_kind_meetup");
  }
  if (row.is_feed_sort) {
    return row.feed_sort_mode === "recommended"
      ? tr("admin_topics_row_kind_recommended")
      : tr("admin_topics_row_kind_popular");
  }
  return tr("admin_topics_row_kind_general");
}

export function AdminCommunityTopicsPage({
  sections,
  topics: initial,
  philifeNeighborhoodSectionSlug,
}: {
  sections: CommunitySectionAdminRow[];
  topics: CommunityTopicAdminRow[];
  philifeNeighborhoodSectionSlug: string;
}) {
  const router = useRouter();
  const { t: tr } = useI18n();
  const tableEmpty = tr("admin_users_empty_placeholder");
  const [topics, setTopics] = useState(initial);
  const [busy, setBusy] = useState(false);
  const defaultPhilifeSectionId = useMemo(
    () =>
      sections.find((s) => normalizeSectionSlug(s.slug) === normalizeSectionSlug(philifeNeighborhoodSectionSlug))?.id ??
      sections[0]?.id ??
      "",
    [sections, philifeNeighborhoodSectionSlug]
  );
  const [sectionId, setSectionId] = useState("");
  useEffect(() => {
    setSectionId((prev) => prev || defaultPhilifeSectionId);
  }, [defaultPhilifeSectionId]);

  useEffect(() => {
    let cancel = false;
    void (async () => {
      try {
        const r = await fetch("/api/admin/community/philife-neighborhood-section", {
          credentials: "include",
          cache: "no-store",
        });
        const j = await r.json();
        if (!cancel && j.ok) {
          if (typeof j.show_all_feed_tab === "boolean") {
            setShowAllFeedTab(j.show_all_feed_tab);
            setShowAllFeedTabSaved(j.show_all_feed_tab);
          }
          if (typeof j.show_neighbor_only_filter === "boolean") {
            setShowNeighborOnlyFilter(j.show_neighbor_only_filter);
            setShowNeighborOnlyFilterSaved(j.show_neighbor_only_filter);
          }
        }
      } catch {
        /* keep default true */
      } finally {
        if (!cancel) setPhilifeSectionSettingsLoaded(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [allowQuestion, setAllowQuestion] = useState(true);
  const [color, setColor] = useState("");
  const [feedListSkin, setFeedListSkin] = useState<CommunityFeedListSkin>("compact_media");
  const [edit, setEdit] = useState<CommunityTopicAdminRow | null>(null);
  const [menuTab, setMenuTab] = useState<TopicsMenuTab>("general");
  const [showAllFeedTab, setShowAllFeedTab] = useState(true);
  const [showAllFeedTabSaved, setShowAllFeedTabSaved] = useState(true);
  const [showNeighborOnlyFilter, setShowNeighborOnlyFilter] = useState(true);
  const [showNeighborOnlyFilterSaved, setShowNeighborOnlyFilterSaved] = useState(true);
  const [philifeSectionSettingsLoaded, setPhilifeSectionSettingsLoaded] = useState(false);

  const filteredTopics = useMemo(() => {
    if (menuTab === "meetup") {
      return topics.filter((t) =>
        qualifiesForPhilifeMeetupAdminList(t.allow_meetup, t.slug, t.section_slug, philifeNeighborhoodSectionSlug)
      );
    }
    return topics.filter((t) => {
      if (!topicBelongsToPhilifeNeighborhoodSection(t.section_slug, philifeNeighborhoodSectionSlug)) {
        return false;
      }
      return !qualifiesForPhilifeMeetupAdminList(
        t.allow_meetup,
        t.slug,
        t.section_slug,
        philifeNeighborhoodSectionSlug
      );
    });
  }, [topics, menuTab, philifeNeighborhoodSectionSlug]);

  useEffect(() => {
    if (!edit) return;
    const inMeetupTab = qualifiesForPhilifeMeetupAdminList(
      edit.allow_meetup,
      edit.slug,
      edit.section_slug,
      philifeNeighborhoodSectionSlug
    );
    const inGeneralArea =
      topicBelongsToPhilifeNeighborhoodSection(edit.section_slug, philifeNeighborhoodSectionSlug) &&
      !inMeetupTab;
    const inTab = menuTab === "meetup" ? inMeetupTab : inGeneralArea;
    if (!inTab) setEdit(null);
  }, [menuTab, edit, philifeNeighborhoodSectionSlug]);

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
    if (!sectionId) {
      alert(tr("admin_topics_alert_select_section"));
      return;
    }
    const chosenSectionSlug = sections.find((s) => s.id === sectionId)?.slug;
    if (!topicBelongsToPhilifeNeighborhoodSection(chosenSectionSlug, philifeNeighborhoodSectionSlug)) {
      alert(tr("admin_topics_alert_philife_section_only", { section: philifeNeighborhoodSectionSlug }));
      return;
    }
    const finalSlug = slug || normalizeFeedSlug(name);
    if (menuTab === "meetup" && isPhilifeGeneralOnlyTopicSlug(finalSlug)) {
      alert(tr("admin_topics_alert_meetup_slug_general_only"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/community/topics", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_id: sectionId,
          name,
          name_en: nameEn.trim() || null,
          slug: finalSlug,
          sort_order: sortOrder,
          is_active: isActive,
          is_visible: isVisible,
          is_feed_sort: false,
          feed_sort_mode: null,
          allow_question: allowQuestion,
          allow_meetup: menuTab === "meetup",
          color: color.trim() || null,
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
      setSlug("");
      setSortOrder(0);
      setIsActive(true);
      setIsVisible(true);
      setAllowQuestion(true);
      setColor("");
      setFeedListSkin("compact_media");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!edit) return;
    const editSectionSlug = sections.find((s) => s.id === edit.section_id)?.slug;
    if (!topicBelongsToPhilifeNeighborhoodSection(editSectionSlug, philifeNeighborhoodSectionSlug)) {
      alert(tr("admin_topics_alert_edit_philife_section", { section: philifeNeighborhoodSectionSlug }));
      return;
    }
    if (edit.allow_meetup && isPhilifeGeneralOnlyTopicSlug(edit.slug)) {
      alert(tr("admin_topics_alert_meetup_slug_conflict"));
      return;
    }
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
          feed_sort_mode: edit.is_feed_sort ? edit.feed_sort_mode ?? "popular" : null,
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

  const headerDescription = useMemo(
    () =>
      menuTab === "meetup"
        ? tr("admin_topics_header_desc_meetup", { section: philifeNeighborhoodSectionSlug })
        : tr("admin_topics_header_desc_general", { section: philifeNeighborhoodSectionSlug }),
    [menuTab, philifeNeighborhoodSectionSlug, tr]
  );

  async function saveShowAllFeedTab() {
    setBusy(true);
    const next = showAllFeedTab;
    try {
      const res = await fetch("/api/admin/community/philife-neighborhood-section", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show_all_feed_tab: next }),
      });
      const j = await res.json();
      if (!j.ok) {
        setShowAllFeedTab(showAllFeedTabSaved);
        alert(j.error === "forbidden" ? tr("admin_topics_err_forbidden") : String(j.error ?? tr("admin_topics_err_save")));
        return;
      }
      setShowAllFeedTabSaved(next);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveShowNeighborOnlyFilter() {
    setBusy(true);
    const next = showNeighborOnlyFilter;
    try {
      const res = await fetch("/api/admin/community/philife-neighborhood-section", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ show_neighbor_only_filter: next }),
      });
      const j = await res.json();
      if (!j.ok) {
        setShowNeighborOnlyFilter(showNeighborOnlyFilterSaved);
        alert(j.error === "forbidden" ? tr("admin_topics_err_forbidden") : String(j.error ?? tr("admin_topics_err_save")));
        return;
      }
      setShowNeighborOnlyFilterSaved(next);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 text-sam-fg">
      <AdminPageHeader
        titleKey="admin_topics_page_title"
        backHref="/admin/philife/sections"
        description={headerDescription}
        titleClassName="text-[1.5rem] font-bold leading-tight tracking-tight text-sam-fg"
        descriptionClassName="mt-1.5 max-w-3xl font-normal leading-relaxed text-sam-muted sam-text-body-secondary"
      />

      <AdminCard titleKey="admin_topics_card_all_feed_title" titleClassName="sam-text-section-title text-sam-fg">
        {philifeSectionSettingsLoaded ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between text-sam-fg sam-text-body-secondary">
            <label className="flex cursor-pointer items-center gap-2.5 text-sam-fg sam-text-body-secondary">
              <input
                type="checkbox"
                disabled={busy}
                checked={showAllFeedTab}
                onChange={(e) => setShowAllFeedTab(e.target.checked)}
                className="shrink-0"
              />
              <span>{tr("admin_topics_card_all_feed_checkbox")}</span>
            </label>
            <button
              type="button"
              disabled={busy || showAllFeedTab === showAllFeedTabSaved}
              onClick={() => void saveShowAllFeedTab()}
              className="self-start rounded-ui-rect bg-sam-ink px-3.5 py-2 text-white transition-opacity sam-text-body-secondary font-medium enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 sm:self-center"
            >
              {tr("common_save")}
            </button>
          </div>
        ) : (
          <p className="text-sam-muted sam-text-helper" aria-hidden>
            {tr("common_loading")}
          </p>
        )}
      </AdminCard>

      <AdminCard titleKey="admin_topics_card_neighbor_title" titleClassName="sam-text-section-title text-sam-fg">
        {philifeSectionSettingsLoaded ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between text-sam-fg sam-text-body-secondary">
            <label className="flex cursor-pointer items-center gap-2.5 text-sam-fg sam-text-body-secondary">
              <input
                type="checkbox"
                disabled={busy}
                checked={showNeighborOnlyFilter}
                onChange={(e) => setShowNeighborOnlyFilter(e.target.checked)}
                className="shrink-0"
              />
              <span>{tr("admin_topics_card_neighbor_checkbox")}</span>
            </label>
            <button
              type="button"
              disabled={busy || showNeighborOnlyFilter === showNeighborOnlyFilterSaved}
              onClick={() => void saveShowNeighborOnlyFilter()}
              className="self-start rounded-ui-rect bg-sam-ink px-3.5 py-2 text-white transition-opacity sam-text-body-secondary font-medium enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 sm:self-center"
            >
              {tr("common_save")}
            </button>
          </div>
        ) : (
          <p className="text-sam-muted sam-text-helper" aria-hidden>
            {tr("common_loading")}
          </p>
        )}
      </AdminCard>

      <div className="flex flex-wrap gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setMenuTab("general")}
          className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-ui-rect px-3 py-2 sam-text-body font-semibold leading-tight transition-colors sm:flex-none sm:px-5 ${
            menuTab === "general"
              ? "bg-sam-ink text-white shadow-sm"
              : "bg-transparent text-sam-muted hover:bg-sam-app"
          }`}
        >
          <span>{tr("admin_topics_tab_general_feed")}</span>
        </button>
        <button
          type="button"
          onClick={() => setMenuTab("meetup")}
          className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-ui-rect px-3 py-2 sam-text-body font-semibold leading-tight transition-colors sm:flex-none sm:px-5 ${
            menuTab === "meetup"
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-transparent text-sam-muted hover:bg-sam-app"
          }`}
        >
          <span>{tr("admin_topics_tab_meetup")}</span>
        </button>
      </div>

      <AdminCard
        title={menuTab === "meetup" ? tr("admin_topics_form_add_meetup") : tr("admin_topics_form_add_general")}
        titleClassName="sam-text-section-title text-sam-fg"
      >
        {sections.length === 0 ? (
          <p className="mb-3 sam-text-body-secondary text-amber-800">
            {tr("admin_topics_no_sections_before")}
            <a
              href="/admin/philife/sections"
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
              <span className="text-sam-muted sam-text-helper">{tr("admin_topics_label_section")}</span>
              <select
                className="min-h-10 min-w-[11rem] rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.slug})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">{tr("admin_topics_label_name")}</span>
              <input
                className="min-h-10 min-w-[6rem] rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">{tr("admin_topics_label_name_en")}</span>
              <input
                className="min-h-10 min-w-[6rem] rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg"
                value={nameEn}
                onChange={(e) => setNameEn(e.target.value)}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">{tr("admin_topics_label_slug_field")}</span>
              <input
                className="min-h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 font-mono text-sam-fg sam-text-helper"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">{tr("admin_topics_label_sort")}</span>
              <input
                type="number"
                className="h-10 w-20 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 self-end pb-1.5 text-sam-fg sam-text-body-secondary">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              {tr("admin_topics_checkbox_active")}
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 self-end pb-1.5 text-sam-fg sam-text-body-secondary">
              <input type="checkbox" checked={isVisible} onChange={(e) => setIsVisible(e.target.checked)} />
              {tr("admin_topics_checkbox_visible")}
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 self-end pb-1.5 text-sam-fg sam-text-body-secondary">
              <input type="checkbox" checked={allowQuestion} onChange={(e) => setAllowQuestion(e.target.checked)} />
              {tr("admin_topics_checkbox_question")}
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">{tr("admin_topics_label_color")}</span>
              <input
                className="h-10 w-28 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 font-mono text-sam-fg sam-text-helper"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#..."
              />
            </label>
            <label className="flex min-w-[200px] flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">{tr("admin_topics_label_feed_skin")}</span>
              <select
                className="min-h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg sam-text-helper"
                value={feedListSkin}
                onChange={(e) => setFeedListSkin(e.target.value as CommunityFeedListSkin)}
              >
                {COMMUNITY_FEED_LIST_SKINS.map((k) => (
                  <option key={k} value={k}>
                    {tr(COMMUNITY_FEED_SKIN_LABEL_KEYS[k])}
                  </option>
                ))}
              </select>
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
        title={menuTab === "meetup" ? tr("admin_topics_list_meetup") : tr("admin_topics_list_general")}
      >
        {topics.length === 0 ? (
          <div className="space-y-2 sam-text-body-secondary text-amber-900">
            <p className="font-medium">{tr("admin_topics_empty_table_title")}</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sam-fg">
              <li>{tr("admin_topics_empty_help_1")}</li>
              <li>{tr("admin_topics_empty_help_2")}</li>
              <li>{tr("admin_topics_empty_help_3")}</li>
            </ul>
          </div>
        ) : filteredTopics.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">
            {menuTab === "meetup"
              ? tr("admin_topics_filter_empty_meetup", { section: philifeNeighborhoodSectionSlug })
              : tr("admin_topics_filter_empty_general")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-left text-sam-fg sam-text-body-secondary">
              <thead>
                <tr className="border-b border-sam-border text-sam-meta">
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_section")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_slug")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_name")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_list_skin")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_sort")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_visible")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_kind")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_active")}</th>
                  <th className="px-0 py-2.5 text-left font-medium sam-text-helper">{tr("admin_topics_col_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredTopics.map((topic) =>
                  edit?.id === topic.id ? (
                    <tr key={topic.id} className="border-b border-sam-border-soft bg-amber-50/40 align-top">
                      <td className="py-2.5 pr-2">
                        <select
                          className="max-w-[140px] rounded border px-1 py-1 sam-text-helper"
                          value={edit.section_id}
                          onChange={(e) => setEdit({ ...edit, section_id: e.target.value })}
                        >
                          {sections.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.slug}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 pr-2">
                        <input
                          className="w-full rounded border px-1 py-1 font-mono sam-text-helper"
                          value={edit.slug}
                          onChange={(e) => setEdit({ ...edit, slug: e.target.value })}
                        />
                      </td>
                      <td className="py-2.5 pr-2">
                        <input
                          className="w-full rounded border px-1 py-1"
                          value={edit.name}
                          onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                        />
                      </td>
                      <td className="py-2.5 pr-2">
                        <input
                          className="w-full rounded border px-1 py-1"
                          value={edit.name_en ?? ""}
                          onChange={(e) => setEdit({ ...edit, name_en: e.target.value.trim() || null })}
                        />
                      </td>
                      <td className="py-2.5 pr-2 align-top">
                        <select
                          className="max-w-[220px] rounded border px-1 py-1 sam-text-xxs"
                          value={edit.feed_list_skin}
                          onChange={(e) =>
                            setEdit({ ...edit, feed_list_skin: e.target.value as CommunityFeedListSkin })
                          }
                        >
                          {COMMUNITY_FEED_LIST_SKINS.map((k) => (
                            <option key={k} value={k}>
                              {tr(COMMUNITY_FEED_SKIN_LABEL_KEYS[k])}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2.5 pr-2">
                        <input
                          type="number"
                          className="w-14 rounded border px-1 py-1"
                          value={edit.sort_order}
                          onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="py-2.5 pr-2">
                        <input
                          type="checkbox"
                          checked={edit.is_visible}
                          onChange={(e) => setEdit({ ...edit, is_visible: e.target.checked })}
                        />
                      </td>
                      <td className="max-w-[11rem] py-2.5 pr-2 align-top">
                        {edit.is_feed_sort ? (
                          <select
                            className="w-full rounded border px-1 py-1.5 sam-text-xxs"
                            value={edit.feed_sort_mode ?? "popular"}
                            onChange={(e) =>
                              setEdit({
                                ...edit,
                                feed_sort_mode: e.target.value as "popular" | "recommended",
                                is_feed_sort: true,
                                allow_meetup: false,
                              })
                            }
                            aria-label={tr("admin_topics_aria_feed_sort")}
                          >
                            <option value="popular">{tr("admin_topics_sort_popular")}</option>
                            <option value="recommended">{tr("admin_topics_sort_recommended")}</option>
                          </select>
                        ) : (
                          <select
                            className="w-full rounded border px-1 py-1.5 sam-text-xxs"
                            value={edit.allow_meetup ? "meetup" : "general"}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (v === "general") {
                                if (isPhilifeGeneralOnlyTopicSlug(edit.slug)) {
                                  setEdit((cur) =>
                                    cur
                                      ? { ...cur, is_feed_sort: false, feed_sort_mode: null, allow_meetup: true }
                                      : null
                                  );
                                } else {
                                  setEdit((cur) =>
                                    cur
                                      ? { ...cur, is_feed_sort: false, feed_sort_mode: null, allow_meetup: false }
                                      : null
                                  );
                                }
                              } else if (v === "meetup") {
                                if (isPhilifeGeneralOnlyTopicSlug(edit.slug)) {
                                  alert(tr("admin_topics_alert_inline_meetup_slug"));
                                  return;
                                }
                                setEdit((cur) =>
                                  cur
                                    ? { ...cur, is_feed_sort: false, feed_sort_mode: null, allow_meetup: true }
                                    : null
                                );
                              }
                            }}
                          >
                            <option value="general">{tr("admin_topics_kind_general_board")}</option>
                            <option value="meetup">{tr("admin_topics_kind_meetup_feed")}</option>
                          </select>
                        )}
                      </td>
                      <td className="py-2.5 pr-2">
                        <input
                          type="checkbox"
                          checked={edit.is_active}
                          onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })}
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
                      <td className="py-2.5 pr-2 text-sam-fg">
                        {topic.section_name ?? tableEmpty}{" "}
                        <span className="font-mono sam-text-xxs text-sam-meta">({topic.section_slug})</span>
                      </td>
                      <td className="py-2.5 pr-2 font-mono sam-text-helper">{topic.slug}</td>
                      <td className="py-2.5 pr-2 text-sam-fg">{topic.name}</td>
                      <td
                        className="max-w-[200px] truncate py-2.5 pr-2 sam-text-xxs text-sam-muted"
                        title={tr(COMMUNITY_FEED_SKIN_LABEL_KEYS[topic.feed_list_skin])}
                      >
                        {tr(COMMUNITY_FEED_SKIN_LABEL_KEYS[topic.feed_list_skin])}
                      </td>
                      <td className="py-2.5 pr-2">{topic.sort_order}</td>
                      <td className="py-2.5 pr-2">{topic.is_visible ? "Y" : "N"}</td>
                      <td className="max-w-[10rem] py-2.5 pr-2 sam-text-xxs text-sam-fg">
                        {labelAdminFeedTopicRow(topic, philifeNeighborhoodSectionSlug, tr)}
                      </td>
                      <td className="py-2.5 pr-2">{topic.is_active ? "Y" : "N"}</td>
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
                          className="text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={topic.is_feed_sort}
                          title={topic.is_feed_sort ? tr("admin_topics_delete_disabled_hint") : undefined}
                          onClick={() => removeRow(topic.id)}
                        >
                          {tr("admin_topics_btn_delete")}
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </AdminCard>
    </div>
  );
}
