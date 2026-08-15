"use client";

import { dibayConfirm, dibayAlert } from "@/components/ui/dibay-overlay";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
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
  const { t: tr } = useI18n();
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
        await dibayAlert({ title: j.error === "unknown_or_inactive_section"
            ? tr("admin_sections_err_unknown_inactive_section")
            : j.error ?? tr("admin_topics_err_save") });
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
        await dibayAlert({ title: j.error === "slug_duplicate" ? tr("admin_topics_err_slug_duplicate") : j.error ?? tr("admin_topics_err_save") });
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
        await dibayAlert({ title: j.error === "slug_duplicate" ? tr("admin_topics_err_slug_duplicate") : j.error ?? tr("admin_topics_err_save") });
        return;
      }
      setEdit(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(id: string) {
    if (!(await dibayConfirm({ title: tr("admin_sections_confirm_delete"), confirmTone: "destructive" }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/sections/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = await res.json();
      if (!j.ok) {
        await dibayAlert({ title: j.error === "section_has_posts" ? tr("admin_sections_err_has_posts") : j.error ?? tr("admin_sections_err_delete") });
        return;
      }
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader titleKey="admin_sections_page_title" backHref="/admin/boards" />
      <AdminCard titleKey="admin_sections_card_philife_title">
        <p className="mb-3 sam-text-body-secondary text-sam-muted">
          {tr("admin_sections_intro_a")}
          <a
            href="/admin/philife/topics"
            className="font-medium text-sam-primary hover:text-sam-primary-hover hover:underline"
          >
            {tr("admin_sections_intro_link_topics")}
          </a>
          {tr("admin_sections_intro_b")}
          <code className="rounded bg-sam-surface-muted px-1">dongnae</code>
          {tr("admin_sections_intro_c")}
          <code className="rounded bg-sam-surface-muted px-1">admin_settings.philife_neighborhood_section</code>
        </p>
        <form onSubmit={savePhilifeNeighborhoodSection} className="flex flex-wrap items-end gap-2 sam-text-body-secondary">
          <label className="flex flex-col gap-0.5">
            <span className="text-sam-muted">{tr("admin_sections_label_section_slug")}</span>
            <select
              className="min-w-[200px] rounded border border-sam-border px-2 py-1.5 font-mono sam-text-helper"
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
              <option value="">{tr("admin_sections_select_active_placeholder")}</option>
              {philifeSectionSlug &&
                !sections.some(
                  (s) => s.is_active && normalizeSectionSlug(s.slug) === normalizeSectionSlug(philifeSectionSlug)
                ) && (
                  <option value={philifeSectionSlug}>
                    {tr("admin_sections_option_inactive", { slug: philifeSectionSlug })}
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
            {tr("common_save")}
          </button>
        </form>
      </AdminCard>
      <AdminCard titleKey="admin_sections_card_add_title">
        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2 sam-text-body-secondary">
          <label className="flex flex-col gap-0.5">
            <span className="text-sam-muted">{tr("admin_topics_label_name")}</span>
            <input
              className="rounded border border-sam-border px-2 py-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tr("admin_sections_placeholder_section_name")}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-sam-muted">{tr("admin_sections_label_slug_from_name")}</span>
            <input
              className="rounded border border-sam-border px-2 py-1.5 font-mono sam-text-helper"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder={tr("admin_sections_placeholder_slug_example")}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-sam-muted">{tr("admin_topics_label_sort")}</span>
            <input
              type="number"
              className="w-20 rounded border border-sam-border px-2 py-1.5"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value) || 0)}
            />
          </label>
          <label className="flex items-center gap-1.5 pb-1.5">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            {tr("admin_topics_checkbox_active")}
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded bg-sam-ink px-3 py-1.5 text-white disabled:opacity-50"
          >
            {tr("admin_topics_btn_add")}
          </button>
        </form>
      </AdminCard>
      <AdminCard titleKey="admin_sections_list_title">
        {sections.length === 0 ? (
          <p className="sam-text-body-secondary text-amber-800">{tr("admin_sections_empty_migration")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left sam-text-body-secondary">
              <thead>
                <tr className="border-b border-sam-border text-sam-muted">
                  <th className="py-2 pr-2 font-medium">{tr("admin_sections_col_slug")}</th>
                  <th className="py-2 pr-2 font-medium">{tr("admin_topics_col_name")}</th>
                  <th className="py-2 pr-2 font-medium">{tr("admin_topics_col_sort")}</th>
                  <th className="py-2 pr-2 font-medium">{tr("admin_topics_col_active")}</th>
                  <th className="py-2 font-medium">{tr("admin_topics_col_actions")}</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) =>
                  edit?.id === s.id ? (
                    <tr key={s.id} className="border-b border-sam-border-soft bg-amber-50/40">
                      <td className="py-2 pr-2">
                        <input
                          className="w-full rounded border px-1.5 py-1 font-mono sam-text-helper"
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
                    <tr key={s.id} className="border-b border-sam-border-soft">
                      <td className="py-2 pr-2 font-mono sam-text-helper">{s.slug}</td>
                      <td className="py-2 pr-2 text-sam-fg">{s.name}</td>
                      <td className="py-2 pr-2">{s.sort_order}</td>
                      <td className="py-2 pr-2">{s.is_active ? "Y" : "N"}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          className="mr-2 text-sam-primary hover:text-sam-primary-hover hover:underline"
                          onClick={() => setEdit({ ...s })}
                        >
                          {tr("admin_topics_btn_edit")}
                        </button>
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={() => removeRow(s.id)}
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
        <p className="mt-4 sam-text-body-secondary">
          <a
            href="/admin/philife/topics"
            className="font-medium text-sam-primary hover:text-sam-primary-hover hover:underline"
          >
            {tr("admin_sections_footer_topics")}
          </a>{" "}
          ·{" "}
          <a
            href="/admin/philife/settings"
            className="font-medium text-sam-primary hover:text-sam-primary-hover hover:underline"
          >
            {tr("admin_sections_footer_feed_settings")}
          </a>
        </p>
      </AdminCard>
    </div>
  );
}
