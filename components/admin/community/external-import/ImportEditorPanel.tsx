"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminActionButton, AdminActionLink } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { allowsFullContent, allowsHiddenAttribution, RIGHTS_LABEL } from "@/lib/community-operator-import/rights";
import type { OperatorContentBlock, OperatorDraftEdit } from "@/lib/community-operator-import/types";
import { VerdictBadge } from "./ImportSourcesPanel";
import { call, type ContentPolicy, type DetailPayload, fmtDate, type InboxRow, POLICY_LABEL, type PublishContent, STATUS_LABEL, type TopicOption, importErrorText } from "./api";

export function Blocks({ blocks }: { blocks: OperatorContentBlock[] }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-sam-fg break-words">
      {blocks.map((b, i) => {
        if (b.type === "image")
          return (
            <figure key={i}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.displaySrc || b.url} alt={b.alt || ""} referrerPolicy="no-referrer" loading="lazy" className="block max-h-72 w-auto max-w-full rounded-ui-rect border border-sam-border bg-sam-app" />
              {b.caption ? <figcaption className="text-[12px] text-sam-muted">{b.caption}</figcaption> : null}
            </figure>
          );
        if (b.type === "table")
          return (
            <table key={i} className="w-full border-collapse text-xs">
              <tbody>
                {b.rows.map((r, ri) => (
                  <tr key={ri} className="border-b border-sam-border">
                    {r.map((c, ci) =>
                      ri === 0 && b.header ? (
                        <th key={ci} className="px-1.5 py-1 text-left font-semibold">
                          {c}
                        </th>
                      ) : (
                        <td key={ci} className="px-1.5 py-1">
                          {c}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        if (b.type === "heading") return <p key={i} className="font-semibold">{b.text}</p>;
        if (b.type === "quote") return <blockquote key={i} className="border-l-2 border-sam-border pl-2 text-sam-muted">{b.text}</blockquote>;
        if (b.type === "list")
          return (
            <ul key={i} className="list-disc pl-5">
              {b.items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ul>
          );
        if (b.type === "link")
          return (
            <a key={i} href={b.href || "#"} target="_blank" rel="noreferrer noopener" className="underline text-sam-primary">
              {b.text || b.href}
            </a>
          );
        return <p key={i} className="whitespace-pre-wrap">{b.text}</p>;
      })}
    </div>
  );
}

type Props = {
  row: InboxRow;
  topics: TopicOption[];
  onClose: () => void;
  onChanged: () => void;
};

export function ImportEditorPanel({ row, topics, onClose, onChanged }: Props) {
  const { t: tr } = useI18n();
  const [data, setData] = useState<DetailPayload | null>(null);
  const [edit, setEdit] = useState<OperatorDraftEdit | null>(null);
  const [preview, setPreview] = useState<PublishContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [acceptPartial, setAcceptPartial] = useState(false);
  const [view, setView] = useState<"compare" | "source" | "result">("compare");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setData(null);
    const p = new URLSearchParams({ site: row.sourceSite, board: row.sourceBoard, key: row.sourceArticleKey });
    call<DetailPayload>(`/detail?${p.toString()}`)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setEdit(d.edit);
        setPreview(d.preview);
      })
      .catch((e) => alive && setMsg({ tone: "err", text: tr("admin_community_import_editor_load_failed", { error: importErrorText(e) }) }))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [row.sourceSite, row.sourceBoard, row.sourceArticleKey, reloadToken, tr]);

  const images = useMemo(
    () =>
      (data?.article.orderedContentBlocks ?? [])
        .map((b, i) => ({ b, i }))
        .filter((x): x is { b: Extract<OperatorContentBlock, { type: "image" }>; i: number } => x.b.type === "image"),
    [data],
  );

  if (loading) return <div className="p-4 text-xs text-sam-muted">{tr("admin_community_import_editor_loading")}</div>;
  if (!data || !edit) {
    return (
      <div className="p-4 space-y-2">
        <p className="text-xs text-sam-danger break-words">{msg?.text ?? tr("admin_community_import_editor_cannot_load")}</p>
        <a className="text-xs underline" href={row.canonicalUrl} target="_blank" rel="noreferrer noopener">
          {tr("admin_community_import_editor_open_original")}
        </a>
        <AdminActionButton variant="neutral" onClick={onClose}>
          {tr("admin_community_import_editor_close")}
        </AdminActionButton>
      </div>
    );
  }

  const a = data.article;
  const q = a.quality;
  const post = data.post;
  const published = Boolean(post || data.inbox?.publishedPostId || data.draft?.publishedPostId);
  const set = (patch: Partial<OperatorDraftEdit>) => setEdit({ ...edit, ...patch });
  const topic = topics.find((t) => t.id === edit.topicId);
  const postTopic = post ? topics.find((t) => t.slug === post.topicSlug) : undefined;
  const POST_STATUS: Record<string, MessageKey> = {
    active: "admin_community_import_editor_post_active",
    hidden: "admin_community_import_editor_post_hidden",
    deleted: "admin_community_import_editor_post_deleted",
  };
  const postStatusLabel = (s: string) => (POST_STATUS[s] ? tr(POST_STATUS[s]) : s);

  const save = async (action: "save" | "preview") => {
    setBusy(action);
    setMsg(null);
    try {
      const r = await call<{ preview: PublishContent }>("/drafts", { body: { article: a, edit, action } });
      setPreview(r.preview);
      if (action === "save") {
        setMsg({ tone: "ok", text: tr("admin_community_import_editor_draft_saved") });
        onChanged();
      }
    } catch (e) {
      setMsg({ tone: "err", text: importErrorText(e) });
    } finally {
      setBusy(null);
    }
  };

  // 게시·업데이트 = save (L1 확인) — 운영자 작성 글 저장. 확인 경로는 confirmAdminAction 하나.
  const publish = async () => {
    if (busy) return;
    const policyNow = edit.contentPolicy ?? data.source.contentPolicy;
    const c = await confirmAdminAction({
      level: adminActionLevel("save"),
      ko: true,
      title: published ? tr("admin_community_import_editor_confirm_update_title") : tr("admin_community_import_editor_confirm_publish_title"),
      description: `${tr("admin_community_import_editor_confirm_desc", {
        topic: topic?.name ?? "-",
        policy: tr(POLICY_LABEL[preview?.policy ?? policyNow]),
        title: preview?.title || edit.displayTitle,
      })}${
        post && post.status !== "active" ? ` · ${tr("admin_community_import_editor_confirm_desc_status", { status: postStatusLabel(post.status) })}` : ""
      }`,
      confirmLabel: published ? tr("admin_community_import_editor_update_btn") : tr("admin_community_import_editor_publish_btn"),
    });
    if (!c.ok) return;
    setBusy("publish");
    setMsg(null);
    try {
      const r = await call<{ postId: string; mode: string; imageCount: number; topicSlug: string; warnings: string[] }>("/publish", {
        body: { article: a, edit, mode: published ? "update" : "create", acceptPartial },
      });
      const tName = topics.find((t) => t.slug === r.topicSlug)?.name ?? r.topicSlug;
      setMsg({
        tone: "ok",
        text: `${tr("admin_community_import_editor_publish_done", {
          mode: r.mode === "update" ? tr("admin_community_import_editor_update_btn") : tr("admin_community_import_editor_publish_btn"),
          topic: tName,
          n: r.imageCount,
        })}${r.warnings.length ? ` · ${tr("admin_community_import_editor_warnings", { list: r.warnings.join(", ") })}` : ""}`,
      });
      onChanged();
      setReloadToken((n) => n + 1);
    } catch (e) {
      setMsg({ tone: "err", text: importErrorText(e) });
    } finally {
      setBusy(null);
    }
  };

  // Post management goes through the admin community post API (audit-logged, same as 게시글 관리).
  // 숨김 = sanction (L2 · 게시글 API 가 숨김 사유 필수) · 다시 공개 = resume (L1) · 삭제 = delete (L3 · 사유 + 제목 재입력).
  // 사유는 게시글 API 본문 `reason` 으로 보내고, 그 API 가 감사 기록에 남긴다.
  const setPostStatus = async (status: "active" | "hidden" | "deleted") => {
    if (!post || busy) return;
    const postLabel = post.title?.trim() || post.id;
    const c = await confirmAdminAction({
      level: adminActionLevel(status === "deleted" ? "delete" : status === "hidden" ? "sanction" : "resume"),
      ko: true,
      title:
        status === "deleted"
          ? tr("admin_community_import_editor_confirm_delete_title")
          : status === "hidden"
            ? tr("admin_community_import_editor_confirm_hide_title")
            : tr("admin_community_import_editor_confirm_reopen_title"),
      description: tr(
        status === "active" ? "admin_community_import_editor_status_desc_visible" : "admin_community_import_editor_status_desc_hidden",
        { title: post.title ?? "" },
      ),
      confirmLabel:
        status === "deleted"
          ? tr("admin_community_import_editor_delete_btn")
          : status === "hidden"
            ? tr("admin_community_import_editor_hide_btn")
            : tr("admin_community_import_editor_reopen_btn"),
      destructive: status === "deleted",
      retypeValue: status === "deleted" ? postLabel : undefined,
    });
    if (!c.ok) return;
    setBusy("status");
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/community/engine/posts/${encodeURIComponent(post.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(c.reason ? { status, reason: c.reason } : { status }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setMsg({ tone: "ok", text: tr("admin_community_import_editor_status_changed", { status: postStatusLabel(status) }) });
      onChanged();
      setReloadToken((n) => n + 1);
    } catch (e) {
      setMsg({ tone: "err", text: tr("admin_community_import_editor_status_failed", { error: importErrorText(e) }) });
    } finally {
      setBusy(null);
    }
  };

  const ex = a.extraction;
  const policy = edit.contentPolicy ?? data.source.contentPolicy;

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-sam-border">
        <AdminActionButton variant="neutral" onClick={onClose}>
          {tr("admin_community_import_editor_back_list")}
        </AdminActionButton>
        <span className="text-xs text-sam-muted truncate">
          {data.source.displayName} · {data.board.displayName}
        </span>
        <span className="rounded-full border border-sam-border px-1.5 text-[12px]">{tr(STATUS_LABEL[data.inbox?.status ?? "new"])}</span>
        {q ? <VerdictBadge v={q.verdict} /> : null}
        <span className="ml-auto flex gap-1">
          {(["compare", "source", "result"] as const).map((v) => (
            <AdminActionButton key={v} variant={view === v ? "secondary" : "quiet"} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === "compare" ? tr("admin_community_import_editor_view_compare") : v === "source" ? tr("admin_community_import_editor_view_source") : tr("admin_community_import_editor_view_result")}
            </AdminActionButton>
          ))}
        </span>
      </div>

      {q && q.reasons.length ? (
        <div className="shrink-0 px-3 py-1.5 text-[12px] bg-sam-warning-soft text-sam-warning border-b border-sam-warning">
          {tr("admin_community_import_editor_quality", { reasons: q.reasons.map((r) => data.qualityLabels[r] || r).join(" · ") })}
          {ex ? ` ${tr("admin_community_import_editor_extraction", { source: ex.bodySource, n: ex.sourceImageCount })}` : ""}
        </div>
      ) : null}

      {post ? (
        <div data-testid="import-post-manage" className="shrink-0 flex flex-wrap items-center gap-2 px-3 py-2 border-b border-sam-border bg-sam-app text-xs">
          <span className="font-semibold text-sam-fg">{tr("admin_community_import_editor_published_post")}</span>
          <span className="rounded-full border border-sam-border px-2 py-0.5">{POST_STATUS[post.status] ?? post.status}</span>
          <span className="text-sam-muted">
            {tr("admin_community_import_editor_post_topic", { topic: postTopic?.name ?? post.topicSlug })}
          </span>
          <span className="text-sam-muted">{tr("admin_community_import_editor_post_updated", { date: fmtDate(post.updatedAt) })}</span>
          <span className="ml-auto flex flex-wrap gap-1.5">
            <AdminActionLink variant="neutral" href={`/philife/${post.id}`} target="_blank" rel="noreferrer">
              {tr("admin_community_import_editor_view_in_community")}
            </AdminActionLink>
            <AdminActionLink variant="neutral" href={`/admin/community/posts/${post.id}`}>
              {tr("admin_community_import_editor_post_admin")}
            </AdminActionLink>
            {post.status === "active" ? (
              <AdminActionButton variant="neutral" disabled={!!busy} onClick={() => void setPostStatus("hidden")}>
                {tr("admin_community_import_editor_hide")}
              </AdminActionButton>
            ) : (
              <AdminActionButton variant="neutral" disabled={!!busy} onClick={() => void setPostStatus("active")}>
                {tr("admin_community_import_editor_restore")}
              </AdminActionButton>
            )}
            {post.status !== "deleted" ? (
              // 삭제 = 상태 변경(「다시 공개」로 복구 가능) — danger 아님
              <AdminActionButton variant="neutral" disabled={!!busy} onClick={() => void setPostStatus("deleted")}>
                {tr("admin_community_import_editor_delete")}
              </AdminActionButton>
            ) : null}
          </span>
        </div>
      ) : null}

      <div className={`flex-1 min-h-0 overflow-auto grid gap-3 p-3 ${view === "compare" ? "lg:grid-cols-2" : ""}`}>
        {view !== "result" ? (
          <section className="space-y-2 min-w-0">
            <div className="text-[12px] font-semibold text-sam-muted">{tr("admin_community_import_editor_original")}</div>
            <h3 className="text-base font-semibold break-words">{a.title}</h3>
            <div className="text-[12px] text-sam-muted">
              {a.author || tr("admin_community_import_no_author")} · {fmtDate(a.sourcePublishedDate) || tr("admin_community_import_no_date")} ·{" "}
              <a className="underline" href={a.canonicalUrl} target="_blank" rel="noreferrer noopener">
                {tr("admin_community_import_editor_article_open_original")}
              </a>
            </div>
            <Blocks blocks={a.orderedContentBlocks} />
          </section>
        ) : null}

        {view !== "source" ? (
          <section className="space-y-3 min-w-0">
            <div className="text-[12px] font-semibold text-sam-muted">{tr("admin_community_import_editor_result")}</div>
            <label className="block text-xs text-sam-muted">
              {tr("admin_community_import_editor_title")}
              <input aria-label={tr("admin_community_import_editor_title")} className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5" value={edit.displayTitle} onChange={(e) => set({ displayTitle: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-sam-muted">
                {tr("admin_community_import_dibay_topic")}
                <select
                  aria-label={tr("admin_community_import_dibay_topic")}
                  className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5"
                  value={edit.topicId ?? ""}
                  onChange={(e) => {
                    const t = topics.find((x) => x.id === e.target.value);
                    set({ topicId: t?.id ?? null, topicSlug: t?.slug ?? null });
                  }}
                >
                  <option value="">{tr("admin_community_import_editor_select_topic")}</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-sam-muted">
                {tr("admin_community_import_editor_field_policy")}
                <select
                  className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5"
                  value={policy}
                  onChange={(e) => set({ contentPolicy: e.target.value as ContentPolicy })}
                >
                  {(Object.keys(POLICY_LABEL) as ContentPolicy[]).map((p) => (
                    <option key={p} value={p} disabled={p === "full" && !allowsFullContent(data.source.rights)}>
                      {tr(POLICY_LABEL[p])}
                      {p === data.source.contentPolicy ? ` · ${tr("admin_community_import_editor_source_default")}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs text-sam-muted">
                {tr("admin_community_import_editor_field_display_author")}
                <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5" value={edit.displayAuthor} onChange={(e) => set({ displayAuthor: e.target.value })} />
              </label>
              <label className="block text-xs text-sam-muted">
                {tr("admin_community_import_editor_field_display_date")}
                <input
                  className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5 disabled:opacity-50"
                  value={edit.displayDate}
                  disabled={edit.dateMode === "publish"}
                  onChange={(e) => set({ displayDate: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-sam-muted">
                <input type="checkbox" checked={edit.dateMode === "publish"} onChange={(e) => set({ dateMode: e.target.checked ? "publish" : "original" })} />
                {tr("admin_community_import_editor_use_publish_time")}
              </label>
              <label className="flex items-center gap-1.5 text-xs text-sam-muted">
                <input
                  type="checkbox"
                  checked={edit.showAttribution !== false || !allowsHiddenAttribution(data.source.rights)}
                  disabled={!allowsHiddenAttribution(data.source.rights)}
                  onChange={(e) => set({ showAttribution: e.target.checked })}
                />
                {tr("admin_community_import_editor_show_attribution")}
                {!allowsHiddenAttribution(data.source.rights) ? ` — ${tr("admin_community_import_editor_attribution_required")}` : ""}
              </label>
              <p className="col-span-2 text-[12px] text-sam-muted">
                {tr("admin_community_import_editor_rights", { rights: RIGHTS_LABEL[data.source.rights.rightsBasis] })}
                {data.preview.cappedByRights ? ` · ${tr("admin_community_import_editor_capped_by_rights")}` : ""}
              </p>
            </div>
            {policy === "summary_link" ? (
              <label className="block text-xs text-sam-muted">
                {tr("admin_community_import_editor_field_summary")}
                <textarea className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5 min-h-[80px]" value={edit.summaryText ?? ""} onChange={(e) => set({ summaryText: e.target.value })} />
              </label>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-sam-muted">
                {tr("admin_community_import_editor_field_replace_from")}
                <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5" value={edit.replaceFrom} onChange={(e) => set({ replaceFrom: e.target.value })} />
              </label>
              <label className="block text-xs text-sam-muted">
                {tr("admin_community_import_editor_field_replace_to")}
                <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-sm mt-0.5" value={edit.replaceTo} onChange={(e) => set({ replaceTo: e.target.value })} />
              </label>
            </div>
            {images.length ? (
              <div>
                <div className="text-xs text-sam-muted mb-1">{tr("admin_community_import_editor_images_hint")}</div>
                <div className="flex flex-wrap gap-2">
                  {images.map(({ b, i }) => {
                    const included = edit.imageIncludes[String(i)] !== false;
                    const thumb = edit.thumbnailImageIndex === i;
                    return (
                      <div key={i} className={`relative rounded-ui-rect border ${thumb ? "border-sam-primary" : "border-sam-border"} p-1`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={b.displaySrc || b.url} alt="" referrerPolicy="no-referrer" loading="lazy" className={`w-20 h-16 object-cover rounded ${included ? "" : "opacity-30"}`} />
                        <div className="flex items-center justify-between mt-0.5">
                          <input
                            type="checkbox"
                            checked={included}
                            onChange={(e) => set({ imageIncludes: { ...edit.imageIncludes, [String(i)]: e.target.checked } })}
                          />
                          <AdminActionButton variant="quiet" size="sm" aria-label={tr("admin_community_import_editor_set_thumbnail")} className="px-1!" disabled={!included} onClick={() => set({ thumbnailImageIndex: i })}>
                            {thumb ? "★" : "☆"}
                          </AdminActionButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="rounded-ui-rect border border-sam-border p-2 space-y-2">
              <div className="flex items-center gap-2 text-[12px] text-sam-muted">
                {tr("admin_community_import_editor_preview_heading", { policy: tr(POLICY_LABEL[preview?.policy ?? policy]) })}
                <AdminActionButton variant="neutral" className="ml-auto" disabled={!!busy} onClick={() => void save("preview")}>
                  {busy === "preview" ? tr("admin_community_import_editor_calculating") : tr("admin_community_import_editor_refresh_preview")}
                </AdminActionButton>
              </div>
              {preview ? (
                <>
                  <p className="font-semibold text-sm break-words">{preview.title}</p>
                  <Blocks blocks={preview.blocks} />
                </>
              ) : null}
            </div>
          </section>
        ) : (
          <section className="space-y-2">
            {preview ? (
              <>
                <p className="font-semibold break-words">{preview.title}</p>
                <Blocks blocks={preview.blocks} />
              </>
            ) : null}
          </section>
        )}
      </div>

      <div className="shrink-0 border-t border-sam-border px-3 py-2 space-y-1.5 bg-sam-surface">
        {msg ? <p className={`text-xs break-words ${msg.tone === "err" ? "text-sam-danger" : "text-sam-success"}`}>{msg.text}</p> : null}
        {q?.verdict === "PARTIAL" ? (
          <label className="flex items-center gap-1 text-[12px] text-sam-muted">
            <input type="checkbox" checked={acceptPartial} onChange={(e) => setAcceptPartial(e.target.checked)} />
            {tr("admin_community_import_editor_accept_partial")}
          </label>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <AdminActionButton variant="secondary" disabled={!!busy} onClick={() => void save("save")}>
            {busy === "save" ? tr("admin_community_import_editor_saving") : tr("admin_community_import_editor_save_draft")}
          </AdminActionButton>
          <AdminActionButton
            variant="primary"
            disabled={!!busy || !topic || q?.verdict === "FAILED" || (q?.verdict === "PARTIAL" && !acceptPartial)}
            onClick={() => void publish()}
          >
            {busy === "publish" ? tr("admin_community_import_editor_processing") : published ? tr("admin_community_import_editor_update_post") : tr("admin_community_import_editor_publish_to_dibay")}
          </AdminActionButton>
          {!topic ? (
            <span className="text-[12px] text-sam-muted self-center">{tr("admin_community_import_editor_need_topic")}</span>
          ) : null}
          {q?.verdict === "FAILED" ? (
            <span className="text-[12px] text-sam-danger self-center">{tr("admin_community_import_editor_failed_quality")}</span>
          ) : null}
        </div>
        {post ? (
          <p className="text-[12px] text-sam-muted">
            {tr("admin_community_import_editor_update_overwrites")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
