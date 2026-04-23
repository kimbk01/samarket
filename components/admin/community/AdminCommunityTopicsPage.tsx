"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { CommunitySectionAdminRow } from "@/lib/community-feed/types";
import type { CommunityTopicAdminRow } from "@/lib/community-topics/server";
import { normalizeFeedSlug, normalizeSectionSlug } from "@/lib/community-feed/constants";
import {
  COMMUNITY_FEED_LIST_SKIN_LABELS,
  COMMUNITY_FEED_LIST_SKINS,
  type CommunityFeedListSkin,
} from "@/lib/community-feed/topic-feed-skin";
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
  t: CommunityTopicAdminRow,
  philifeNeighborhoodSectionSlug: string
): string {
  if (
    qualifiesForPhilifeMeetupAdminList(
      t.allow_meetup,
      t.slug,
      t.section_slug,
      philifeNeighborhoodSectionSlug
    )
  ) {
    return "모임";
  }
  if (t.is_feed_sort) {
    return t.feed_sort_mode === "recommended" ? "추천" : "인기";
  }
  return "일반";
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
      alert("섹션을 선택하세요.");
      return;
    }
    const chosenSectionSlug = sections.find((s) => s.id === sectionId)?.slug;
    if (!topicBelongsToPhilifeNeighborhoodSection(chosenSectionSlug, philifeNeighborhoodSectionSlug)) {
      alert(
        `커뮤니티 앱과 연동되는 주제는 동네 피드 섹션(${philifeNeighborhoodSectionSlug})에만 둘 수 있습니다. 모임 만들기 피드 주제는 이 섹션의 「모임」 탭 목록과 1:1로 맞습니다. 피드 섹션은 「피드 섹션 관리」에서 바꿀 수 있습니다.`
      );
      return;
    }
    const finalSlug = slug || normalizeFeedSlug(name);
    if (menuTab === "meetup" && isPhilifeGeneralOnlyTopicSlug(finalSlug)) {
      alert(
        "이 slug는 일반 게시판 전용입니다. 모임 피드에는 연결되지 않습니다. 운동·취미·모임·소모임 등 다른 slug를 쓰거나 「일반 게시판」 탭에서 추가하세요."
      );
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
          j.error === "slug_duplicate_in_section"
            ? "같은 섹션에 동일 slug가 있습니다."
            : j.error ?? "저장 실패"
        );
        return;
      }
      setName("");
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
      alert(
        `이 화면의 주제는 동네 피드 섹션(${philifeNeighborhoodSectionSlug})에 있어야 앱 피드·모임 만들기와 연동됩니다.`
      );
      return;
    }
    if (edit.allow_meetup && isPhilifeGeneralOnlyTopicSlug(edit.slug)) {
      alert(
        "일반 게시판 전용 slug는 「모임」으로 설정할 수 없습니다. slug를 변경하거나 「일반 게시판」에서만 사용하도록 allow_meetup을 끄세요."
      );
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
          j.error === "slug_duplicate_in_section"
            ? "같은 섹션에 동일 slug가 있습니다."
            : j.error ?? "저장 실패"
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
    if (!confirm("이 주제를 삭제할까요? 글이 있으면 삭제되지 않습니다.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/topics/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await res.json();
      if (!j.ok) {
        alert(
          j.error === "topic_has_posts"
            ? "이 주제에 글이 있어 삭제할 수 없습니다. 비활성화하세요."
            : j.error ?? "삭제 실패"
        );
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const headerDescription =
    menuTab === "meetup"
      ? `섹션: ${philifeNeighborhoodSectionSlug} · 모임 만들기와 동일 목록`
      : `섹션: ${philifeNeighborhoodSectionSlug} · 일반(추가) / 아래는 전체`;

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
        alert(
          j.error === "forbidden"
            ? "권한이 없습니다."
            : String(j.error ?? "저장 실패")
        );
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
        alert(
          j.error === "forbidden"
            ? "권한이 없습니다."
            : String(j.error ?? "저장 실패")
        );
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
        title="피드 주제 관리"
        backHref="/admin/philife/sections"
        description={headerDescription}
        titleClassName="text-[1.5rem] font-bold leading-tight tracking-tight text-sam-fg"
        descriptionClassName="mt-1.5 max-w-3xl font-normal leading-relaxed text-sam-muted sam-text-body-secondary"
      />

      <AdminCard title="필라이프 피드 상단 「전체」탭" titleClassName="sam-text-section-title text-sam-fg">
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
              <span>노출(필라이프 홈 가로탭에「전체」칩)</span>
            </label>
            <button
              type="button"
              disabled={busy || showAllFeedTab === showAllFeedTabSaved}
              onClick={() => void saveShowAllFeedTab()}
              className="self-start rounded-ui-rect bg-sam-ink px-3.5 py-2 text-white transition-opacity sam-text-body-secondary font-medium enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 sm:self-center"
            >
              저장
            </button>
          </div>
        ) : (
          <p className="text-sam-muted sam-text-helper" aria-hidden>
            설정을 불러오는 중…
          </p>
        )}
      </AdminCard>

      <AdminCard title="「관심이웃 글만 보기」필터" titleClassName="sam-text-section-title text-sam-fg">
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
              <span>노출(체크·안내 문구가 있는 띠 전체)</span>
            </label>
            <button
              type="button"
              disabled={busy || showNeighborOnlyFilter === showNeighborOnlyFilterSaved}
              onClick={() => void saveShowNeighborOnlyFilter()}
              className="self-start rounded-ui-rect bg-sam-ink px-3.5 py-2 text-white transition-opacity sam-text-body-secondary font-medium enabled:hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50 sm:self-center"
            >
              저장
            </button>
          </div>
        ) : (
          <p className="text-sam-muted sam-text-helper" aria-hidden>
            설정을 불러오는 중…
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
          <span>일반·피드</span>
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
          <span>모임</span>
        </button>
      </div>

      <AdminCard
        title={menuTab === "meetup" ? "모임 피드 주제 추가" : "일반 게시판 주제 추가"}
        titleClassName="sam-text-section-title text-sam-fg"
      >
        {sections.length === 0 ? (
          <p className="mb-3 sam-text-body-secondary text-amber-800">
            등록된 섹션이 없습니다.{" "}
            <a href="/admin/philife/sections" className="font-medium text-blue-600 hover:underline">
              피드 섹션 관리
            </a>
            에서 먼저 추가하세요.
          </p>
        ) : null}
        <form
          onSubmit={onCreate}
          className="flex flex-col gap-3.5 text-sam-fg sam-text-body-secondary"
        >
          <div className="flex flex-wrap items-end gap-2.5 sm:gap-3">
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">섹션</span>
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
              <span className="text-sam-muted sam-text-helper">이름</span>
              <input
                className="min-h-10 min-w-[6rem] rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">slug</span>
              <input
                className="min-h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 font-mono text-sam-fg sam-text-helper"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">정렬</span>
              <input
                type="number"
                className="h-10 w-20 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 self-end pb-1.5 text-sam-fg sam-text-body-secondary">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              활성
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 self-end pb-1.5 text-sam-fg sam-text-body-secondary">
              <input type="checkbox" checked={isVisible} onChange={(e) => setIsVisible(e.target.checked)} />
              노출
            </label>
            <label className="flex cursor-pointer items-center gap-1.5 self-end pb-1.5 text-sam-fg sam-text-body-secondary">
              <input type="checkbox" checked={allowQuestion} onChange={(e) => setAllowQuestion(e.target.checked)} />
              질문
            </label>
            <label className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">색(hex 등)</span>
              <input
                className="h-10 w-28 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 font-mono text-sam-fg sam-text-helper"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#..."
              />
            </label>
            <label className="flex min-w-[200px] flex-col gap-0.5">
              <span className="text-sam-muted sam-text-helper">피드 목록 스킨</span>
              <select
                className="min-h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg sam-text-helper"
                value={feedListSkin}
                onChange={(e) => setFeedListSkin(e.target.value as CommunityFeedListSkin)}
              >
                {COMMUNITY_FEED_LIST_SKINS.map((k) => (
                  <option key={k} value={k}>
                    {COMMUNITY_FEED_LIST_SKIN_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={busy || sections.length === 0}
              className="self-end rounded-ui-rect bg-sam-ink px-3.5 py-2 text-white transition-opacity sam-text-body-secondary font-medium enabled:hover:opacity-95 disabled:opacity-50"
            >
              추가
            </button>
          </div>
        </form>
      </AdminCard>
      <AdminCard
        titleClassName="sam-text-section-title text-sam-fg"
        title={menuTab === "meetup" ? "모임 주제 (community_topics)" : "주제 (community_topics)"}
      >
        {topics.length === 0 ? (
          <div className="space-y-2 sam-text-body-secondary text-amber-900">
            <p className="font-medium">주제 행이 없습니다.</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sam-fg">
              <li>
                Supabase 대시보드 → SQL Editor에서{" "}
                <code className="rounded bg-sam-surface-muted px-1 font-mono sam-text-helper">20260321120000_community_feed_daangn.sql</code>{" "}
                전체를 실행해 <code className="font-mono sam-text-helper">community_sections</code>,{" "}
                <code className="font-mono sam-text-helper">community_topics</code>, 시드 데이터가 생겼는지 확인하세요.
              </li>
              <li>
                섹션만 있고 주제가 0이면, 위 마이그레이션의 <code className="font-mono sam-text-helper">INSERT</code> 구간이
                스킵됐을 수 있습니다. 같은 파일을 다시 실행하거나 주제 추가 폼으로 수동 생성하세요.
              </li>
              <li>
                목록 카드 스킨 컬럼은{" "}
                <code className="rounded bg-sam-surface-muted px-1 font-mono sam-text-helper">
                  20260321180000_community_topics_feed_list_skin.sql
                </code>
                입니다. 아직 없어도 목록 조회는 기본 스킨으로 동작하도록 서버에서 폴백합니다.
              </li>
            </ul>
          </div>
        ) : filteredTopics.length === 0 ? (
          <p className="sam-text-body-secondary text-sam-muted">
            {menuTab === "meetup"
              ? `동네 피드 섹션(${philifeNeighborhoodSectionSlug})에 모임 피드 주제가 없습니다. 위에서 해당 섹션을 고르고 추가하거나, 일반 전용이 아닌 slug로 allow_meetup을 켠 주제를 넣어 주세요.`
              : `필터에 맞는 주제가 없습니다. 위에서 추가하거나, 마이그레이션을 확인하세요.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-left text-sam-fg sam-text-body-secondary">
              <thead>
                <tr className="border-b border-sam-border text-sam-meta">
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">섹션</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">slug</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">이름</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">목록 스킨</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">정렬</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">노출</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">구분</th>
                  <th className="px-0 py-2.5 pr-2 text-left font-medium sam-text-helper">활성</th>
                  <th className="px-0 py-2.5 text-left font-medium sam-text-helper">작업</th>
                </tr>
              </thead>
              <tbody>
                {filteredTopics.map((t) =>
                  edit?.id === t.id ? (
                    <tr key={t.id} className="border-b border-sam-border-soft bg-amber-50/40 align-top">
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
                              {COMMUNITY_FEED_LIST_SKIN_LABELS[k]}
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
                            aria-label="피드 인기·추천"
                          >
                            <option value="popular">인기</option>
                            <option value="recommended">추천</option>
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
                                  alert("이 slug는 일반 전용입니다. 모임으로 쓰려면 모임에 맞는 slug로 바꾸세요.");
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
                            <option value="general">일반 게시판(주제)</option>
                            <option value="meetup">모임 피드</option>
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
                          className="mr-2 text-blue-600 hover:underline disabled:opacity-50"
                          onClick={saveEdit}
                        >
                          저장
                        </button>
                        <button type="button" className="text-sam-muted hover:underline" onClick={() => setEdit(null)}>
                          취소
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={t.id} className="border-b border-sam-border-soft">
                      <td className="py-2.5 pr-2 text-sam-fg">
                        {t.section_name ?? "—"}{" "}
                        <span className="font-mono sam-text-xxs text-sam-meta">({t.section_slug})</span>
                      </td>
                      <td className="py-2.5 pr-2 font-mono sam-text-helper">{t.slug}</td>
                      <td className="py-2.5 pr-2 text-sam-fg">{t.name}</td>
                      <td
                        className="max-w-[200px] truncate py-2.5 pr-2 sam-text-xxs text-sam-muted"
                        title={COMMUNITY_FEED_LIST_SKIN_LABELS[t.feed_list_skin]}
                      >
                        {COMMUNITY_FEED_LIST_SKIN_LABELS[t.feed_list_skin]}
                      </td>
                      <td className="py-2.5 pr-2">{t.sort_order}</td>
                      <td className="py-2.5 pr-2">{t.is_visible ? "Y" : "N"}</td>
                      <td className="max-w-[10rem] py-2.5 pr-2 sam-text-xxs text-sam-fg">
                        {labelAdminFeedTopicRow(t, philifeNeighborhoodSectionSlug)}
                      </td>
                      <td className="py-2.5 pr-2">{t.is_active ? "Y" : "N"}</td>
                      <td className="py-2.5">
                        <button
                          type="button"
                          className="mr-2 text-blue-600 hover:underline"
                          onClick={() => setEdit({ ...t })}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={t.is_feed_sort}
                          title={t.is_feed_sort ? "기본 피드 항목 — 삭제 대신 비활성·노출 조정 권장" : undefined}
                          onClick={() => removeRow(t.id)}
                        >
                          삭제
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
