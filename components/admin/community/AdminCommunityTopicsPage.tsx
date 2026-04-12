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
  qualifiesForPhilifeGeneralAdminList,
  qualifiesForPhilifeMeetupAdminList,
  topicBelongsToPhilifeNeighborhoodSection,
} from "@/lib/neighborhood/meetup-feed-topics";

/**
 * 커뮤니티 피드 주제 구조와 동일하게 나눔:
 * - general: 일반 게시판 글 (`allow_meetup` false) — 피드·댓글만, 작성자 1:1 문의(DM) 허용
 * - meetup: 모임 (`allow_meetup` true) — 모임방 단체 채팅, 게시글 문의 DM 비허용
 */
type TopicsMenuTab = "general" | "meetup";

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
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [isFeedSort, setIsFeedSort] = useState(false);
  const [allowQuestion, setAllowQuestion] = useState(true);
  const [color, setColor] = useState("");
  const [feedListSkin, setFeedListSkin] = useState<CommunityFeedListSkin>("compact_media");
  const [edit, setEdit] = useState<CommunityTopicAdminRow | null>(null);
  const [menuTab, setMenuTab] = useState<TopicsMenuTab>("general");

  const filteredTopics = useMemo(() => {
    if (menuTab === "meetup") {
      return topics.filter((t) =>
        qualifiesForPhilifeMeetupAdminList(t.allow_meetup, t.slug, t.section_slug, philifeNeighborhoodSectionSlug)
      );
    }
    return topics.filter((t) =>
      qualifiesForPhilifeGeneralAdminList(t.allow_meetup, t.slug, t.section_slug, philifeNeighborhoodSectionSlug)
    );
  }, [topics, menuTab, philifeNeighborhoodSectionSlug]);

  useEffect(() => {
    if (!edit) return;
    const inMeetupTab = qualifiesForPhilifeMeetupAdminList(
      edit.allow_meetup,
      edit.slug,
      edit.section_slug,
      philifeNeighborhoodSectionSlug
    );
    const inGeneralTab = qualifiesForPhilifeGeneralAdminList(
      edit.allow_meetup,
      edit.slug,
      edit.section_slug,
      philifeNeighborhoodSectionSlug
    );
    const inTab = menuTab === "meetup" ? inMeetupTab : inGeneralTab;
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
          is_feed_sort: isFeedSort,
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
      setIsFeedSort(false);
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
      ? `동네 피드 섹션(${philifeNeighborhoodSectionSlug})만 표시·저장 가능. 목록은 모임 만들기 폼 피드 주제(API)와 동일합니다. 일반 전용 slug·다른 섹션 주제는 제외.`
      : `동네 피드 섹션(${philifeNeighborhoodSectionSlug})의 일반 게시판 주제만 표시합니다. 커뮤니티 동네 피드 칩·글쓰기 주제·게시판 주제 필터는 여기서 보이는 주제(노출·비모임·정렬칩 제외)와 동기됩니다.`;

  return (
    <div className="space-y-4">
      <AdminPageHeader title="피드 주제 관리" backHref="/admin/philife/sections" description={headerDescription} />

      <div className="flex flex-wrap gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-1.5 shadow-sm">
        <button
          type="button"
          onClick={() => setMenuTab("general")}
          className={`flex min-h-[44px] flex-1 flex-col items-center justify-center rounded-ui-rect px-4 py-2 text-[14px] font-semibold transition-colors sm:flex-none sm:px-8 ${
            menuTab === "general"
              ? "bg-sam-ink text-white shadow-sm"
              : "bg-transparent text-sam-muted hover:bg-sam-app"
          }`}
        >
          <span>일반 게시판</span>
          <span className="text-[10px] font-normal opacity-80">문의 DM 가능</span>
        </button>
        <button
          type="button"
          onClick={() => setMenuTab("meetup")}
          className={`flex min-h-[44px] flex-1 flex-col items-center justify-center rounded-ui-rect px-4 py-2 text-[14px] font-semibold transition-colors sm:flex-none sm:px-8 ${
            menuTab === "meetup"
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-transparent text-sam-muted hover:bg-sam-app"
          }`}
        >
          <span>모임</span>
          <span className="text-[10px] font-normal opacity-80">모임방 채팅</span>
        </button>
      </div>

      <AdminCard title={menuTab === "meetup" ? "모임 피드 주제 추가" : "일반 게시판 주제 추가"}>
        {sections.length === 0 ? (
          <p className="mb-3 text-[13px] text-amber-800">
            등록된 섹션이 없습니다.{" "}
            <a href="/admin/philife/sections" className="font-medium text-blue-600 hover:underline">
              피드 섹션 관리
            </a>
            에서 먼저 추가하세요.
          </p>
        ) : null}
        <form onSubmit={onCreate} className="flex flex-col gap-3 text-[13px]">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-sam-muted">섹션</span>
              <select
                className="rounded border border-sam-border px-2 py-1.5"
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
            <label className="flex flex-col gap-0.5">
              <span className="text-sam-muted">이름</span>
              <input
                className="rounded border border-sam-border px-2 py-1.5"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-sam-muted">slug</span>
              <input
                className="rounded border border-sam-border px-2 py-1.5 font-mono text-[12px]"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-sam-muted">정렬</span>
              <input
                type="number"
                className="w-20 rounded border border-sam-border px-2 py-1.5"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
              />
            </label>
            <label className="flex items-center gap-1 pb-1.5">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              활성
            </label>
            <label className="flex items-center gap-1 pb-1.5">
              <input type="checkbox" checked={isVisible} onChange={(e) => setIsVisible(e.target.checked)} />
              노출
            </label>
            <label className="flex items-center gap-1 pb-1.5">
              <input type="checkbox" checked={isFeedSort} onChange={(e) => setIsFeedSort(e.target.checked)} />
              정렬칩
            </label>
            <label className="flex items-center gap-1 pb-1.5">
              <input type="checkbox" checked={allowQuestion} onChange={(e) => setAllowQuestion(e.target.checked)} />
              질문
            </label>
            <div className="flex flex-col justify-end pb-1.5">
              <span className="text-[11px] font-medium text-sam-muted">
                분류: {menuTab === "meetup" ? "모임 피드" : "일반 게시판"}
              </span>
              <span className="max-w-[220px] text-[10px] leading-tight text-sam-meta">
                {menuTab === "meetup"
                  ? "동네 섹션 + 모임 API와 같은 목록만 여기에 표시됩니다."
                  : "동네 섹션 일반 주제만 여기에 표시됩니다."}
              </span>
            </div>
            <label className="flex flex-col gap-0.5">
              <span className="text-sam-muted">색(hex 등)</span>
              <input
                className="w-28 rounded border border-sam-border px-2 py-1.5"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#..."
              />
            </label>
            <label className="flex min-w-[200px] flex-col gap-0.5">
              <span className="text-sam-muted">피드 목록 스킨</span>
              <select
                className="rounded border border-sam-border px-2 py-1.5 text-[12px]"
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
              className="rounded bg-sam-ink px-3 py-1.5 text-white disabled:opacity-50"
            >
              추가
            </button>
          </div>
          <p className="text-[12px] text-sam-muted">
            정렬칩(<code className="rounded bg-sam-surface-muted px-1">is_feed_sort</code>)은 추천·인기 등 필터 전용입니다. 목록 스킨은 주제별
            피드 카드 레이아웃(당근형 썸네일·텍스트·장소·태그)을 바꿉니다.
          </p>
        </form>
      </AdminCard>
      <AdminCard
        title={
          menuTab === "meetup"
            ? "모임 피드 주제 목록 (community_topics)"
            : "일반 게시판 주제 목록 (community_topics)"
        }
      >
        {topics.length === 0 ? (
          <div className="space-y-2 text-[13px] text-amber-900">
            <p className="font-medium">주제 행이 없습니다.</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sam-fg">
              <li>
                Supabase 대시보드 → SQL Editor에서{" "}
                <code className="rounded bg-sam-surface-muted px-1 font-mono text-[12px]">20260321120000_community_feed_daangn.sql</code>{" "}
                전체를 실행해 <code className="font-mono text-[12px]">community_sections</code>,{" "}
                <code className="font-mono text-[12px]">community_topics</code>, 시드 데이터가 생겼는지 확인하세요.
              </li>
              <li>
                섹션만 있고 주제가 0이면, 위 마이그레이션의 <code className="font-mono text-[12px]">INSERT</code> 구간이
                스킵됐을 수 있습니다. 같은 파일을 다시 실행하거나 주제 추가 폼으로 수동 생성하세요.
              </li>
              <li>
                목록 카드 스킨 컬럼은{" "}
                <code className="rounded bg-sam-surface-muted px-1 font-mono text-[12px]">
                  20260321180000_community_topics_feed_list_skin.sql
                </code>
                입니다. 아직 없어도 목록 조회는 기본 스킨으로 동작하도록 서버에서 폴백합니다.
              </li>
            </ul>
          </div>
        ) : filteredTopics.length === 0 ? (
          <p className="text-[13px] text-sam-muted">
            {menuTab === "meetup"
              ? `동네 피드 섹션(${philifeNeighborhoodSectionSlug})에 모임 피드 주제가 없습니다. 위에서 해당 섹션을 고르고 추가하거나, 일반 전용이 아닌 slug로 allow_meetup을 켠 주제를 넣어 주세요.`
              : `동네 피드 섹션(${philifeNeighborhoodSectionSlug})에 일반 게시판 주제가 없습니다. 위 폼에서 추가하세요.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-sam-border text-sam-muted">
                  <th className="py-2 pr-2 font-medium">섹션</th>
                  <th className="py-2 pr-2 font-medium">slug</th>
                  <th className="py-2 pr-2 font-medium">이름</th>
                  <th className="py-2 pr-2 font-medium">목록 스킨</th>
                  <th className="py-2 pr-2 font-medium">정렬</th>
                  <th className="py-2 pr-2 font-medium">노출</th>
                  <th className="py-2 pr-2 font-medium">정렬칩</th>
                  <th className="py-2 pr-2 font-medium">활성</th>
                  <th className="py-2 pr-2 font-medium">분류 전환</th>
                  <th className="py-2 font-medium">작업</th>
                </tr>
              </thead>
              <tbody>
                {filteredTopics.map((t) =>
                  edit?.id === t.id ? (
                    <tr key={t.id} className="border-b border-sam-border-soft bg-amber-50/40 align-top">
                      <td className="py-2 pr-2">
                        <select
                          className="max-w-[140px] rounded border px-1 py-1 text-[12px]"
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
                      <td className="py-2 pr-2">
                        <input
                          className="w-full rounded border px-1 py-1 font-mono text-[12px]"
                          value={edit.slug}
                          onChange={(e) => setEdit({ ...edit, slug: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className="w-full rounded border px-1 py-1"
                          value={edit.name}
                          onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pr-2 align-top">
                        <select
                          className="max-w-[220px] rounded border px-1 py-1 text-[11px]"
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
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          className="w-14 rounded border px-1 py-1"
                          value={edit.sort_order}
                          onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={edit.is_visible}
                          onChange={(e) => setEdit({ ...edit, is_visible: e.target.checked })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={edit.is_feed_sort}
                          onChange={(e) => setEdit({ ...edit, is_feed_sort: e.target.checked })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={edit.is_active}
                          onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <label className="flex cursor-pointer items-center gap-1 text-[11px] text-sam-fg">
                          <input
                            type="checkbox"
                            title="모임 피드로 전환"
                            checked={edit.allow_meetup}
                            onChange={(e) => setEdit({ ...edit, allow_meetup: e.target.checked })}
                          />
                          모임
                        </label>
                      </td>
                      <td className="py-2">
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
                      <td className="py-2 pr-2 text-sam-fg">
                        {t.section_name ?? "—"}{" "}
                        <span className="font-mono text-[11px] text-sam-meta">({t.section_slug})</span>
                      </td>
                      <td className="py-2 pr-2 font-mono text-[12px]">{t.slug}</td>
                      <td className="py-2 pr-2 text-sam-fg">{t.name}</td>
                      <td
                        className="max-w-[200px] truncate py-2 pr-2 text-[11px] text-sam-muted"
                        title={COMMUNITY_FEED_LIST_SKIN_LABELS[t.feed_list_skin]}
                      >
                        {COMMUNITY_FEED_LIST_SKIN_LABELS[t.feed_list_skin]}
                      </td>
                      <td className="py-2 pr-2">{t.sort_order}</td>
                      <td className="py-2 pr-2">{t.is_visible ? "Y" : "N"}</td>
                      <td className="py-2 pr-2">{t.is_feed_sort ? "Y" : "N"}</td>
                      <td className="py-2 pr-2">{t.is_active ? "Y" : "N"}</td>
                      <td className="py-2 pr-2 text-[11px] text-sam-muted">
                        {t.allow_meetup ? "모임" : "일반"}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          className="mr-2 text-blue-600 hover:underline"
                          onClick={() => setEdit({ ...t })}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
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
