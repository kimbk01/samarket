"use client";

import Link from "next/link";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
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
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { AdminErrorState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";

type Banner = { ok: true; message: string } | { ok: false; code: string } | null;

/** 카테고리 API 오류 → 운영자 문구 (원시 오류 노출 금지) */
function topicErrorText(code: unknown, known: { duplicate: string; hasPosts: string }): string {
  const c = typeof code === "string" ? code : "";
  if (c === "slug_duplicate_in_section") return known.duplicate;
  if (c === "topic_has_posts") return known.hasPosts;
  if (c === "invalid_name") return "카테고리 이름을 입력해 주세요.";
  if (c === "invalid_slug") return "카테고리 이름으로 주소용 이름을 만들 수 없습니다. 영문 이름을 함께 입력해 주세요.";
  if (c === "not_found") return "카테고리를 찾을 수 없습니다. 새로고침 후 다시 확인하세요.";
  if (c === "forbidden" || c === "forbidden_permission") return "이 작업을 할 권한이 없습니다.";
  return adminOperatorErrorMessage(c, true);
}

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
  loadError = null,
}: {
  sections: CommunitySectionAdminRow[];
  topics: CommunityTopicAdminRow[];
  philifeNeighborhoodSectionSlug: string;
  topicStatsBySlug?: Record<string, CommunityTopicContentStats>;
  /** 서버 조회 실패 코드 — 「카테고리 없음」과 구분 */
  loadError?: string | null;
}) {
  const router = useRouter();
  const { t: tr } = useI18n();
  const [topics, setTopics] = useState(initial);
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(
    loadError ? { code: loadError, status: 500 } : null
  );
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  const fail = (code: unknown) =>
    setBanner({
      ok: false,
      code: topicErrorText(code, {
        duplicate: tr("admin_topics_err_slug_duplicate"),
        hasPosts: tr("admin_topics_err_has_posts"),
      }),
    });
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
      topics
        .filter((t) => {
          if (!topicBelongsToPhilifeNeighborhoodSection(t.section_slug, philifeNeighborhoodSectionSlug)) {
            return false;
          }
          if (t.is_feed_sort) return false;
          if (t.allow_meetup) return false;
          return true;
        })
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [topics, philifeNeighborhoodSectionSlug]
  );

  useEffect(() => {
    if (!edit) return;
    const stillContentTopic = contentTopics.some((t) => t.id === edit.id);
    if (!stillContentTopic) setEdit(null);
  }, [contentTopics, edit]);

  async function refresh() {
    const res = await fetch("/api/admin/community/topics", { credentials: "include", cache: "no-store" });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; topics?: unknown };
    if (j.ok && Array.isArray(j.topics)) {
      setTopics(j.topics as CommunityTopicAdminRow[]);
      setLoadErr(null);
    } else {
      // 실패해도 직전 목록은 지우지 않는다 (§8-5) — 오류 상태로 알린다
      setLoadErr({ code: typeof j.error === "string" && j.error ? j.error : "load_failed", status: res.status });
    }
    router.refresh();
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!defaultPhilifeSectionId) {
      setBanner({ ok: false, code: tr("admin_topics_alert_select_section") });
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
        fail(j.error);
        return;
      }
      setBanner({ ok: true, message: `카테고리 「${name.trim()}」을(를) 추가했습니다.` });
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
        fail(j.error);
        return;
      }
      setBanner({ ok: true, message: "카테고리를 저장했습니다." });
      setEdit(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(topic: CommunityTopicAdminRow) {
    const confirmed = await confirmAdminAction({
      level: adminActionLevel("delete"),
      ko: true,
      title: tr("admin_topics_confirm_delete"),
      description: `「${topic.name}」 카테고리를 삭제합니다. 되돌릴 수 없습니다. 글이 있는 카테고리는 삭제할 수 없습니다. 대신 「사용 중지」를 쓰세요.`,
      confirmLabel: "삭제",
      destructive: true,
      retypeValue: topic.name,
    });
    if (!confirmed.ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/topics/${topic.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: confirmed.reason }),
      });
      const j = await res.json();
      if (!j.ok) {
        fail(j.error);
        return;
      }
      setBanner({ ok: true, message: "카테고리를 삭제했습니다." });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  function fullBody(row: CommunityTopicAdminRow) {
    return {
      section_id: row.section_id,
      name: row.name,
      name_en: row.name_en,
      slug: row.slug,
      sort_order: row.sort_order,
      is_active: row.is_active,
      is_visible: row.is_visible,
      is_feed_sort: row.is_feed_sort,
      feed_sort_mode: row.feed_sort_mode,
      allow_question: row.allow_question,
      allow_meetup: row.allow_meetup,
      color: row.color,
      icon: row.icon,
      feed_list_skin: row.feed_list_skin,
    };
  }

  /** 사용 중지(disable · L1 확인) / 다시 사용 */
  async function toggleActive(topic: CommunityTopicAdminRow) {
    const next = !topic.is_active;
    if (!next) {
      const confirmed = await confirmAdminAction({
        level: adminActionLevel("disable"),
        ko: true,
        title: `「${topic.name}」 사용 중지`,
        description: "이 카테고리에 새 글을 쓸 수 없게 됩니다. 이미 있는 글은 그대로 남습니다.",
        confirmLabel: "사용 중지",
        destructive: true,
      });
      if (!confirmed.ok) return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/topics/${topic.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fullBody(topic), is_active: next }),
      });
      const j = await res.json().catch(() => ({}));
      if (!j.ok) {
        fail(j.error);
        return;
      }
      setBanner({ ok: true, message: next ? `「${topic.name}」을(를) 다시 사용합니다.` : `「${topic.name}」 사용을 중지했습니다.` });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function moveSort(topic: CommunityTopicAdminRow, direction: -1 | 1) {
    const sorted = [...contentTopics].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((t) => t.id === topic.id);
    const swapWith = sorted[idx + direction];
    if (idx < 0 || !swapWith) return;
    setBusy(true);
    try {
      const aOrder = topic.sort_order;
      const bOrder = swapWith.sort_order;
      const patch = async (row: CommunityTopicAdminRow, sort_order: number) => {
        const res = await fetch(`/api/admin/community/topics/${row.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            section_id: row.section_id,
            name: row.name,
            name_en: row.name_en,
            slug: row.slug,
            sort_order,
            is_active: row.is_active,
            is_visible: row.is_visible,
            is_feed_sort: row.is_feed_sort,
            feed_sort_mode: row.feed_sort_mode,
            allow_question: row.allow_question,
            allow_meetup: row.allow_meetup,
            color: row.color,
            icon: row.icon,
            feed_list_skin: row.feed_list_skin,
          }),
        });
        return res.json();
      };
      const j1 = await patch(topic, bOrder);
      const j2 = await patch(swapWith, aOrder);
      if (!j1.ok || !j2.ok) {
        fail(!j1.ok ? j1.error : j2.error);
        await refresh();
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

      <AdminResultBanner ko result={banner} onClose={() => setBanner(null)} />

      <AdminCard
        title={tr("admin_topics_form_add_content")}
        titleClassName="sam-text-section-title text-sam-fg"
      >
        {sections.length === 0 ? (
          <p className="mb-3 sam-text-body-secondary text-sam-warning">
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
            <AdminActionButton type="submit" variant="primary" disabled={busy || sections.length === 0} className="self-end">
              {tr("admin_topics_btn_add")}
            </AdminActionButton>
          </div>
        </form>
      </AdminCard>

      <AdminCard
        titleClassName="sam-text-section-title text-sam-fg"
        title={tr("admin_topics_list_content")}
      >
        {loadErr ? (
          <div className="mb-3">
            <AdminErrorState ko code={loadErr.code} httpStatus={loadErr.status} onRetry={() => void refresh()} />
          </div>
        ) : null}
        {loadErr && contentTopics.length === 0 ? null : contentTopics.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">{tr("admin_topics_empty_content")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left text-sam-fg sam-text-body-secondary">
              <thead>
                <tr className="border-b border-sam-border text-sam-meta">
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_order")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_topic_name")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_posts")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_comments")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_reports")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_use")}</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">{tr("admin_topics_col_display")}</th>
                  <th className="px-0 py-2.5 text-left font-medium sam-text-helper">{tr("admin_topics_col_manage")}</th>
                </tr>
              </thead>
              <tbody>
                {contentTopics.map((topic, topicIndex) => {
                  const slugKey = (topic.slug ?? "").trim().toLowerCase();
                  const stats = topicStatsBySlug[slugKey] ?? {
                    postCount: 0,
                    commentCount: 0,
                    reportCount: 0,
                  };
                  const countLinkClass = "text-sam-primary hover:underline tabular-nums";
                  const postsHref = `/admin/community/posts?topicSlug=${encodeURIComponent(slugKey)}`;
                  const commentsHref = `/admin/community/comments?topicSlug=${encodeURIComponent(slugKey)}`;
                  const reportsHref = `/admin/community/reports?topicSlug=${encodeURIComponent(slugKey)}`;
                  return edit?.id === topic.id ? (
                    <Fragment key={topic.id}>
                    <tr className="border-b border-sam-border-soft bg-sam-warning-soft/40 align-top">
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
                        </div>
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
                        <AdminActionButton variant="secondary" size="sm" disabled={busy} className="mr-2" onClick={saveEdit}>
                          {tr("common_save")}
                        </AdminActionButton>
                        <AdminActionButton variant="quiet" size="sm" className="h-auto! px-1!" onClick={() => setEdit(null)}>
                          {tr("admin_topics_btn_cancel")}
                        </AdminActionButton>
                      </td>
                    </tr>
                    {/* 행 버튼 2개 이하 — 되돌릴 수 없는 삭제는 수정 중일 때 아래 줄에서만 */}
                    <tr className="border-b border-sam-border-soft bg-sam-warning-soft/40">
                      <td colSpan={8} className="py-2">
                        <span className="flex flex-wrap items-center justify-end gap-2 sam-text-xxs text-sam-muted">
                          글이 없는 카테고리만 삭제할 수 있습니다. 되돌릴 수 없습니다.
                          <AdminActionButton variant="danger" size="sm" disabled={busy} onClick={() => void removeRow(topic)}>
                            {tr("admin_topics_btn_delete")}
                          </AdminActionButton>
                        </span>
                      </td>
                    </tr>
                    </Fragment>
                  ) : (
                    <tr key={topic.id} className="border-b border-sam-border-soft">
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-1">
                          <span className="tabular-nums">{topic.sort_order}</span>
                          <AdminActionButton
                            variant="quiet"
                            size="sm"
                            disabled={busy || topicIndex === 0}
                            aria-label={tr("admin_community_sort_up")}
                            onClick={() => void moveSort(topic, -1)}
                          >
                            {tr("admin_community_sort_up")}
                          </AdminActionButton>
                          <AdminActionButton
                            variant="quiet"
                            size="sm"
                            disabled={busy || topicIndex >= contentTopics.length - 1}
                            aria-label={tr("admin_community_sort_down")}
                            onClick={() => void moveSort(topic, 1)}
                          >
                            {tr("admin_community_sort_down")}
                          </AdminActionButton>
                        </div>
                      </td>
                      <td className="py-2.5 pr-2 text-sam-fg">
                        {topic.name}
                        {topic.name_en ? (
                          <span className="ml-1 text-sam-muted sam-text-xxs">· {topic.name_en}</span>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-2">
                        {stats.postCount > 0 ? (
                          <Link href={postsHref} className={countLinkClass}>
                            {stats.postCount}
                          </Link>
                        ) : (
                          <span className="tabular-nums text-sam-muted">0</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2">
                        {stats.commentCount > 0 ? (
                          <Link href={commentsHref} className={countLinkClass}>
                            {stats.commentCount}
                          </Link>
                        ) : (
                          <span className="tabular-nums text-sam-muted">0</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2">
                        {stats.reportCount > 0 ? (
                          <Link href={reportsHref} className={countLinkClass}>
                            {stats.reportCount}
                          </Link>
                        ) : (
                          <span className="tabular-nums text-sam-muted">0</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2">
                        {topic.is_active
                          ? tr("admin_community_ops_status_active")
                          : tr("admin_community_ops_status_inactive")}
                      </td>
                      <td className="py-2.5 pr-2">
                        {topic.is_visible
                          ? tr("admin_community_visibility_on")
                          : tr("admin_community_visibility_off")}
                      </td>
                      <td className="py-2.5">
                        <span className="flex flex-wrap gap-1">
                          <AdminActionButton variant="ghost" size="sm" disabled={busy} onClick={() => setEdit({ ...topic })}>
                            {tr("admin_topics_btn_edit")}
                          </AdminActionButton>
                          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => void toggleActive(topic)}>
                            {topic.is_active ? "사용 중지" : "다시 사용"}
                          </AdminActionButton>
                        </span>
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
