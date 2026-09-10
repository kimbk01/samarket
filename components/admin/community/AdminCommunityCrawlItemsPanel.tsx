"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { dibayAlert, dibayConfirm } from "@/components/ui/dibay-overlay";
import type { MessageKey } from "@/lib/i18n/messages";
import type { CommunityCrawlItemOpsDto } from "@/lib/community-crawler/admin-item-ops-dto";
import type { CommunityCrawlBoardRow } from "@/lib/community-crawler/crawl-ssot";

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
    case "SKIPPED":
      return t("admin_community_crawl_item_status_skipped");
    default:
      return t("admin_community_crawl_item_status_other");
  }
}

function mediaStatusLabel(s: CommunityCrawlItemOpsDto["media_status"], t: (k: MessageKey) => string): string {
  if (s === "DURABLE_COVER") return t("admin_community_crawl_media_status_durable");
  if (s === "CANDIDATE_ONLY") return t("admin_community_crawl_media_status_candidate");
  return t("admin_community_crawl_media_status_none");
}

/**
 * Durable COVER thumb only. Never hotlink source_cover_candidate_url.
 * Missing/broken → explicit fallback (no white broken box).
 */
function CoverPreview(props: { url: string | null; noneLabel: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [props.url]);
  if (!props.url || failed) {
    return (
      <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-ui-rect bg-sam-surface sam-text-helper text-sam-muted text-center px-1">
        {props.noneLabel}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- admin durable thumb
    <img
      src={props.url}
      alt=""
      className="h-20 w-28 shrink-0 rounded-ui-rect object-cover bg-sam-surface"
      onError={() => setFailed(true)}
    />
  );
}

function asOps(item: CommunityCrawlItemOpsDto | Record<string, unknown>): CommunityCrawlItemOpsDto {
  const it = item as CommunityCrawlItemOpsDto;
  const published = it.published ?? (it.status === "PUBLISHED" || Boolean(it.published_post_id));
  const source_policy_status = it.source_policy_status ?? null;
  const source_media_policy = it.source_media_policy ?? null;
  const publish_cta_eligible =
    typeof it.publish_cta_eligible === "boolean"
      ? it.publish_cta_eligible
      : source_policy_status === "ALLOWED" &&
        !published &&
        it.status !== "SKIPPED" &&
        it.status !== "FAILED";
  return {
    ...it,
    source_name: it.source_name ?? null,
    topic_name: it.topic_name ?? null,
    thumb_url: it.thumb_url ?? null,
    media_status: it.media_status ?? "NO_MEDIA",
    published,
    source_policy_status,
    source_media_policy,
    publish_cta_eligible,
  };
}

export function AdminCommunityCrawlItemsPanel(props: {
  boardId: string | null;
  boards?: CommunityCrawlBoardRow[];
  onBoardIdChange?: (boardId: string) => void;
  onItemsChange?: (items: CommunityCrawlItemOpsDto[]) => void;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<CommunityCrawlItemOpsDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState<CommunityCrawlItemOpsDto | null>(null);
  const [preview, setPreview] = useState<CommunityCrawlItemOpsDto | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [dateIso, setDateIso] = useState("");
  const [views, setViews] = useState("0");

  const applyList = useCallback(
    (list: CommunityCrawlItemOpsDto[]) => {
      setItems(list);
      props.onItemsChange?.(list);
    },
    [props]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = props.boardId
        ? `?boardId=${encodeURIComponent(props.boardId)}&limit=50`
        : "?limit=50";
      const res = await fetch(`/api/admin/community/crawl/items${q}`, { credentials: "include" });
      const j = (await res.json()) as {
        ok?: boolean;
        items?: CommunityCrawlItemOpsDto[];
        error?: string;
      };
      if (!j.ok) {
        await dibayAlert({ title: String(j.error ?? "items_load_failed") });
        return;
      }
      applyList((j.items ?? []).map(asOps));
    } finally {
      setLoading(false);
    }
  }, [props.boardId, applyList]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(item: CommunityCrawlItemOpsDto) {
    const it = asOps(item);
    setEdit(it);
    setTitle(it.dibay_title || it.source_title);
    setBody(it.dibay_body || it.source_body_normalized);
    setAuthor(it.display_author_name ?? "");
    setDateIso(it.display_date ?? "");
    setViews(String(it.display_view_seed ?? 0));
  }

  async function saveEdit() {
    if (!edit) return;
    if (!body.trim()) {
      await dibayAlert({ title: t("admin_community_crawl_body_required") });
      return;
    }
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
      const j = (await res.json()) as {
        ok?: boolean;
        item?: CommunityCrawlItemOpsDto;
        error?: string;
      };
      if (!j.ok || !j.item) {
        await dibayAlert({
          title:
            j.error === "body_required"
              ? t("admin_community_crawl_body_required")
              : String(j.error ?? "save_failed"),
        });
        return;
      }
      const next = asOps(j.item);
      // D4: ACK → local replace; no refresh() required for visibility.
      setItems((prev) => prev.map((it) => (it.id === next.id ? next : it)));
      setEdit(next);
    } finally {
      setBusy(false);
    }
  }

  async function excludeItem(item: CommunityCrawlItemOpsDto) {
    const ok = await dibayConfirm({
      title: t("admin_community_crawl_item_exclude_title"),
      description: t("admin_community_crawl_item_exclude_body"),
      confirmLabel: t("admin_community_crawl_item_exclude"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/crawl/items/${item.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "SKIPPED" }),
      });
      const j = (await res.json()) as { ok?: boolean; item?: CommunityCrawlItemOpsDto; error?: string };
      if (!j.ok || !j.item) {
        await dibayAlert({ title: String(j.error ?? "exclude_failed") });
        return;
      }
      const next = asOps(j.item);
      setItems((prev) => prev.map((it) => (it.id === next.id ? next : it)));
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(item: CommunityCrawlItemOpsDto) {
    const ok = await dibayConfirm({
      title: t("admin_community_crawl_item_delete_title"),
      description: t("admin_community_crawl_item_delete_body"),
      confirmLabel: t("admin_community_crawl_item_delete"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/community/crawl/items/${item.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!j.ok) {
        await dibayAlert({ title: String(j.error ?? "delete_failed") });
        return;
      }
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      if (edit?.id === item.id) setEdit(null);
    } finally {
      setBusy(false);
    }
  }

  async function publishItem(item: CommunityCrawlItemOpsDto) {
    if (item.status === "SKIPPED" || item.status === "PUBLISHED") {
      await dibayAlert({ title: t("admin_community_crawl_publish_blocked_hint") });
      return;
    }
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
        detail?: string;
      };
      if (!j.ok) {
        const msg =
          j.error === "BLOCKED_POLICY" || j.error === "source_disabled"
            ? t("admin_community_crawl_import_blocked_disabled")
            : j.error === "board_collect_only"
              ? t("admin_community_crawl_import_blocked_collect")
              : j.error === "already_published"
                ? `${t("admin_community_crawl_import_success")} · ${j.communityPostId ?? ""}`
                : String(j.error ?? j.detail ?? "publish_failed");
        await dibayAlert({ title: msg });
        return;
      }
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? {
                ...it,
                status: "PUBLISHED",
                published: true,
                published_post_id: j.communityPostId ?? it.published_post_id,
              }
            : it
        )
      );
      await dibayAlert({
        title: `${t("admin_community_crawl_import_success")}${
          j.communityPostId ? ` · /philife/${j.communityPostId}` : ""
        }`,
      });
    } finally {
      setBusy(false);
    }
  }

  function materializeFromCrawl(ackItems: CommunityCrawlItemOpsDto[]) {
    if (!ackItems.length) return;
    setItems((prev) => {
      const map = new Map(prev.map((i) => [i.id, i]));
      for (const raw of ackItems) {
        const it = asOps(raw);
        if (props.boardId && it.board_id !== props.boardId) continue;
        map.set(it.id, it);
      }
      return [...map.values()].sort(
        (a, b) => Date.parse(b.last_crawled_at) - Date.parse(a.last_crawled_at)
      );
    });
  }

  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<CommunityCrawlItemOpsDto[]>).detail;
      if (Array.isArray(detail)) materializeFromCrawl(detail);
    };
    window.addEventListener("community-crawl-items-ack", handler);
    return () => window.removeEventListener("community-crawl-items-ack", handler);
  }, [props.boardId]);

  return (
    <section className="space-y-3 rounded-ui-rect border border-sam-border bg-sam-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="sam-text-section-title font-semibold text-sam-fg">
          {t("admin_community_crawl_items_title")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {props.boards && props.boards.length > 0 && props.onBoardIdChange ? (
            <label className="flex items-center gap-2 sam-text-helper text-sam-muted">
              {t("admin_community_crawl_items_board_filter")}
              <select
                className="rounded-ui-rect border border-sam-border bg-sam-app px-2 py-1 text-sam-fg"
                value={props.boardId ?? ""}
                onChange={(e) => props.onBoardIdChange?.(e.target.value)}
              >
                {props.boards.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button type="button" className={btnGhost} disabled={loading || busy} onClick={() => void load()}>
            {t("admin_community_crawl_items_refresh")}
          </button>
        </div>
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
                <CoverPreview
                  url={it.thumb_url}
                  noneLabel={t("admin_community_crawl_preview_rep_none")}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="font-semibold text-sam-fg break-words">
                    {it.dibay_title || it.source_title}
                  </div>
                  <div className="sam-text-helper text-sam-muted break-words">
                    {statusLabel(it.status, t)} ·{" "}
                    {it.published
                      ? t("admin_community_crawl_item_published_yes")
                      : t("admin_community_crawl_item_published_no")}{" "}
                    · {it.display_author_name || "—"} · {formatWhen(it.display_date)} · views{" "}
                    {it.display_view_seed}
                  </div>
                  <div className="sam-text-helper text-sam-muted break-words">
                    {t("admin_community_crawl_item_category")}: {it.topic_name || "—"} ·{" "}
                    {t("admin_community_crawl_item_source")}: {it.source_name || "—"} ·{" "}
                    {t("admin_community_crawl_item_last_crawled")}: {formatWhen(it.last_crawled_at)} ·{" "}
                    {t("admin_community_crawl_item_media_status")}: {mediaStatusLabel(it.media_status, t)}
                  </div>
                  <p className="sam-text-helper text-sam-muted line-clamp-2 break-words">
                    {(it.dibay_body || it.source_body_normalized).slice(0, 160)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnGhost} disabled={busy} onClick={() => setPreview(it)}>
                  {t("admin_community_crawl_item_preview")}
                </button>
                <button type="button" className={btnPrimary} disabled={busy} onClick={() => openEdit(it)}>
                  {t("admin_community_crawl_item_edit")}
                </button>
                <a
                  href={it.canonical_url}
                  target="_blank"
                  rel="noreferrer"
                  className={`${btnGhost} inline-flex items-center no-underline`}
                >
                  {t("admin_community_crawl_item_original")}
                </a>
                <button
                  type="button"
                  className={btnGhost}
                  disabled={busy || it.status === "SKIPPED"}
                  onClick={() => void excludeItem(it)}
                >
                  {t("admin_community_crawl_item_exclude")}
                </button>
                <button type="button" className={btnGhost} disabled={busy} onClick={() => void deleteItem(it)}>
                  {t("admin_community_crawl_item_delete")}
                </button>
                {it.publish_cta_eligible ? (
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={busy}
                    onClick={() => void publishItem(it)}
                  >
                    {t("admin_community_crawl_import_publish")}
                  </button>
                ) : it.published || it.status === "PUBLISHED" ? null : (
                  <span
                    className="inline-flex items-center rounded-ui-rect border border-sam-border bg-sam-surface px-3 py-2 sam-text-helper text-sam-muted"
                    title={t("admin_community_crawl_publish_blocked_hint")}
                  >
                    {it.source_policy_status === "REVIEW_REQUIRED" ||
                    it.source_media_policy === "MEDIA_REVIEW_REQUIRED"
                      ? t("admin_community_crawl_publish_waiting_policy")
                      : t("admin_community_crawl_publish_not_ready")}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
          <div className="w-full max-w-xl rounded-ui-rect border border-sam-border bg-sam-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-sam-border px-4 py-3">
              <h3 className="font-semibold text-sam-fg">{t("admin_community_crawl_item_preview")}</h3>
              <button type="button" className="text-sam-muted" onClick={() => setPreview(null)}>
                ×
              </button>
            </div>
            <div className="space-y-3 px-4 py-4 max-h-[min(80vh,720px)] overflow-y-auto">
              <CoverPreview
                url={preview.thumb_url}
                noneLabel={t("admin_community_crawl_preview_rep_none")}
              />
              <h4 className="font-semibold text-sam-fg break-words">
                {preview.dibay_title || preview.source_title}
              </h4>
              <p className="sam-text-body text-sam-fg whitespace-pre-wrap break-words">
                {preview.dibay_body || preview.source_body_normalized}
              </p>
              <p className="sam-text-helper text-sam-muted break-all">
                {t("admin_community_crawl_source_url")}: {preview.canonical_url}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {edit ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-16">
          <div className="w-full max-w-xl rounded-ui-rect border border-sam-border bg-sam-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-sam-border px-4 py-3">
              <h3 className="font-semibold text-sam-fg">{t("admin_community_crawl_item_edit")}</h3>
              <button type="button" className="text-sam-muted" onClick={() => setEdit(null)}>
                ×
              </button>
            </div>
            <div className="space-y-3 px-4 py-4 max-h-[min(80vh,720px)] overflow-y-auto">
              <CoverPreview
                url={edit.thumb_url}
                noneLabel={t("admin_community_crawl_preview_rep_none")}
              />
              <p className="sam-text-helper text-sam-muted">
                {t("admin_community_crawl_item_media_status")}: {mediaStatusLabel(edit.media_status, t)} ·{" "}
                {t("admin_community_crawl_item_category")}: {edit.topic_name || "—"}
              </p>
              <p className="sam-text-helper text-sam-muted break-all">
                {t("admin_community_crawl_source_url")}: {edit.canonical_url}
              </p>
              <label className="block">
                <span className={labelClass}>{t("admin_community_crawl_import_title")}</span>
                <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label className="block">
                <span className={labelClass}>{t("admin_community_crawl_import_body")}</span>
                <textarea
                  className={`${fieldClass} min-h-[220px]`}
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
