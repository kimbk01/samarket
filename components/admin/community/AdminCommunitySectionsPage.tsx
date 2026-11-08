"use client";

/**
 * 커뮤니티 피드 섹션 (설계 §C-18). 표준 버튼 · 결과 배너(alert 없음) · 사용 중지·삭제 L1 확인 · 개발 문구 제거.
 */
import Link from "next/link";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { AdminCard } from "@/components/admin/AdminCard";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminErrorState, AdminResultBanner } from "@/components/admin/ui/AdminStateViews";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import type { CommunitySectionAdminRow } from "@/lib/community-feed/types";
import { normalizeFeedSlug, normalizeSectionSlug } from "@/lib/community-feed/constants";

type Banner = { ok: true; message: string } | { ok: false; code: string } | null;

const INPUT = "rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[13px] text-sam-fg";

function sectionErrorText(code: unknown, t: (key: MessageKey) => string): string {
  switch (typeof code === "string" ? code : "") {
    case "slug_duplicate":
      return t("admin_community_sections_err_slug_duplicate");
    case "section_has_posts":
      return t("admin_community_sections_err_has_posts");
    case "unknown_or_inactive_section":
      return t("admin_community_sections_err_inactive");
    case "name_required":
    case "invalid_name":
      return t("admin_community_sections_err_name_required");
    case "invalid_slug":
      return t("admin_community_sections_err_invalid_slug");
    case "not_found":
      return t("admin_community_sections_err_not_found");
    case "forbidden":
    case "forbidden_permission":
      return t("admin_community_sections_err_forbidden");
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
  const { t } = useI18n();
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

  const fail = (code: unknown) => setBanner({ ok: false, code: sectionErrorText(code, t) });

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
        title: t("admin_community_sections_philife_confirm_title"),
        description: t("admin_community_sections_philife_confirm_desc", { slug: philifeSectionSlug }),
        confirmLabel: t("admin_community_settings_save_btn"),
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
      setBanner({ ok: true, message: t("admin_community_sections_philife_saved") });
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
      setBanner({ ok: true, message: t("admin_community_sections_added", { name: name.trim() }) });
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
      const ok = await patchSection(edit, t("admin_community_sections_saved"));
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
          title: t("admin_community_topics_disable_title", { name: s.name }),
          description: t("admin_community_sections_disable_desc"),
          confirmLabel: t("admin_community_topics_disable_btn"),
          destructive: true,
        });
        if (!confirmed.ok) return false;
      }
      return patchSection(
        { ...s, is_active: !s.is_active },
        s.is_active ? t("admin_community_topics_disabled", { name: s.name }) : t("admin_community_topics_enabled", { name: s.name })
      );
    });

  const removeRow = (s: CommunitySectionAdminRow) =>
    void run(async () => {
      const confirmed = await confirmAdminAction({
        level: adminActionLevel("delete"),
        ko: true,
        title: t("admin_community_sections_delete_title", { name: s.name }),
        description: t("admin_community_sections_delete_desc"),
        confirmLabel: t("admin_community_topics_delete_btn"),
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
      setBanner({ ok: true, message: t("admin_community_sections_deleted") });
      return true;
    });

  const activeMatch = sections.find(
    (s) => s.is_active && normalizeSectionSlug(s.slug) === normalizeSectionSlug(philifeSectionSlug)
  );

  return (
    <div className="space-y-4">
      <AdminPageHeader
        backHref="/admin/community"
        title={t("admin_community_sections_title")}
        description={t("admin_community_sections_desc")}
      />
      <AdminResultBanner ko result={banner} onClose={() => setBanner(null)} />

      <AdminCard title={t("admin_community_sections_philife_card")}>
        <p className="mb-3 text-[13px] text-sam-muted">
          {t("admin_community_sections_philife_intro_before")}{" "}
          <Link href="/admin/community/topics" className="font-medium text-sam-info hover:underline">
            {t("admin_community_sections_philife_intro_link")}
          </Link>
          {t("admin_community_sections_philife_intro_after")}
        </p>
        <form onSubmit={savePhilifeNeighborhoodSection} className="flex flex-wrap items-end gap-2 text-[13px]">
          <label className="flex flex-col gap-1">
            <span className="text-sam-muted">{t("admin_community_sections_field_section")}</span>
            <select
              className={`${INPUT} min-w-[220px]`}
              value={activeMatch?.slug ?? philifeSectionSlug ?? ""}
              onChange={(e) => setPhilifeSectionSlug(e.target.value)}
            >
              <option value="">{t("admin_community_sections_select_active")}</option>
              {philifeSectionSlug && !activeMatch ? (
                <option value={philifeSectionSlug}>{t("admin_community_sections_philife_inactive_option", { slug: philifeSectionSlug })}</option>
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
            {t("admin_community_sections_save_setting")}
          </AdminActionButton>
        </form>
      </AdminCard>

      <AdminCard title={t("admin_community_sections_add")}>
        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2 text-[13px]">
          <label className="flex flex-col gap-1">
            <span className="text-sam-muted">{t("admin_community_sections_col_name")}</span>
            <input
              className={INPUT}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("admin_community_sections_name_placeholder")}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sam-muted">{t("admin_community_sections_slug_hint")}</span>
            <input className={INPUT} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="dongnae" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sam-muted">{t("admin_community_sections_col_order")}</span>
            <input type="number" className={`${INPUT} w-20`} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
          </label>
          <label className="flex items-center gap-1.5 pb-1.5">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            {t("admin_community_sections_field_active")}
          </label>
          <AdminActionButton type="submit" variant="primary" disabled={busy || !name.trim()}>
            {t("admin_community_sections_add")}
          </AdminActionButton>
        </form>
      </AdminCard>

      <AdminCard title={t("admin_community_sections_list")}>
        {loadErr ? (
          <div className="mb-3">
            <AdminErrorState ko code={loadErr.code} httpStatus={loadErr.status} onRetry={() => void refresh()} />
          </div>
        ) : null}
        {loadErr && sections.length === 0 ? null : sections.length === 0 ? (
          <p className="text-[13px] text-sam-muted">{t("admin_community_sections_empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-sam-border text-[12px] text-sam-muted">
                  <th className="py-2 pr-2 font-medium">{t("admin_community_sections_col_name")}</th>
                  <th className="py-2 pr-2 font-medium">{t("admin_community_sections_col_slug")}</th>
                  <th className="py-2 pr-2 font-medium">{t("admin_community_sections_col_order")}</th>
                  <th className="py-2 pr-2 font-medium">{t("admin_community_sections_col_active")}</th>
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
                        <AdminToneBadge tone={edit.is_active ? "success" : "neutral"}>{edit.is_active ? t("admin_community_sections_status_active") : t("admin_community_sections_status_inactive")}</AdminToneBadge>
                      </td>
                      <td className="py-2">
                        <span className="flex flex-wrap gap-1">
                          <AdminActionButton variant="ghost" size="sm" disabled={busy} onClick={() => setEdit(null)}>
                            {t("admin_community_sections_edit_cancel")}
                          </AdminActionButton>
                          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={saveEdit}>
                            {t("admin_community_sections_edit_save")}
                          </AdminActionButton>
                        </span>
                      </td>
                    </tr>
                    {/* 행 버튼 2개 이하 — 되돌릴 수 없는 삭제는 수정 중일 때 아래 줄에서만 */}
                    <tr className="border-b border-sam-border-soft bg-sam-warning-soft/40">
                      <td colSpan={5} className="py-2">
                        <span className="flex flex-wrap items-center justify-end gap-2 text-[12px] text-sam-muted">
                          {t("admin_community_sections_delete_hint")}
                          <AdminActionButton variant="danger" size="sm" disabled={busy} onClick={() => removeRow(s)}>
                            {t("admin_community_sections_delete_section")}
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
                        <AdminToneBadge tone={s.is_active ? "success" : "neutral"}>{s.is_active ? t("admin_community_sections_status_active") : t("admin_community_sections_status_inactive")}</AdminToneBadge>
                      </td>
                      <td className="py-2">
                        <span className="flex flex-wrap gap-1">
                          <AdminActionButton variant="ghost" size="sm" disabled={busy} onClick={() => setEdit({ ...s })}>
                            {t("admin_community_sections_row_edit")}
                          </AdminActionButton>
                          <AdminActionButton variant="secondary" size="sm" disabled={busy} onClick={() => toggleActive(s)}>
                            {s.is_active ? t("admin_community_topics_disable_btn") : t("admin_community_topics_enable_btn")}
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
            {t("admin_community_sections_link_topics")}
          </Link>
          <Link href="/admin/community/settings" className="font-medium text-sam-info hover:underline">
            {t("admin_community_sections_link_settings")}
          </Link>
        </p>
      </AdminCard>
    </div>
  );
}
