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
  if (s === "NO_VALID_IMAGE") return t("admin_community_crawl_media_status_no_valid");
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
    body_media_count: typeof it.body_media_count === "number" ? it.body_media_count : 0,
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
  const [pureReadPreviewData, setPureReadPreviewData] = useState<{
    dibay_title: string;
    dibay_body: string;
    display_author_name: string;
    display_date: string;
    display_view_seed: number;
    cover_image_url: string | null;
    source_title: string;
    canonical_url: string;
    public_attribution_mode: string;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [crawlingBoard, setCrawlingBoard] = useState(false);
  const [applyingBatch, setApplyingBatch] = useState(false);
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

  async function openPureReadPreview(item: CommunityCrawlItemOpsDto) {
    setPreview(item);
    setPreviewLoading(true);
    setPureReadPreviewData(null);
    try {
      const res = await fetch(`/api/admin/community/crawl/items/${item.id}/preview`, { credentials: "include" });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        preview?: {
          dibay_title: string;
          dibay_body: string;
          display_author_name: string;
          display_date: string;
          display_view_seed: number;
          cover_image_url: string | null;
          source_title: string;
          canonical_url: string;
          public_attribution_mode: string;
        };
      };
      if (j.ok && j.preview) {
        setPureReadPreviewData(j.preview);
      }
    } catch {
      // ignore
    } finally {
      setPreviewLoading(false);
    }
  }

  async function crawlBoardNow() {
    if (!props.boardId) {
      await dibayAlert({ title: "게시판을 먼저 선택해주세요." });
      return;
    }
    setCrawlingBoard(true);
    try {
      const res = await fetch(`/api/admin/community/crawl/boards/${props.boardId}/crawl`, {
        method: "POST",
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; insertedCount?: number };
      if (!j.ok) {
        await dibayAlert({ title: String(j.error ?? "수집 실패") });
        return;
      }
      await dibayAlert({
        title: `게시판 글 불러오기 완료 (${j.insertedCount ?? 0}건 신규 발견)`,
      });
      await load();
    } finally {
      setCrawlingBoard(false);
    }
  }

  function toggleSelectItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  }

  async function applyBatchSelected() {
    const unapplied = items.filter((i) => selectedIds.has(i.id) && !i.published && i.status !== "PUBLISHED");
    if (unapplied.length === 0) {
      await dibayAlert({ title: "선택된 항목 중 적용 가능한 글이 없습니다." });
      return;
    }
    const ok = await dibayConfirm({
      title: "선택 항목 DIBAY 일괄 적용",
      description: `선택한 ${unapplied.length}건의 글을 DIBAY 커뮤니티에 실제 적용 및 발행하시겠습니까?\n(작성자 풀, 랜덤 날짜, 초기 조회수 시드가 1회 확정되어 게시글로 등록됩니다)`,
      confirmLabel: "일괄 적용 및 발행",
    });
    if (!ok) return;

    setApplyingBatch(true);
    let successCount = 0;
    const errors: string[] = [];
    try {
      for (const it of unapplied) {
        try {
          const res = await fetch(`/api/admin/community/crawl/items/${it.id}/publish`, {
            method: "POST",
            credentials: "include",
          });
          const j = (await res.json()) as { ok?: boolean; error?: string; communityPostId?: string };
          if (j.ok) {
            successCount++;
            setItems((prev) =>
              prev.map((item) =>
                item.id === it.id
                  ? {
                      ...item,
                      status: "PUBLISHED",
                      published: true,
                      published_post_id: j.communityPostId ?? item.published_post_id,
                    }
                  : item
              )
            );
          } else {
            errors.push(`${it.source_title}: ${j.error}`);
          }
        } catch (e) {
          errors.push(`${it.source_title}: ${String(e)}`);
        }
      }
      setSelectedIds(new Set());
      await dibayAlert({
        title: `일괄 적용 완료: ${successCount}건 성공${errors.length > 0 ? `, ${errors.length}건 실패` : ""}`,
      });
    } finally {
      setApplyingBatch(false);
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
          {props.boardId ? (
            <button
              type="button"
              className="rounded-ui-rect bg-sam-primary px-3 py-2 sam-text-body font-medium text-white disabled:opacity-50"
              disabled={loading || busy || crawlingBoard}
              onClick={() => void crawlBoardNow()}
            >
              {crawlingBoard ? "글 불러오는 중…" : "게시판 글 불러오기"}
            </button>
          ) : null}
          <button type="button" className={btnGhost} disabled={loading || busy} onClick={() => void load()}>
            {t("admin_community_crawl_items_refresh")}
          </button>
        </div>
      </div>

      {/* Batch toolbar */}
      {items.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-ui-rect border border-sam-border bg-sam-app p-2.5">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-sam-fg font-medium">
            <input
              type="checkbox"
              checked={selectedIds.size > 0 && selectedIds.size === items.length}
              onChange={toggleSelectAll}
            />
            전체 선택 ({selectedIds.size}/{items.length})
          </label>
          {selectedIds.size > 0 ? (
            <button
              type="button"
              className={btnPrimary}
              disabled={busy || applyingBatch}
              onClick={() => void applyBatchSelected()}
            >
              {applyingBatch ? "적용 중…" : `선택 항목 DIBAY 적용 (${selectedIds.size}건)`}
            </button>
          ) : null}
        </div>
      ) : null}

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
              className={`rounded-ui-rect border p-3 space-y-2 overflow-hidden transition-colors ${
                selectedIds.has(it.id)
                  ? "border-sam-primary bg-sam-primary/5"
                  : "border-sam-border bg-sam-app"
              }`}
            >
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center pt-1">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(it.id)}
                    onChange={() => toggleSelectItem(it.id)}
                    className="h-4 w-4 rounded"
                  />
                </div>
                <CoverPreview
                  url={it.thumb_url}
                  noneLabel={t("admin_community_crawl_preview_rep_none")}
                />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-semibold text-sam-fg break-words">
                      {it.dibay_title || it.source_title}
                    </div>
                    {it.published || it.status === "PUBLISHED" ? (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
                        DIBAY 적용 완료
                      </span>
                    ) : (
                      <span className="rounded-full bg-sam-surface px-2 py-0.5 text-xs text-sam-muted border border-sam-border">
                        대기 중 (Snapshot)
                      </span>
                    )}
                  </div>
                  <div className="sam-text-helper text-sam-muted break-words">
                    {it.display_author_name ? (
                      <span>{it.display_author_name} · </span>
                    ) : (
                      <span className="italic text-sam-muted">적용 시 필명 배정 · </span>
                    )}
                    {it.display_date ? (
                      <span>{formatWhen(it.display_date)} · </span>
                    ) : (
                      <span className="italic text-sam-muted">적용 시 날짜 배정 · </span>
                    )}
                    views {it.display_view_seed}
                  </div>
                  <div className="sam-text-helper text-sam-muted break-words">
                    {t("admin_community_crawl_item_category")}: {it.topic_name || "—"} ·{" "}
                    {t("admin_community_crawl_item_source")}: {it.source_name || "—"} ·{" "}
                    {t("admin_community_crawl_item_last_crawled")}: {formatWhen(it.last_crawled_at)} ·{" "}
                    {t("admin_community_crawl_item_media_status")}: {mediaStatusLabel(it.media_status, t)}
                    {it.body_media_count > 0
                      ? ` · ${t("admin_community_crawl_item_body_media_count", { n: it.body_media_count })}`
                      : ""}
                  </div>
                  <p className="sam-text-helper text-sam-muted line-clamp-2 break-words">
                    {(it.dibay_body || it.source_body_normalized).slice(0, 160)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-sam-border/60">
                <button
                  type="button"
                  className={btnGhost}
                  disabled={busy}
                  onClick={() => void openPureReadPreview(it)}
                >
                  PURE READ 미리보기
                </button>
                <button type="button" className={btnGhost} disabled={busy} onClick={() => openEdit(it)}>
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

                {/* Published link or Apply button */}
                {it.published || it.status === "PUBLISHED" ? (
                  it.published_post_id ? (
                    <a
                      href={`/philife/${it.published_post_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center rounded-ui-rect bg-emerald-500/20 px-3 py-2 sam-text-body font-medium text-emerald-400 border border-emerald-500/30 no-underline"
                    >
                      DIBAY 게시글 보기 →
                    </a>
                  ) : (
                    <span className="sam-text-helper text-emerald-400">발행 완료</span>
                  )
                ) : it.publish_cta_eligible ? (
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={busy}
                    onClick={() => void publishItem(it)}
                  >
                    DIBAY 적용
                  </button>
                ) : (
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

      {/* Pure Read Preview Modal (DB WRITE = 0) */}
      {preview ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-12">
          <div className="w-full max-w-md rounded-ui-rect border border-sam-border bg-sam-app shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-sam-border px-4 py-3 bg-sam-surface">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sam-fg">DIBAY 모바일 미리보기</span>
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-medium text-blue-400 border border-blue-500/30">
                  DB WRITE = 0
                </span>
              </div>
              <button
                type="button"
                className="text-sam-muted hover:text-sam-fg text-lg leading-none"
                onClick={() => {
                  setPreview(null);
                  setPureReadPreviewData(null);
                }}
              >
                ×
              </button>
            </div>

            {/* Mobile Viewport Simulation */}
            <div className="space-y-4 p-4 max-h-[min(80vh,680px)] overflow-y-auto">
              {previewLoading ? (
                <div className="py-12 text-center text-sam-muted sam-text-body">가상 미리보기 계산 중…</div>
              ) : pureReadPreviewData ? (
                <div className="space-y-3">
                  {/* Persona Header */}
                  <div className="flex items-center justify-between border-b border-sam-border/60 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-full bg-sam-primary/20 text-sam-primary font-bold flex items-center justify-center text-sm">
                        {pureReadPreviewData.display_author_name.slice(0, 1)}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-sam-fg">
                          {pureReadPreviewData.display_author_name}
                        </div>
                        <div className="text-xs text-sam-muted">
                          {formatWhen(pureReadPreviewData.display_date)} · 조회 {pureReadPreviewData.display_view_seed}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs text-sam-muted">{preview.topic_name}</span>
                  </div>

                  {/* Title */}
                  <h3 className="text-lg font-bold text-sam-fg leading-snug break-words">
                    {pureReadPreviewData.dibay_title}
                  </h3>

                  {/* Representative Cover Image */}
                  {pureReadPreviewData.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pureReadPreviewData.cover_image_url}
                      alt=""
                      className="w-full rounded-ui-rect object-cover max-h-72 bg-sam-surface"
                    />
                  ) : null}

                  {/* Body Content */}
                  <div className="text-sm text-sam-fg whitespace-pre-wrap break-words leading-relaxed pt-1">
                    {pureReadPreviewData.dibay_body}
                  </div>

                  {/* Attribution if visible */}
                  {pureReadPreviewData.public_attribution_mode === "VISIBLE" ? (
                    <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-2.5 text-xs text-sam-muted space-y-1">
                      <div>출처: {preview.source_name}</div>
                      <div className="break-all text-[11px] text-sam-muted/80">
                        {pureReadPreviewData.canonical_url}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sam-fg">{preview.dibay_title || preview.source_title}</h4>
                  <p className="text-sm text-sam-fg whitespace-pre-wrap break-words">
                    {preview.dibay_body || preview.source_body_normalized}
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-sam-border bg-sam-surface p-3">
              <button
                type="button"
                className={btnGhost}
                onClick={() => {
                  setPreview(null);
                  setPureReadPreviewData(null);
                }}
              >
                닫기
              </button>
              {!preview.published && preview.status !== "PUBLISHED" ? (
                <button
                  type="button"
                  className={btnPrimary}
                  disabled={busy}
                  onClick={() => {
                    const it = preview;
                    setPreview(null);
                    setPureReadPreviewData(null);
                    void publishItem(it);
                  }}
                >
                  이 글 DIBAY 적용 및 발행
                </button>
              ) : null}
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
