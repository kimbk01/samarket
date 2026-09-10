"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert, dibayConfirm } from "@/components/ui/dibay-overlay";
import type { MessageKey } from "@/lib/i18n/messages";
import type { CommunityCrawlItemRow } from "@/lib/community-crawler/crawl-ssot";

const btnPrimary =
  "rounded-ui-rect bg-sam-primary px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50";
const btnGhost =
  "rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg disabled:opacity-50";
const fieldClass =
  "mt-1 w-full rounded-ui-rect border border-sam-border bg-sam-app px-3 py-2 sam-text-body text-sam-fg";
const labelClass = "sam-text-helper text-sam-muted";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

function statusLabel(status: string, t: (k: MessageKey) => string): string {
  switch (status) {
    case "DISCOVERED":
      return t("admin_community_crawl_item_status_new");
    case "REVIEW_REQUIRED":
      return t("admin_community_crawl_item_status_review");
    case "READY":
      return t("admin_community_crawl_item_status_ready");
    case "PUBLISHED":
      return t("admin_community_crawl_item_status_published");
    case "FAILED":
      return t("admin_community_crawl_item_status_failed");
    default:
      return t("admin_community_crawl_item_status_other");
  }
}

export function AdminCommunityCrawlItemsPanel(props: {
  boardId: string | null;
  onItemsChange?: (items: CommunityCrawlItemRow[]) => void;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<CommunityCrawlItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<CommunityCrawlItemRow | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [dateIso, setDateIso] = useState("");
  const [views, setViews] = useState("0");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = props.boardId
        ? `?boardId=${encodeURIComponent(props.boardId)}&limit=50`
        : "?limit=50";
      const res = await fetch(`/api/admin/community/crawl/items${q}`, { credentials: "include" });
      const j = (await res.json()) as { ok?: boolean; items?: CommunityCrawlItemRow[]; error?: string };
      if (!j.ok) {
        await dibayAlert({ title: String(j.error ?? "items_load_failed") });
        return;
      }
      const list = j.items ?? [];
      setItems(list);
      props.onItemsChange?.(list);
    } finally {
      setLoading(false);
    }
  }, [props.boardId, props.onItemsChange]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(item: CommunityCrawlItemRow) {
    setEdit(item);
    setTitle(item.dibay_title || item.source_title);
    setBody(item.dibay_body || item.source_body_normalized);
    setAuthor(item.display_author_name ?? "");
    setDateIso(item.display_date ?? "");
    setViews(String(item.display_view_seed ?? 0));
  }

  async function saveEdit() {
    if (!edit) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/crawl/items/${edit.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dibay_title: title,
          dibay_body: body,
          display_author_name: author,
          display_date: dateIso || null,
          display_view_seed: Number(views) || 0,
        }),
      });
      const j = (await res.json()) as { ok?: boolean; item?: CommunityCrawlItemRow; error?: string };
      if (!j.ok || !j.item) {
        await dibayAlert({ title: String(j.error ?? "save_failed") });
        return;
      }
      setItems((prev) => prev.map((it) => (it.id === j.item!.id ? j.item! : it)));
      setEdit(null);
    } finally {
      setBusy(false);
    }
  }

  async function publishItem(item: CommunityCrawlItemRow) {
    const ok = await dibayConfirm({
      title: t("admin_community_crawl_import_confirm_title"),
      description: t("admin_community_crawl_import_confirm_body"),
      confirmLabel: t("admin_community_crawl_import_publish"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/crawl/items/${item.id}/publish`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        communityPostId?: string;
        policyStatus?: string;
      };
      if (!j.ok) {
        await dibayAlert({
          title:
            j.error === "BLOCKED_POLICY"
              ? t("admin_community_crawl_prepare_blocked_publish")
              : String(j.error ?? "publish_failed"),
        });
        return;
      }
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? { ...it, status: "PUBLISHED", published_post_id: j.communityPostId ?? it.published_post_id }
            : it
        )
      );
    } finally {
      setBusy(false);
    }
  }

  /** Materialize from crawl ACK without waiting for re-fetch. */
  function materializeFromCrawl(ackItems: CommunityCrawlItemRow[]) {
    if (!ackItems.length) return;
    setItems((prev) => {
      const map = new Map(prev.map((i) => [i.id, i]));
      for (const it of ackItems) map.set(it.id, it);
      return [...map.values()].sort(
        (a, b) => Date.parse(b.last_crawled_at) - Date.parse(a.last_crawled_at)
      );
    });
  }

  // Expose materialize via custom event from parent crawl button
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<CommunityCrawlItemRow[]>).detail;
      if (Array.isArray(detail)) materializeFromCrawl(detail);
    };
    window.addEventListener("community-crawl-items-ack", handler);
    return () => window.removeEventListener("community-crawl-items-ack", handler);
  }, []);

  return (
    <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="sam-text-section-title font-semibold text-sam-fg">
          {t("admin_community_crawl_items_title")}
        </h2>
        <button type="button" className={btnGhost} disabled={loading || busy} onClick={() => void load()}>
          {t("admin_community_crawl_items_refresh")}
        </button>
      </div>
      <p className="sam-text-helper text-sam-muted">{t("admin_community_crawl_items_hint")}</p>
      {loading ? (
        <p className="sam-text-body text-sam-muted">{t("admin_community_crawl_loading")}</p>
      ) : items.length === 0 ? (
        <p className="sam-text-body text-sam-muted">{t("admin_community_crawl_items_empty")}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li
              key={it.id}
              className="rounded-ui-rect border border-sam-border bg-sam-app p-3 space-y-2 overflow-hidden"
            >
              <div className="flex flex-wrap gap-3">
                {it.source_cover_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- admin external preview
                  <img
                    src={it.source_cover_url}
                    alt=""
                    className="h-20 w-28 rounded-ui-rect object-cover bg-sam-surface"
                  />
                ) : (
                  <div className="flex h-20 w-28 items-center justify-center rounded-ui-rect bg-sam-surface sam-text-helper text-sam-muted">
                    {t("admin_community_crawl_preview_rep_none")}
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-semibold text-sam-fg break-words">{it.dibay_title || it.source_title}</div>
                  <div className="sam-text-helper text-sam-muted">
                    {statusLabel(it.status, t)} · {it.display_author_name || "—"} ·{" "}
                    {formatWhen(it.display_date)} · views {it.display_view_seed}
                  </div>
                  <p className="sam-text-helper text-sam-muted line-clamp-2">
                    {(it.dibay_body || it.source_body_normalized).slice(0, 160)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} disabled={busy} onClick={() => openEdit(it)}>
                  {t("admin_community_crawl_item_edit")}
                </button>
                <button
                  type="button"
                  className={btnGhost}
                  disabled={busy || it.status === "PUBLISHED"}
                  onClick={() => void publishItem(it)}
                >
                  {t("admin_community_crawl_import_publish")}
                </button>
                <a
                  href={it.canonical_url}
                  target="_blank"
                  rel="noreferrer"
                  className="sam-text-helper text-sam-primary self-center"
                >
                  {t("admin_community_crawl_item_original")}
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      {edit ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
          <div className="w-full max-w-xl rounded-ui-rect border border-sam-border bg-sam-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-sam-border px-4 py-3">
              <h3 className="font-semibold text-sam-fg">{t("admin_community_crawl_item_edit")}</h3>
              <button type="button" className="text-sam-muted" onClick={() => setEdit(null)}>
                ×
              </button>
            </div>
            <div className="space-y-3 px-4 py-4">
              {edit.source_cover_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={edit.source_cover_url}
                  alt=""
                  className="max-h-40 w-auto max-w-full rounded-ui-rect object-contain"
                />
              ) : null}
              <label className="block">
                <span className={labelClass}>{t("admin_community_crawl_import_title")}</span>
                <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="block">
                <span className={labelClass}>{t("admin_community_crawl_import_body")}</span>
                <textarea
                  className={`${fieldClass} min-h-[160px]`}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </label>
              <label className="block">
                <span className={labelClass}>{t("admin_community_crawl_import_author")}</span>
                <input className={fieldClass} value={author} onChange={(e) => setAuthor(e.target.value)} />
              </label>
              <label className="block">
                <span className={labelClass}>{t("admin_community_crawl_import_date")}</span>
                <input className={fieldClass} value={dateIso} onChange={(e) => setDateIso(e.target.value)} />
              </label>
              <label className="block">
                <span className={labelClass}>{t("admin_community_crawl_import_views")}</span>
                <input className={fieldClass} value={views} onChange={(e) => setViews(e.target.value)} />
              </label>
              <div className="flex gap-2 pt-2">
                <button type="button" className={btnGhost} onClick={() => setEdit(null)}>
                  {t("admin_community_crawl_cancel")}
                </button>
                <button type="button" className={btnPrimary} disabled={busy} onClick={() => void saveEdit()}>
                  {t("admin_community_crawl_save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
