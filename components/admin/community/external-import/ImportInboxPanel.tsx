"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import {
  CommunityFilterBar,
  CommunityFilterField,
  CommunityListEmpty,
  CommunityListPagination,
  CommunitySelect,
  type CommunityListQuery,
} from "@/components/admin/community/kit/CommunityAdminKit";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel } from "@/lib/admin/operator-ux/admin-action-levels";
import { VerdictBadge } from "./ImportSourcesPanel";
import {
  call,
  type ContentPolicy,
  fmtDate,
  type InboxRow,
  type JobSummary,
  keyOf,
  type ManagedSource,
  POLICY_LABEL,
  STATUS_LABEL,
  type TopicOption, importErrorState, importErrorText } from "./api";
import type { MessageKey } from "@/lib/i18n/messages";

/** API 필터 ("" = 전체) — 주소(URL)는 부모의 `useCommunityListQuery` 가 관리 */
export type InboxFilter = { site: string; board: string; status: string; quality: string; lang: string; q: string };

/** 수집함 「처리 대기」 상태 묶음 (부모 기본값과 같다) */
const INBOX_WAITING = "new,draft,source_updated,failed";

type AuthorMode = "keep" | "original" | "source" | "custom";
type DateMode = "keep" | "original" | "publish";

const AUTHOR_MODE_LABEL: Record<AuthorMode, MessageKey> = {
  keep: "admin_community_import_inbox_author_keep",
  original: "admin_community_import_inbox_author_original",
  source: "admin_community_import_inbox_author_source",
  custom: "admin_community_import_inbox_author_custom",
};
const DATE_MODE_LABEL: Record<DateMode, MessageKey> = {
  keep: "admin_community_import_inbox_date_keep",
  original: "admin_community_import_inbox_date_original",
  publish: "admin_community_import_inbox_date_publish",
};

/** `datetime-local` value for now (+offset minutes), local clock. */
function localInputValue(offsetMin = 0): string {
  const d = new Date(Date.now() + offsetMin * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  sources: ManagedSource[];
  topics: TopicOption[];
  filter: InboxFilter;
  /** 조회 조건(주소) — 필터 바·페이지네이션 (20/50/100) */
  lq: CommunityListQuery<"site" | "board" | "quality" | "lang">;
  activeKey: string | null;
  onOpen: (row: InboxRow) => void;
  refreshToken: number;
  onJobDone: () => void;
};

export function ImportInboxPanel({ sources, topics, filter, lq, activeKey, onOpen, refreshToken, onJobDone }: Props) {
  const { t: tr } = useI18n();
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  /** 목록 조회 실패 (code + httpStatus — 403 은 권한 없음) */
  const [loadErr, setLoadErr] = useState<{ code: string; status: number } | null>(null);
  /** 일괄 작업·상태 변경 실패 문구 */
  const [error, setError] = useState<string | null>(null);
  const pageSize = lq.query.size;
  const offset = (lq.query.page - 1) * pageSize;
  const [selected, setSelected] = useState<Map<string, InboxRow>>(new Map());
  const [bulkTopic, setBulkTopic] = useState("");
  const [bulkPolicy, setBulkPolicy] = useState<"" | ContentPolicy>("");
  const [acceptPartial, setAcceptPartial] = useState(false);
  const [bulkAttribution, setBulkAttribution] = useState<"" | "show" | "hide">("");
  const [authorMode, setAuthorMode] = useState<AuthorMode>("keep");
  const [customAuthor, setCustomAuthor] = useState("");
  const [dateMode, setDateMode] = useState<DateMode>("keep");
  const [shuffle, setShuffle] = useState(true);
  const [scheduleMode, setScheduleMode] = useState<"now" | "spread">("now");
  const [startAt, setStartAt] = useState(() => localInputValue(5));
  const [intervalMin, setIntervalMin] = useState(60);
  const [job, setJob] = useState<JobSummary | null>(null);
  const [jobBusy, setJobBusy] = useState(false);

  const boards = useMemo(() => sources.find((s) => s.id === filter.site)?.boards ?? [], [sources, filter.site]);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (filter.site) p.set("site", filter.site);
    if (filter.board) p.set("board", filter.board);
    if (filter.status) p.set("status", filter.status);
    if (filter.quality) p.set("quality", filter.quality);
    if (filter.lang) p.set("lang", filter.lang);
    if (filter.q) p.set("q", filter.q);
    p.set("limit", String(pageSize));
    p.set("offset", String(offset));
    try {
      const r = await call<{ rows: InboxRow[]; total: number }>(`/inbox?${p.toString()}`);
      setRows(r.rows);
      setTotal(r.total);
      setLoadErr(null);
    } catch (e) {
      // 실패해도 직전 목록은 지우지 않는다 (지시서 §8-5)
      setLoadErr(importErrorState(e));
    } finally {
      setLoading(false);
    }
  }, [filter, offset, pageSize]);

  useEffect(() => {
    void load();
  }, [load, refreshToken, lq.refreshKey]);

  // Selection is tied to the filter: changing it clears selection (no hidden cross-filter selection).
  // 쪽 이동은 조건 변경 시 1쪽으로 (useCommunityListQuery 규칙).
  useEffect(() => {
    setSelected(new Map());
  }, [filter.site, filter.board, filter.status, filter.quality, filter.lang, filter.q]);

  const toggle = (r: InboxRow) => {
    const next = new Map(selected);
    const k = keyOf(r);
    if (next.has(k)) next.delete(k);
    else next.set(k, r);
    setSelected(next);
  };
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(keyOf(r)));
  const togglePage = () => {
    const next = new Map(selected);
    if (allOnPage) rows.forEach((r) => next.delete(keyOf(r)));
    else rows.forEach((r) => next.set(keyOf(r), r));
    setSelected(next);
  };

  const selList = [...selected.values()];
  const counts = {
    unpublished: selList.filter((r) => !r.publishedPostId).length,
    published: selList.filter((r) => r.publishedPostId).length,
  };

  /**
   * 선택 글 일괄 작업. 게시·업데이트·숨김·다시 공개 = bulk (L3: 사유 + 대상 건수 재입력 → 작업 API `reason` → 감사 기록).
   * 재수집은 게시물을 바꾸지 않는 원문 재수집이라 save (L1 확인).
   */
  const runJob = async (kind: "publish" | "update" | "hide" | "unhide" | "reprocess") => {
    if (jobBusy) return;
    const items = selList
      .filter((r) => (kind === "publish" ? !r.publishedPostId : kind === "reprocess" ? true : Boolean(r.publishedPostId)))
      .map((r) => ({ sourceSite: r.sourceSite, sourceBoard: r.sourceBoard, sourceArticleKey: r.sourceArticleKey }));
    if (!items.length) return;
    const topic = topics.find((t) => t.id === bulkTopic);
    const publishing = kind === "publish" || kind === "update";
    const spread = kind === "publish" && scheduleMode === "spread";
    const confirmed = await confirmAdminAction({
      level: adminActionLevel(kind === "reprocess" ? "save" : "bulk"),
      ko: true,
      title:
        kind === "publish"
          ? tr("admin_community_import_inbox_bulk_publish_title", { n: items.length })
          : kind === "update"
            ? tr("admin_community_import_inbox_bulk_update_title", { n: items.length })
            : kind === "hide"
              ? tr("admin_community_import_inbox_bulk_hide_title", { n: items.length })
              : kind === "unhide"
                ? tr("admin_community_import_inbox_bulk_unhide_title", { n: items.length })
                : tr("admin_community_import_inbox_bulk_reprocess_title", { n: items.length }),
      description: publishing
        ? `${tr("admin_community_import_inbox_bulk_desc", {
            topic: topic?.name ?? tr("admin_community_import_inbox_bulk_default_topic"),
            policy: bulkPolicy ? tr(POLICY_LABEL[bulkPolicy]) : tr("admin_community_import_inbox_bulk_source_default"),
            attribution:
              bulkAttribution === "hide"
                ? tr("admin_community_import_inbox_bulk_attr_hide")
                : bulkAttribution === "show"
                  ? tr("admin_community_import_inbox_bulk_attr_show")
                  : tr("admin_community_import_inbox_bulk_attr_per_post"),
            author: tr(AUTHOR_MODE_LABEL[authorMode]),
            date: tr(DATE_MODE_LABEL[dateMode]),
            partial: acceptPartial ? tr("admin_community_import_inbox_bulk_include") : tr("admin_community_import_inbox_bulk_exclude"),
          })} ${
            spread
              ? tr(shuffle ? "admin_community_import_inbox_bulk_spread_random" : "admin_community_import_inbox_bulk_spread", {
                  start: startAt.replace("T", " "),
                  n: intervalMin,
                })
              : tr(kind === "publish" && shuffle ? "admin_community_import_inbox_bulk_immediate_random" : "admin_community_import_inbox_bulk_immediate")
          }`
        : kind === "reprocess"
          ? tr("admin_community_import_inbox_bulk_reprocess_desc")
          : tr("admin_community_import_inbox_bulk_visibility_desc"),
      confirmLabel:
        kind === "publish"
          ? tr("admin_community_import_editor_publish_btn")
          : kind === "update"
            ? tr("admin_community_import_editor_update_btn")
            : kind === "hide"
              ? tr("admin_community_import_editor_hide_btn")
              : kind === "unhide"
                ? tr("admin_community_import_editor_reopen_btn")
                : tr("admin_community_import_inbox_bulk_reprocess_btn"),
      destructive: kind === "hide",
      retypeValue: tr("admin_community_import_inbox_bulk_retype", { n: items.length }),
    });
    if (!confirmed.ok) return;
    setJobBusy(true);
    try {
      const r = await call<{ job: JobSummary }>("/jobs", {
        body: {
          action: "create",
          kind,
          ...(confirmed.reason ? { reason: confirmed.reason } : {}),
          items,
          params: {
            topicId: topic?.id ?? null,
            topicSlug: topic?.slug ?? null,
            acceptPartial,
            contentPolicy: bulkPolicy || null,
            ...(publishing
              ? {
                  showAttribution: bulkAttribution === "show" ? true : bulkAttribution === "hide" ? false : null,
                  authorMode,
                  customAuthor: authorMode === "custom" ? customAuthor : null,
                  dateMode,
                }
              : {}),
            shuffle: kind === "publish" && shuffle,
            schedule: spread ? { mode: "spread", startAt: new Date(startAt).toISOString(), intervalMinutes: intervalMin } : null,
          },
        },
      });
      await followJob(r.job);
      setSelected(new Map());
    } catch (e) {
      setError(importErrorText(e));
    } finally {
      setJobBusy(false);
    }
  };

  /** Runs chunks while items are due now; a spread job then continues on the server cron. */
  const followJob = async (start: JobSummary) => {
    let cur = start;
    setJob(cur);
    while ((cur.status === "running" || cur.status === "queued") && !cur.nextDueAt) {
      cur = (await call<{ job: JobSummary }>("/jobs", { body: { action: "run", jobId: cur.id } })).job;
      setJob(cur);
    }
    onJobDone();
    await load();
  };

  const jobAction = async (action: "retry_failed" | "cancel" | "run") => {
    if (!job) return;
    setJobBusy(true);
    try {
      const r = await call<{ job: JobSummary | null }>("/jobs", { body: { action, jobId: job.id } });
      if (r.job) await followJob(r.job);
    } catch (e) {
      setError(importErrorText(e));
    } finally {
      setJobBusy(false);
    }
  };

  const setStatus = async (status: "hidden" | "skipped" | "new") => {
    const keys = selList.map((r) => ({ sourceSite: r.sourceSite, sourceBoard: r.sourceBoard, sourceArticleKey: r.sourceArticleKey }));
    try {
      await call("/inbox", { body: { action: "status", keys, status } });
      setSelected(new Map());
      await load();
    } catch (e) {
      setError(importErrorText(e));
    }
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="shrink-0 border-b border-sam-border p-2">
        <CommunityFilterBar lq={lq} showPeriod={false} searchPlaceholder={tr("admin_community_import_inbox_search_title")} pending={loading}>
          <CommunityFilterField label={tr("admin_community_import_inbox_filter_source")}>
            <CommunitySelect
              value={lq.query.extras.site}
              onChange={(v) => lq.patch({ extras: { site: v, board: "" } })}
              options={[{ value: "", label: tr("admin_community_import_inbox_all_sources") }, ...sources.map((s) => ({ value: s.id, label: s.displayName }))]}
            />
          </CommunityFilterField>
          <CommunityFilterField label={tr("admin_community_import_inbox_filter_board")}>
            <CommunitySelect
              value={lq.query.extras.board}
              onChange={(v) => lq.setExtra("board", v)}
              options={[{ value: "", label: tr("admin_community_import_inbox_all_boards") }, ...boards.map((b) => ({ value: b.boardId, label: b.displayName }))]}
            />
          </CommunityFilterField>
          <CommunityFilterField label={tr("admin_community_import_inbox_filter_status")}>
            <CommunitySelect
              value={lq.query.status === "all" ? "" : lq.query.status}
              onChange={(v) => lq.setStatus(v)}
              options={[
                { value: INBOX_WAITING, label: tr("admin_community_import_inbox_status_waiting") },
                { value: "", label: tr("admin_community_import_inbox_status_all") },
                ...Object.entries(STATUS_LABEL).map(([k, v]) => ({ value: k, label: tr(v) })),
              ]}
            />
          </CommunityFilterField>
          <CommunityFilterField label={tr("admin_community_import_inbox_filter_quality")}>
            <CommunitySelect
              value={lq.query.extras.quality}
              onChange={(v) => lq.setExtra("quality", v)}
              options={[
                { value: "", label: tr("admin_community_import_inbox_quality_all") },
                { value: "FULL", label: tr("admin_community_import_verdict_full") },
                { value: "PARTIAL", label: tr("admin_community_import_verdict_partial") },
                { value: "FAILED", label: tr("admin_community_import_verdict_failed") },
                { value: "none", label: tr("admin_community_import_sources_unchecked") },
              ]}
            />
          </CommunityFilterField>
          <CommunityFilterField label={tr("admin_community_import_inbox_filter_lang")}>
            <CommunitySelect
              value={lq.query.extras.lang || "ko"}
              onChange={(v) => lq.setExtra("lang", v)}
              options={[
                { value: "ko", label: tr("admin_community_import_inbox_lang_ko") },
                { value: "all", label: tr("admin_community_import_inbox_lang_all") },
                { value: "other", label: tr("admin_community_import_inbox_lang_other") },
              ]}
            />
          </CommunityFilterField>
        </CommunityFilterBar>
      </div>

      <div className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-sam-muted border-b border-sam-border shrink-0">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={allOnPage} onChange={togglePage} /> {tr("admin_community_import_inbox_select_page")}
        </label>
        <span className="ml-auto flex gap-1">
          <AdminActionButton variant="neutral" disabled={loading} onClick={() => void load()}>
            {tr("admin_community_import_inbox_reload")}
          </AdminActionButton>
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {error ? <p role="alert" className="p-3 text-xs text-sam-danger break-words">{error}</p> : null}
        {loadErr ? (
          <div className="p-2">
            <AdminErrorState ko code={loadErr.code} httpStatus={loadErr.status} onRetry={() => void load()} />
          </div>
        ) : null}
        {loading && total === null && !loadErr ? (
          <div className="p-2">
            <AdminLoadingState ko />
          </div>
        ) : null}
        {!loading && !loadErr && total !== null && !rows.length ? (
          <div className="p-2">
            <CommunityListEmpty
              lq={lq}
              message={tr("admin_community_import_inbox_empty")}
            />
          </div>
        ) : null}
        <ul data-testid="import-inbox-list">
          {rows.map((r) => {
            const k = keyOf(r);
            const active = activeKey === k;
            const sourceName = sources.find((s) => s.id === r.sourceSite)?.displayName ?? r.sourceSite;
            return (
              <li key={k} className={`flex gap-2 px-2 py-2 border-b border-sam-border ${active ? "bg-sam-app" : ""}`}>
                <input type="checkbox" className="mt-1 shrink-0" checked={selected.has(k)} onChange={() => toggle(r)} aria-label={tr("admin_community_import_inbox_select")} />
                <AdminActionButton variant="quiet" size="sm" className="h-auto! justify-start! items-start! whitespace-normal! font-normal! px-0! gap-2 text-left min-w-0 flex-1 text-sam-fg" onClick={() => onOpen(r)}>
                  {r.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumbnailUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-16 h-12 object-cover rounded-ui-rect bg-sam-app shrink-0" />
                  ) : (
                    <div className="w-16 h-12 rounded-ui-rect bg-sam-app shrink-0 flex items-center justify-center text-[12px] text-sam-muted">
                      {tr("admin_community_import_inbox_no_thumbnail")}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-sam-fg line-clamp-2 break-words">{r.title || tr("admin_community_import_inbox_no_title")}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[12px] text-sam-muted">
                      <span className="rounded-full border border-sam-border px-1.5">{STATUS_LABEL[r.status] ? tr(STATUS_LABEL[r.status]) : r.status}</span>
                      {r.quality ? <VerdictBadge v={r.quality} /> : null}
                      <span className="truncate">
                        {sourceName} · {r.sourceBoard}
                      </span>
                      <span>{fmtDate(r.sourcePublishedAt) || fmtDate(r.firstSeenAt)}</span>
                    </div>
                  </div>
                </AdminActionButton>
              </li>
            );
          })}
        </ul>
        <div className="px-2">
          <CommunityListPagination lq={lq} total={total} disabled={loading} />
        </div>
      </div>

      {selected.size > 0 || job ? (
        <div className="shrink-0 border-t border-sam-border bg-sam-surface p-2 space-y-2">
          {selected.size > 0 ? (
            <>
              <div className="text-xs font-semibold">
                {tr("admin_community_import_inbox_selected_summary", { n: selected.size, unpublished: counts.unpublished, published: counts.published })}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" value={bulkTopic} onChange={(e) => setBulkTopic(e.target.value)}>
                  <option value="">{tr("admin_community_import_inbox_topic_board_default")}</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" value={bulkPolicy} onChange={(e) => setBulkPolicy(e.target.value as "" | ContentPolicy)}>
                  <option value="">{tr("admin_community_import_inbox_policy_source_default")}</option>
                  {(Object.keys(POLICY_LABEL) as ContentPolicy[]).map((p) => (
                    <option key={p} value={p}>
                      {tr(POLICY_LABEL[p])}
                    </option>
                  ))}
                </select>
                <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" aria-label={tr("admin_community_import_inbox_attribution")} value={bulkAttribution} onChange={(e) => setBulkAttribution(e.target.value as "" | "show" | "hide")}>
                  <option value="">{tr("admin_community_import_inbox_attribution_keep")}</option>
                  <option value="show">{tr("admin_community_import_inbox_attribution_show")}</option>
                  <option value="hide">{tr("admin_community_import_inbox_attribution_hide")}</option>
                </select>
                <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" aria-label={tr("admin_community_import_inbox_display_date")} value={dateMode} onChange={(e) => setDateMode(e.target.value as DateMode)}>
                  {(Object.keys(DATE_MODE_LABEL) as DateMode[]).map((m) => (
                    <option key={m} value={m}>
                      {tr(DATE_MODE_LABEL[m])}
                    </option>
                  ))}
                </select>
                <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" aria-label={tr("admin_community_import_inbox_display_author")} value={authorMode} onChange={(e) => setAuthorMode(e.target.value as AuthorMode)}>
                  {(Object.keys(AUTHOR_MODE_LABEL) as AuthorMode[]).map((m) => (
                    <option key={m} value={m}>
                      {tr(AUTHOR_MODE_LABEL[m])}
                    </option>
                  ))}
                </select>
                {authorMode === "custom" ? (
                  <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" placeholder={tr("admin_community_import_inbox_custom_author")} maxLength={60} value={customAuthor} onChange={(e) => setCustomAuthor(e.target.value)} />
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" aria-label={tr("admin_community_import_inbox_schedule")} value={scheduleMode} onChange={(e) => setScheduleMode(e.target.value as "now" | "spread")}>
                  <option value="now">{tr("admin_community_import_inbox_schedule_now")}</option>
                  <option value="spread">{tr("admin_community_import_inbox_schedule_spread")}</option>
                </select>
                <label className="flex items-center gap-1 text-[12px] text-sam-muted">
                  <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
                  {tr("admin_community_import_inbox_shuffle")}
                </label>
                {scheduleMode === "spread" ? (
                  <>
                    <label className="block text-[12px] text-sam-muted">
                      {tr("admin_community_import_inbox_start_at")}
                      <input type="datetime-local" className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-xs" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                    </label>
                    <label className="block text-[12px] text-sam-muted">
                      {tr("admin_community_import_inbox_interval")}
                      <input type="number" min={5} max={1440} step={5} className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-xs" value={intervalMin} onChange={(e) => setIntervalMin(Math.max(5, Math.min(1440, Number(e.target.value) || 60)))} />
                    </label>
                  </>
                ) : null}
              </div>
              <label className="flex items-center gap-1 text-[12px] text-sam-muted">
                <input type="checkbox" checked={acceptPartial} onChange={(e) => setAcceptPartial(e.target.checked)} />
                {tr("admin_community_import_inbox_accept_partial")}
              </label>
              <div className="flex flex-wrap gap-1">
                {/* 화면 primary 는 필터 바 [조회] 1개 — 일괄 작업은 secondary (L3 확인 단계 유지) */}
                <AdminActionButton variant="secondary" disabled={jobBusy || !counts.unpublished} onClick={() => void runJob("publish")}>
                  {tr("admin_community_import_inbox_bulk_publish", { n: counts.unpublished })}
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy || !counts.published} onClick={() => void runJob("update")}>
                  {tr("admin_community_import_inbox_bulk_update", { n: counts.published })}
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy || !counts.published} onClick={() => void runJob("hide")}>
                  {tr("admin_community_import_inbox_job_hide")}
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy || !counts.published} onClick={() => void runJob("unhide")}>
                  {tr("admin_community_import_inbox_job_unhide")}
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy} onClick={() => void runJob("reprocess")}>
                  {tr("admin_community_import_inbox_job_reprocess")}
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy || !counts.unpublished} onClick={() => void setStatus("skipped")}>
                  {tr("admin_community_import_inbox_skip")}
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy} onClick={() => setSelected(new Map())}>
                  {tr("admin_community_import_inbox_clear_selection")}
                </AdminActionButton>
              </div>
            </>
          ) : null}
          {job ? (
            <div className="text-[12px] text-sam-muted space-y-1">
              <div>
                {tr("admin_community_import_inbox_job_summary", { kind: job.kind, status: job.status, done: job.done, failed: job.failed, skipped: job.skipped, total: job.total })}
                {job.nextDueAt ? (
                  <span className="block">{tr("admin_community_import_inbox_job_next_due", { date: fmtDate(job.nextDueAt) })}</span>
                ) : null}
              </div>
              {job.lastError ? (
                <span className="block text-sam-danger break-words">
                  {tr("admin_community_import_inbox_job_last_error", { error: job.lastError })}
                </span>
              ) : null}
              <div className="flex flex-wrap gap-1">
                {job.failed > 0 ? (
                  <AdminActionButton variant="secondary" disabled={jobBusy} onClick={() => void jobAction("retry_failed")}>
                    {tr("admin_community_import_inbox_retry_failed", { n: job.failed })}
                  </AdminActionButton>
                ) : null}
                {job.status === "running" || job.status === "queued" ? (
                  <AdminActionButton variant="neutral" disabled={jobBusy} onClick={() => void jobAction("cancel")}>
                    {tr("admin_community_import_inbox_cancel_remaining")}
                  </AdminActionButton>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
