"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { CommunitySectionAdminRow } from "@/lib/community-feed/types";
import type { CommunityTopicAdminRow } from "@/lib/community-topics/server";
import { normalizeFeedSlug } from "@/lib/community-feed/constants";
import {
  COMMUNITY_FEED_LIST_SKIN_LABELS,
  COMMUNITY_FEED_LIST_SKINS,
  type CommunityFeedListSkin,
} from "@/lib/community-feed/topic-feed-skin";

export function AdminCommunityTopicsPage({
  sections,
  topics: initial,
}: {
  sections: CommunitySectionAdminRow[];
  topics: CommunityTopicAdminRow[];
}) {
  const router = useRouter();
  const [topics, setTopics] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [isFeedSort, setIsFeedSort] = useState(false);
  const [allowQuestion, setAllowQuestion] = useState(true);
  const [allowMeetup, setAllowMeetup] = useState(false);
  const [color, setColor] = useState("");
  const [feedListSkin, setFeedListSkin] = useState<CommunityFeedListSkin>("compact_media");
  const [edit, setEdit] = useState<CommunityTopicAdminRow | null>(null);

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
    setBusy(true);
    try {
      const res = await fetch("/api/admin/community/topics", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_id: sectionId,
          name,
          slug: slug || normalizeFeedSlug(name),
          sort_order: sortOrder,
          is_active: isActive,
          is_visible: isVisible,
          is_feed_sort: isFeedSort,
          allow_question: allowQuestion,
          allow_meetup: allowMeetup,
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
      setAllowMeetup(false);
      setColor("");
      setFeedListSkin("compact_media");
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

  return (
    <div className="space-y-4">
      <AdminPageHeader title="피드 주제 관리" backHref="/admin/community/sections" />
      <AdminCard title="주제 추가">
        {sections.length === 0 ? (
          <p className="mb-3 text-[13px] text-amber-800">
            등록된 섹션이 없습니다.{" "}
            <a href="/admin/community/sections" className="font-medium text-blue-600 hover:underline">
              피드 섹션 관리
            </a>
            에서 먼저 추가하세요.
          </p>
        ) : null}
        <form onSubmit={onCreate} className="flex flex-col gap-3 text-[13px]">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-500">섹션</span>
              <select
                className="rounded border border-gray-200 px-2 py-1.5"
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
              <span className="text-gray-500">이름</span>
              <input
                className="rounded border border-gray-200 px-2 py-1.5"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-500">slug</span>
              <input
                className="rounded border border-gray-200 px-2 py-1.5 font-mono text-[12px]"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-500">정렬</span>
              <input
                type="number"
                className="w-20 rounded border border-gray-200 px-2 py-1.5"
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
            <label className="flex items-center gap-1 pb-1.5">
              <input type="checkbox" checked={allowMeetup} onChange={(e) => setAllowMeetup(e.target.checked)} />
              모임
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-gray-500">색(hex 등)</span>
              <input
                className="w-28 rounded border border-gray-200 px-2 py-1.5"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#..."
              />
            </label>
            <label className="flex min-w-[200px] flex-col gap-0.5">
              <span className="text-gray-500">피드 목록 스킨</span>
              <select
                className="rounded border border-gray-200 px-2 py-1.5 text-[12px]"
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
              className="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-50"
            >
              추가
            </button>
          </div>
          <p className="text-[12px] text-gray-500">
            정렬칩(<code className="rounded bg-gray-100 px-1">is_feed_sort</code>)은 추천·인기 등 필터 전용입니다. 목록 스킨은 주제별
            피드 카드 레이아웃(당근형 썸네일·텍스트·장소·태그)을 바꿉니다.
          </p>
        </form>
      </AdminCard>
      <AdminCard title="주제 목록 (community_topics + 섹션)">
        {topics.length === 0 ? (
          <div className="space-y-2 text-[13px] text-amber-900">
            <p className="font-medium">주제 행이 없습니다.</p>
            <ul className="list-disc space-y-1.5 pl-5 text-gray-700">
              <li>
                Supabase 대시보드 → SQL Editor에서{" "}
                <code className="rounded bg-gray-100 px-1 font-mono text-[12px]">20260321120000_community_feed_daangn.sql</code>{" "}
                전체를 실행해 <code className="font-mono text-[12px]">community_sections</code>,{" "}
                <code className="font-mono text-[12px]">community_topics</code>, 시드 데이터가 생겼는지 확인하세요.
              </li>
              <li>
                섹션만 있고 주제가 0이면, 위 마이그레이션의 <code className="font-mono text-[12px]">INSERT</code> 구간이
                스킵됐을 수 있습니다. 같은 파일을 다시 실행하거나 주제 추가 폼으로 수동 생성하세요.
              </li>
              <li>
                목록 카드 스킨 컬럼은{" "}
                <code className="rounded bg-gray-100 px-1 font-mono text-[12px]">
                  20260321180000_community_topics_feed_list_skin.sql
                </code>
                입니다. 아직 없어도 목록 조회는 기본 스킨으로 동작하도록 서버에서 폴백합니다.
              </li>
            </ul>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="py-2 pr-2 font-medium">섹션</th>
                  <th className="py-2 pr-2 font-medium">slug</th>
                  <th className="py-2 pr-2 font-medium">이름</th>
                  <th className="py-2 pr-2 font-medium">목록 스킨</th>
                  <th className="py-2 pr-2 font-medium">정렬</th>
                  <th className="py-2 pr-2 font-medium">노출</th>
                  <th className="py-2 pr-2 font-medium">정렬칩</th>
                  <th className="py-2 pr-2 font-medium">활성</th>
                  <th className="py-2 font-medium">작업</th>
                </tr>
              </thead>
              <tbody>
                {topics.map((t) =>
                  edit?.id === t.id ? (
                    <tr key={t.id} className="border-b border-gray-100 bg-amber-50/40 align-top">
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
                      <td className="py-2">
                        <button
                          type="button"
                          disabled={busy}
                          className="mr-2 text-blue-600 hover:underline disabled:opacity-50"
                          onClick={saveEdit}
                        >
                          저장
                        </button>
                        <button type="button" className="text-gray-500 hover:underline" onClick={() => setEdit(null)}>
                          취소
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={t.id} className="border-b border-gray-100">
                      <td className="py-2 pr-2 text-gray-900">
                        {t.section_name ?? "—"}{" "}
                        <span className="font-mono text-[11px] text-gray-400">({t.section_slug})</span>
                      </td>
                      <td className="py-2 pr-2 font-mono text-[12px]">{t.slug}</td>
                      <td className="py-2 pr-2 text-gray-900">{t.name}</td>
                      <td
                        className="max-w-[200px] truncate py-2 pr-2 text-[11px] text-gray-600"
                        title={COMMUNITY_FEED_LIST_SKIN_LABELS[t.feed_list_skin]}
                      >
                        {COMMUNITY_FEED_LIST_SKIN_LABELS[t.feed_list_skin]}
                      </td>
                      <td className="py-2 pr-2">{t.sort_order}</td>
                      <td className="py-2 pr-2">{t.is_visible ? "Y" : "N"}</td>
                      <td className="py-2 pr-2">{t.is_feed_sort ? "Y" : "N"}</td>
                      <td className="py-2 pr-2">{t.is_active ? "Y" : "N"}</td>
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
