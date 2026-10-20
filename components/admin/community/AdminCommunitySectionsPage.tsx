"use client";

/**
 * 커뮤니티 피드 섹션 (설계 §C-18). 표준 버튼 · 결과 배너(alert 없음) · 사용 중지·삭제 L1 확인 · 개발 문구 제거.
 */
import Link from "next/link";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminErrorState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import type { CommunitySectionAdminRow } from "@/lib/community-feed/types";
import { normalizeFeedSlug, normalizeSectionSlug } from "@/lib/community-feed/constants";

type Banner = { ok: true; message: string } | { ok: false; code: string } | null;

const INPUT = "rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[13px] text-sam-fg";

function sectionErrorText(code: unknown): string {
  switch (typeof code === "string" ? code : "") {
    case "slug_duplicate":
      return "같은 주소용 이름의 섹션이 이미 있습니다.";
    case "section_has_posts":
      return "이 섹션에 글이 있어 삭제할 수 없습니다. 「사용 중지」를 쓰세요.";
    case "unknown_or_inactive_section":
      return "사용 중인 섹션만 동네 피드 섹션으로 지정할 수 있습니다.";
    case "name_required":
    case "invalid_name":
      return "섹션 이름을 입력해 주세요.";
    case "invalid_slug":
      return "주소용 이름은 영문·숫자 2자 이상이어야 합니다.";
    case "not_found":
      return "섹션을 찾을 수 없습니다. 새로고침 후 다시 확인하세요.";
    case "forbidden":
    case "forbidden_permission":
      return "이 작업을 할 권한이 없습니다.";
    default:
      return adminOperatorErrorMessage(typeof code === "string" ? code : "", true);
  }
}

async function jsonOf(res: Response): Promise<{ ok?: boolean; error?: string; [k: string]: unknown }> {
  return (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
}

export function AdminCommunitySectionsPage({
  sections: initial,
  philifeNeighborhoodSectionSlug: initialPhilifeSlug,
  loadError: initialLoadError = null,
}: {
  sections: CommunitySectionAdminRow[];
  philifeNeighborhoodSectionSlug: string;
  /** 서버 조회 실패 코드 — 「등록된 섹션 없음」과 구분 */
  loadError?: string | null;
}) {
  const router = useRouter();
  const [sections, setSections] = useState(initial);
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(
    initialLoadError ? { code: initialLoadError, status: 500 } : null
  );
  const [philifeSectionSlug, setPhilifeSectionSlug] = useState(initialPhilifeSlug);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);
  useEffect(() => {
    setPhilifeSectionSlug(initialPhilifeSlug);
  }, [initialPhilifeSlug]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [edit, setEdit] = useState<CommunitySectionAdminRow | null>(null);

  const fail = (code: unknown) => setBanner({ ok: false, code: sectionErrorText(code) });

  async function refresh() {
    const res = await fetch("/api/admin/community/sections", { credentials: "include", cache: "no-store" });
    const j = await jsonOf(res);
    if (j.ok && Array.isArray(j.sections)) {
      setSections(j.sections as CommunitySectionAdminRow[]);
      setLoadErr(null);
    } else {
      // 실패해도 직전 목록은 지우지 않는다 (§8-5)
      setLoadErr({ code: typeof j.error === "string" && j.error ? j.error : "load_failed", status: res.status });
    }
    const r2 = await fetch("/api/admin/community/philife-neighborhood-section", { credentials: "include", cache: "no-store" });
    const j2 = await jsonOf(r2);
    if (j2.ok && typeof j2.section_slug === "string") setPhilifeSectionSlug(j2.section_slug);
    router.refresh();
  }

  async function run(fn: () => Promise<boolean>) {
    setBusy(true);
    try {
      if (await fn()) await refresh();
    } catch {
      setBanner({ ok: false, code: "network_error" });
    } finally {
      setBusy(false);
    }
  }

  const savePhilifeNeighborhoodSection = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const confirmed = await confirmAdminAction({
        level: adminActionLevel("save"),
        ko: true,
        title: "동네 피드 섹션 변경",
        description: `앱 동네 피드·글쓰기 카테고리가 「${philifeSectionSlug}」 섹션 기준으로 바뀝니다.`,
        confirmLabel: "설정 저장",
      });
      if (!confirmed.ok) return false;
      const res = await fetch("/api/admin/community/philife-neighborhood-section", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_slug: philifeSectionSlug }),
      });
      const j = await jsonOf(res);
      if (!j.ok) {
        fail(j.error);
        return false;
      }
      setBanner({ ok: true, message: "동네 피드 섹션을 저장했습니다." });
      return true;
    });
  };

  const onCreate = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const res = await fetch("/api/admin/community/sections", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug: slug || normalizeFeedSlug(name), sort_order: sortOrder, is_active: isActive }),
      });
      const j = await jsonOf(res);
      if (!j.ok) {
        fail(j.error);
        return false;
      }
      setBanner({ ok: true, message: `섹션 「${name.trim()}」을(를) 추가했습니다.` });
      setName("");
      setSlug("");
      setSortOrder(0);
      setIsActive(true);
      return true;
    });
  };

  const patchSection = async (row: CommunitySectionAdminRow, okMessage: string) => {
    const res = await fetch(`/api/admin/community/sections/${row.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: row.name, slug: row.slug, sort_order: row.sort_order, is_active: row.is_active }),
    });
    const j = await jsonOf(res);
    if (!j.ok) {
      fail(j.error);
      return false;
    }
    setBanner({ ok: true, message: okMessage });
    return true;
  };

  const saveEdit = () => {
    if (!edit) return;
    void run(async () => {
      const ok = await patchSection(edit, "섹션을 저장했습니다.");
      if (ok) setEdit(null);
      return ok;
    });
  };

  const toggleActive = (s: CommunitySectionAdminRow) =>
    void run(async () => {
      if (s.is_active) {
        const confirmed = await confirmAdminAction({
          level: adminActionLevel("disable"),
          ko: true,
          title: `「${s.name}」 사용 중지`,
          description: "이 섹션의 카테고리·글이 피드에서 빠질 수 있습니다. 글은 지워지지 않습니다.",
          confirmLabel: "사용 중지",
          destructive: true,
        });
        if (!confirmed.ok) return false;
      }
      return patchSection(
        { ...s, is_active: !s.is_active },
        s.is_active ? `「${s.name}」 사용을 중지했습니다.` : `「${s.name}」을(를) 다시 사용합니다.`
      );
    });

  const removeRow = (s: CommunitySectionAdminRow) =>
    void run(async () => {
      const confirmed = await confirmAdminAction({
        level: adminActionLevel("delete"),
        ko: true,
        title: `「${s.name}」 섹션 삭제`,
        description: "글이 있는 섹션은 삭제되지 않습니다. 삭제하면 되돌릴 수 없습니다.",
        confirmLabel: "삭제",
        destructive: true,
        retypeValue: s.name,
      });
      if (!confirmed.ok) return false;
      const res = await fetch(`/api/admin/community/sections/${s.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: confirmed.reason }),
      });
      const j = await jsonOf(res);
      if (!j.ok) {
        fail(j.error);
        return false;
      }
      setBanner({ ok: true, message: "섹션을 삭제했습니다." });
      return true;
    });

  const activeMatch = sections.find(
    (s) => s.is_active && normalizeSectionSlug(s.slug) === normalizeSectionSlug(philifeSectionSlug)
  );

  return (
    <div className="space-y-4">
      <header>
        <Link href="/admin/community" className="text-[13px] font-medium text-sam-muted hover:underline">
          ← 커뮤니티
        </Link>
        <h1 className="sam-text-page-title mt-1 font-semibold text-sam-fg">피드 섹션</h1>
        <p className="mt-1 sam-text-body text-sam-muted">커뮤니티 피드를 나누는 큰 묶음(섹션)과 앱 동네 피드에 쓸 섹션을 정합니다.</p>
      </header>
      <AdminResultBanner ko result={banner} onClose={() => setBanner(null)} />

      <AdminCard title="앱 동네 피드에 쓸 섹션">
        <p className="mb-3 text-[13px] text-sam-muted">
          앱 동네 피드의 카테고리 칩·글쓰기 카테고리·모임 만들기는 여기서 고른 섹션의{" "}
          <Link href="/admin/community/topics" className="font-medium text-sam-info hover:underline">
            카테고리
          </Link>
          를 씁니다.
        </p>
        <form onSubmit={savePhilifeNeighborhoodSection} className="flex flex-wrap items-end gap-2 text-[13px]">
          <label className="flex flex-col gap-1">
            <span className="text-sam-muted">섹션</span>
            <select
              className={`${INPUT} min-w-[220px]`}
              value={activeMatch?.slug ?? philifeSectionSlug ?? ""}
              onChange={(e) => setPhilifeSectionSlug(e.target.value)}
            >
              <option value="">— 사용 중인 섹션 선택 —</option>
              {philifeSectionSlug && !activeMatch ? (
                <option value={philifeSectionSlug}>{philifeSectionSlug} (사용 중지됨 — 다시 지정 필요)</option>
              ) : null}
              {sections
                .filter((s) => s.is_active)
                .map((s) => (
                  <option key={s.id} value={s.slug}>
                    {s.name} ({s.slug})
                  </option>
                ))}
            </select>
          </label>
          <AdminActionButton type="submit" variant="secondary" disabled={busy || !philifeSectionSlug.trim()}>
            설정 저장
          </AdminActionButton>
        </form>
      </AdminCard>

      <AdminCard title="섹션 추가">
        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2 text-[13px]">
          <label className="flex flex-col gap-1">
            <span className="text-sam-muted">이름</span>
            <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder="커뮤니티" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sam-muted">주소용 이름 (영문, 비우면 이름으로 만듦)</span>
            <input className={INPUT} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="dongnae" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sam-muted">순서</span>
            <input type="number" className={`${INPUT} w-20`} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
          </label>
          <label className="flex items-center gap-1.5 pb-1.5">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            사용
          </label>
          <AdminActionButton type="submit" variant="primary" disabled={busy || !name.trim()}>
            섹션 추가
          </AdminActionButton>
        </form>
      </AdminCard>

      <AdminCard title="섹션 목록">
        {loadErr ? (
          <div className="mb-3">
            <AdminErrorState ko code={loadErr.code} httpStatus={loadErr.status} onRetry={() => void refresh()} />
          </div>
        ) : null}
        {loadErr && sections.length === 0 ? null : sections.length === 0 ? (
          <p className="text-[13px] text-sam-muted">등록된 섹션이 없습니다. 위에서 섹션을 추가하세요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-sam-border text-[12px] text-sam-muted">
                  <th className="py-2 pr-2 font-medium">이름</th>
                  <th className="py-2 pr-2 font-medium">주소용 이름</th>
                  <th className="py-2 pr-2 font-medium">순서</th>
                  <th className="py-2 pr-2 font-medium">사용</th>
                  <th className="py-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {sections.map((s) =>
                  edit?.id === s.id ? (
                    <Fragment key={s.id}>
                    <tr className="border-b border-sam-border-soft bg-sam-warning-soft/40">
                      <td className="py-2 pr-2">
                        <input className={`${INPUT} w-full`} value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
                      </td>
                      <td className="py-2 pr-2">
                        <input className={`${INPUT} w-full`} value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          className={`${INPUT} w-16`}
                          value={edit.sort_order}
                          onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) || 0 })}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <AdminToneBadge tone={edit.is_active ? "success" : "neutral"}>{edit.is_active ? "사용 중" : "사용 중지"}</AdminToneBadge>
                      </td>
                      <td className="py-2">
                        <span className="flex flex-wrap gap-1">
                          <AdminActionButton variant="ghost" size="sm" disabled={busy} onClick={() => setEdit(null)}>
                            취소
                          </AdminActionButton>
                          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={saveEdit}>
                            저장
                          </AdminActionButton>
                        </span>
                      </td>
                    </tr>
                    {/* 행 버튼 2개 이하 — 되돌릴 수 없는 삭제는 수정 중일 때 아래 줄에서만 */}
                    <tr className="border-b border-sam-border-soft bg-sam-warning-soft/40">
                      <td colSpan={5} className="py-2">
                        <span className="flex flex-wrap items-center justify-end gap-2 text-[12px] text-sam-muted">
                          글이 없는 섹션만 삭제할 수 있습니다. 되돌릴 수 없습니다.
                          <AdminActionButton variant="danger" size="sm" disabled={busy} onClick={() => removeRow(s)}>
                            섹션 삭제
                          </AdminActionButton>
                        </span>
                      </td>
                    </tr>
                    </Fragment>
                  ) : (
                    <tr key={s.id} className="border-b border-sam-border-soft">
                      <td className="py-2 pr-2 text-sam-fg">{s.name}</td>
                      <td className="py-2 pr-2 text-sam-muted">{s.slug}</td>
                      <td className="py-2 pr-2 tabular-nums">{s.sort_order}</td>
                      <td className="py-2 pr-2">
                        <AdminToneBadge tone={s.is_active ? "success" : "neutral"}>{s.is_active ? "사용 중" : "사용 중지"}</AdminToneBadge>
                      </td>
                      <td className="py-2">
                        <span className="flex flex-wrap gap-1">
                          <AdminActionButton variant="ghost" size="sm" disabled={busy} onClick={() => setEdit({ ...s })}>
                            수정
                          </AdminActionButton>
                          <AdminActionButton variant="ghost" size="sm" disabled={busy} onClick={() => toggleActive(s)}>
                            {s.is_active ? "사용 중지" : "다시 사용"}
                          </AdminActionButton>
                        </span>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-4 flex flex-wrap gap-3 text-[13px]">
          <Link href="/admin/community/topics" className="font-medium text-sam-info hover:underline">
            카테고리 관리 →
          </Link>
          <Link href="/admin/community/settings" className="font-medium text-sam-info hover:underline">
            운영 설정 →
          </Link>
        </p>
      </AdminCard>
    </div>
  );
}
