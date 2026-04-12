"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminCard } from "@/components/admin/AdminCard";
import type { CommunitySectionAdminRow } from "@/lib/community-feed/types";
import { normalizeFeedSlug, normalizeSectionSlug } from "@/lib/community-feed/constants";

export function AdminCommunitySectionsPage({
  sections: initial,
  philifeNeighborhoodSectionSlug: initialPhilifeSlug,
}: {
  sections: CommunitySectionAdminRow[];
  philifeNeighborhoodSectionSlug: string;
}) {
  const router = useRouter();
  const [sections, setSections] = useState(initial);
  const [philifeSectionSlug, setPhilifeSectionSlug] = useState(initialPhilifeSlug);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setPhilifeSectionSlug(initialPhilifeSlug);
  }, [initialPhilifeSlug]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [edit, setEdit] = useState<CommunitySectionAdminRow | null>(null);

  async function refresh() {
    const res = await fetch("/api/admin/community/sections", { credentials: "include", cache: "no-store" });
    const j = await res.json();
    if (j.ok && Array.isArray(j.sections)) setSections(j.sections);
    const r2 = await fetch("/api/admin/community/philife-neighborhood-section", {
      credentials: "include",
      cache: "no-store",
    });
    const j2 = await r2.json();
    if (j2.ok && typeof j2.section_slug === "string") setPhilifeSectionSlug(j2.section_slug);
    router.refresh();
  }

  async function savePhilifeNeighborhoodSection(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/community/philife-neighborhood-section", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_slug: philifeSectionSlug }),
      });
      const j = await res.json();
      if (!j.ok) {
        alert(
          j.error === "unknown_or_inactive_section"
            ? "활성화된 섹션 목록에 없는 slug입니다. 아래 표에서 slug를 확인하세요."
            : j.error ?? "저장 실패"
        );
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/community/sections", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug: slug || normalizeFeedSlug(name),
          sort_order: sortOrder,
          is_active: isActive,
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        alert(j.error === "slug_duplicate" ? "이미 사용 중인 slug입니다." : j.error ?? "저장 실패");
        return;
      }
      setName("");
      setSlug("");
      setSortOrder(0);
      setIsActive(true);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/sections/${edit.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: edit.name,
          slug: edit.slug,
          sort_order: edit.sort_order,
          is_active: edit.is_active,
        }),
      });
      const j = await res.json();
      if (!j.ok) {
        alert(j.error === "slug_duplicate" ? "이미 사용 중인 slug입니다." : j.error ?? "저장 실패");
        return;
      }
      setEdit(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(id: string) {
    if (!confirm("이 섹션을 삭제할까요? 글이 있으면 삭제되지 않습니다.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/sections/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await res.json();
      if (!j.ok) {
        alert(
          j.error === "section_has_posts"
            ? "이 섹션에 연결된 글이 있어 삭제할 수 없습니다. 비활성화하세요."
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
      <AdminPageHeader title="피드 섹션 관리" backHref="/admin/boards" />
      <AdminCard title="동네 피드에 쓸 섹션 (필라이프·앱 연동)">
        <p className="mb-3 text-[13px] text-sam-muted">
          커뮤니티 동네 피드 칩·글쓰기 주제·모임 만들기 주제는 이 slug의{" "}
          <a href="/admin/philife/topics" className="font-medium text-blue-600 hover:underline">
            피드 주제
          </a>
          와 연동됩니다. 미설정 시 기본 <code className="rounded bg-sam-surface-muted px-1">dongnae</code>입니다. 저장 위치:{" "}
          <code className="rounded bg-sam-surface-muted px-1">admin_settings.philife_neighborhood_section</code>
        </p>
        <form onSubmit={savePhilifeNeighborhoodSection} className="flex flex-wrap items-end gap-2 text-[13px]">
          <label className="flex flex-col gap-0.5">
            <span className="text-sam-muted">섹션 slug</span>
            <select
              className="min-w-[200px] rounded border border-sam-border px-2 py-1.5 font-mono text-[12px]"
              value={
                sections.some(
                  (s) => s.is_active && normalizeSectionSlug(s.slug) === normalizeSectionSlug(philifeSectionSlug)
                )
                  ? sections.find(
                      (s) => s.is_active && normalizeSectionSlug(s.slug) === normalizeSectionSlug(philifeSectionSlug)
                    )?.slug ?? philifeSectionSlug
                  : philifeSectionSlug || ""
              }
              onChange={(e) => setPhilifeSectionSlug(e.target.value)}
            >
              <option value="">— 활성 섹션 선택 —</option>
              {philifeSectionSlug &&
                !sections.some(
                  (s) => s.is_active && normalizeSectionSlug(s.slug) === normalizeSectionSlug(philifeSectionSlug)
                ) && (
                  <option value={philifeSectionSlug}>
                    {philifeSectionSlug} (비활성·다시 지정 필요)
                  </option>
                )}
              {sections
                .filter((s) => s.is_active)
                .map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.slug} ({s.name})
                  </option>
                ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={busy || !philifeSectionSlug.trim()}
            className="rounded bg-sam-ink px-3 py-1.5 text-white disabled:opacity-50"
          >
            저장
          </button>
        </form>
      </AdminCard>
      <AdminCard title="섹션 추가">
        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2 text-[13px]">
          <label className="flex flex-col gap-0.5">
            <span className="text-sam-muted">이름</span>
            <input
              className="rounded border border-sam-border px-2 py-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="커뮤니티"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-sam-muted">slug (비우면 이름 기준)</span>
            <input
              className="rounded border border-sam-border px-2 py-1.5 font-mono text-[12px]"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="dongnae"
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
          <label className="flex items-center gap-1.5 pb-1.5">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            활성
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-sam-ink px-3 py-1.5 text-white disabled:opacity-50"
          >
            추가
          </button>
        </form>
      </AdminCard>
      <AdminCard title="섹션 목록 (community_sections)">
        {sections.length === 0 ? (
          <p className="text-[13px] text-amber-800">
            마이그레이션 <code className="rounded bg-sam-surface-muted px-1">20260321120000_community_feed_daangn.sql</code>을
            적용하세요.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-sam-border text-sam-muted">
                  <th className="py-2 pr-2 font-medium">slug</th>
                  <th className="py-2 pr-2 font-medium">이름</th>
                  <th className="py-2 pr-2 font-medium">정렬</th>
                  <th className="py-2 pr-2 font-medium">활성</th>
                  <th className="py-2 font-medium">작업</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) =>
                  edit?.id === s.id ? (
                    <tr key={s.id} className="border-b border-sam-border-soft bg-amber-50/40">
                      <td className="py-2 pr-2">
                        <input
                          className="w-full rounded border px-1.5 py-1 font-mono text-[12px]"
                          value={edit.slug}
                          onChange={(e) => setEdit({ ...edit, slug: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className="w-full rounded border px-1.5 py-1"
                          value={edit.name}
                          onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          className="w-16 rounded border px-1.5 py-1"
                          value={edit.sort_order}
                          onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) || 0 })}
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
                        <button type="button" className="text-sam-muted hover:underline" onClick={() => setEdit(null)}>
                          취소
                        </button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={s.id} className="border-b border-sam-border-soft">
                      <td className="py-2 pr-2 font-mono text-[12px]">{s.slug}</td>
                      <td className="py-2 pr-2 text-sam-fg">{s.name}</td>
                      <td className="py-2 pr-2">{s.sort_order}</td>
                      <td className="py-2 pr-2">{s.is_active ? "Y" : "N"}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          className="mr-2 text-blue-600 hover:underline"
                          onClick={() => setEdit({ ...s })}
                        >
                          수정
                        </button>
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={() => removeRow(s.id)}
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
        <p className="mt-4 text-[13px]">
          <a href="/admin/philife/topics" className="font-medium text-blue-600 hover:underline">
            주제 관리 →
          </a>{" "}
          ·{" "}
          <a href="/admin/philife/settings" className="font-medium text-blue-600 hover:underline">
            피드 운영 설정 →
          </a>
        </p>
      </AdminCard>
    </div>
  );
}
