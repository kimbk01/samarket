"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminActionConfirmDialog } from "@/components/admin/ui/AdminActionConfirmDialog";
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
  type TopicOption, importErrorText } from "./api";

export type InboxFilter = { site: string; board: string; status: string; quality: string; lang: string; q: string };

type AuthorMode = "keep" | "original" | "source" | "custom";
type DateMode = "keep" | "original" | "publish";

const AUTHOR_MODE_LABEL: Record<AuthorMode, string> = {
  keep: "작성자: 글별 설정 유지",
  original: "작성자: 원작성자",
  source: "작성자: 출처 이름",
  custom: "작성자: 직접 입력",
};
const DATE_MODE_LABEL: Record<DateMode, string> = {
  keep: "날짜: 글별 설정 유지",
  original: "날짜: 원문 작성일",
  publish: "날짜: DIBAY 게시 시각",
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
  setFilter: (f: InboxFilter) => void;
  activeKey: string | null;
  onOpen: (row: InboxRow) => void;
  refreshToken: number;
  onJobDone: () => void;
};

const PAGE = 50;

export function ImportInboxPanel({ sources, topics, filter, setFilter, activeKey, onOpen, refreshToken, onJobDone }: Props) {
  const [rows, setRows] = useState<InboxRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [pendingJob, setPendingJob] = useState<null | "publish" | "update" | "hide" | "unhide" | "reprocess">(null);

  const boards = useMemo(() => sources.find((s) => s.id === filter.site)?.boards ?? [], [sources, filter.site]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const p = new URLSearchParams();
    if (filter.site) p.set("site", filter.site);
    if (filter.board) p.set("board", filter.board);
    if (filter.status) p.set("status", filter.status);
    if (filter.quality) p.set("quality", filter.quality);
    if (filter.lang) p.set("lang", filter.lang);
    if (filter.q) p.set("q", filter.q);
    p.set("limit", String(PAGE));
    p.set("offset", String(offset));
    try {
      const r = await call<{ rows: InboxRow[]; total: number }>(`/inbox?${p.toString()}`);
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      setError(importErrorText(e));
    } finally {
      setLoading(false);
    }
  }, [filter, offset]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  // Selection is tied to the filter: changing it clears selection (no hidden cross-filter selection).
  useEffect(() => {
    setSelected(new Map());
    setOffset(0);
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

  const runJob = async (kind: string) => {
    const items = selList
      .filter((r) => (kind === "publish" ? !r.publishedPostId : kind === "reprocess" ? true : Boolean(r.publishedPostId)))
      .map((r) => ({ sourceSite: r.sourceSite, sourceBoard: r.sourceBoard, sourceArticleKey: r.sourceArticleKey }));
    if (!items.length) return;
    const topic = topics.find((t) => t.id === bulkTopic);
    const publishing = kind === "publish" || kind === "update";
    const spread = kind === "publish" && scheduleMode === "spread";
    setJobBusy(true);
    setPendingJob(null);
    try {
      const r = await call<{ job: JobSummary }>("/jobs", {
        body: {
          action: "create",
          kind,
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
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 p-2 border-b border-sam-border shrink-0">
        <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" value={filter.site} onChange={(e) => setFilter({ ...filter, site: e.target.value, board: "" })}>
          <option value="">모든 출처</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
        <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" value={filter.board} disabled={!filter.site} onChange={(e) => setFilter({ ...filter, board: e.target.value })}>
          <option value="">모든 게시판</option>
          {boards.map((b) => (
            <option key={b.boardId} value={b.boardId}>
              {b.displayName}
            </option>
          ))}
        </select>
        <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" aria-label="처리 상태" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
          <option value="new,draft,source_updated,failed">처리 대기</option>
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" value={filter.quality} onChange={(e) => setFilter({ ...filter, quality: e.target.value })}>
          <option value="">모든 품질</option>
          <option value="FULL">전체 수집</option>
          <option value="PARTIAL">일부 수집</option>
          <option value="FAILED">수집 실패</option>
          <option value="none">미확인</option>
        </select>
        <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" aria-label="언어" value={filter.lang} onChange={(e) => setFilter({ ...filter, lang: e.target.value })}>
          <option value="ko">한글 글만</option>
          <option value="">모든 언어</option>
          <option value="other">한글 없는 글</option>
        </select>
        <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs col-span-2 sm:col-span-1" placeholder="제목 검색" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
      </div>

      <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-sam-muted border-b border-sam-border shrink-0">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={allOnPage} onChange={togglePage} /> 이 페이지 선택
        </label>
        <span>
          {total}건 중 {total ? offset + 1 : 0}–{Math.min(offset + PAGE, total)}
        </span>
        <span className="ml-auto flex gap-1">
          <AdminActionButton variant="neutral" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            이전
          </AdminActionButton>
          <AdminActionButton variant="neutral" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
            다음
          </AdminActionButton>
          <AdminActionButton variant="neutral" onClick={() => void load()}>
            새로고침
          </AdminActionButton>
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {error ? <p className="p-3 text-xs text-rose-600 break-words">{error}</p> : null}
        {loading && !rows.length ? <p className="p-3 text-xs text-sam-muted">불러오는 중…</p> : null}
        {!loading && !rows.length && !error ? (
          <p className="p-4 text-xs text-sam-muted">수집된 글이 없습니다. 「출처·게시판」에서 게시판의 「지금 수집」을 누르거나 자동수집을 켜세요.</p>
        ) : null}
        <ul data-testid="import-inbox-list">
          {rows.map((r) => {
            const k = keyOf(r);
            const active = activeKey === k;
            const sourceName = sources.find((s) => s.id === r.sourceSite)?.displayName ?? r.sourceSite;
            return (
              <li key={k} className={`flex gap-2 px-2 py-2 border-b border-sam-border ${active ? "bg-sam-app" : ""}`}>
                <input type="checkbox" className="mt-1 shrink-0" checked={selected.has(k)} onChange={() => toggle(r)} aria-label="선택" />
                <button type="button" className="flex gap-2 text-left min-w-0 flex-1" onClick={() => onOpen(r)}>
                  {r.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumbnailUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-16 h-12 object-cover rounded-ui-rect bg-sam-app shrink-0" />
                  ) : (
                    <div className="w-16 h-12 rounded-ui-rect bg-sam-app shrink-0 flex items-center justify-center text-[10px] text-sam-muted">썸네일 없음</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-sam-fg line-clamp-2 break-words">{r.title || "(제목 없음)"}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-sam-muted">
                      <span className="rounded-full border border-sam-border px-1.5">{STATUS_LABEL[r.status] ?? r.status}</span>
                      {r.quality ? <VerdictBadge v={r.quality} /> : null}
                      <span className="truncate">
                        {sourceName} · {r.sourceBoard}
                      </span>
                      <span>{fmtDate(r.sourcePublishedAt) || fmtDate(r.firstSeenAt)}</span>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {selected.size > 0 || job ? (
        <div className="shrink-0 border-t border-sam-border bg-sam-surface p-2 space-y-2">
          {selected.size > 0 ? (
            <>
              <div className="text-xs font-semibold">
                {selected.size}건 선택 (미게시 {counts.unpublished} · 게시됨 {counts.published})
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" value={bulkTopic} onChange={(e) => setBulkTopic(e.target.value)}>
                  <option value="">주제: 게시판 기본값 사용</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" value={bulkPolicy} onChange={(e) => setBulkPolicy(e.target.value as "" | ContentPolicy)}>
                  <option value="">정책: 출처 기본값</option>
                  {(Object.keys(POLICY_LABEL) as ContentPolicy[]).map((p) => (
                    <option key={p} value={p}>
                      {POLICY_LABEL[p]}
                    </option>
                  ))}
                </select>
                <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" aria-label="출처 표시" value={bulkAttribution} onChange={(e) => setBulkAttribution(e.target.value as "" | "show" | "hide")}>
                  <option value="">출처: 글별 설정 유지</option>
                  <option value="show">출처: 표시</option>
                  <option value="hide">출처: 숨김</option>
                </select>
                <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" aria-label="표시 날짜" value={dateMode} onChange={(e) => setDateMode(e.target.value as DateMode)}>
                  {(Object.keys(DATE_MODE_LABEL) as DateMode[]).map((m) => (
                    <option key={m} value={m}>
                      {DATE_MODE_LABEL[m]}
                    </option>
                  ))}
                </select>
                <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" aria-label="표시 작성자" value={authorMode} onChange={(e) => setAuthorMode(e.target.value as AuthorMode)}>
                  {(Object.keys(AUTHOR_MODE_LABEL) as AuthorMode[]).map((m) => (
                    <option key={m} value={m}>
                      {AUTHOR_MODE_LABEL[m]}
                    </option>
                  ))}
                </select>
                {authorMode === "custom" ? (
                  <input className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" placeholder="표시할 작성자 이름" maxLength={60} value={customAuthor} onChange={(e) => setCustomAuthor(e.target.value)} />
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <select className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 text-xs" aria-label="게시 방식" value={scheduleMode} onChange={(e) => setScheduleMode(e.target.value as "now" | "spread")}>
                  <option value="now">게시: 지금 바로</option>
                  <option value="spread">게시: 예약·분산 (간격마다 1건)</option>
                </select>
                <label className="flex items-center gap-1 text-[11px] text-sam-muted">
                  <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
                  랜덤 순서 (같은 출처 연속 방지)
                </label>
                {scheduleMode === "spread" ? (
                  <>
                    <label className="block text-[11px] text-sam-muted">
                      시작
                      <input type="datetime-local" className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-xs" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                    </label>
                    <label className="block text-[11px] text-sam-muted">
                      간격(분, 5~1440)
                      <input type="number" min={5} max={1440} step={5} className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-xs" value={intervalMin} onChange={(e) => setIntervalMin(Math.max(5, Math.min(1440, Number(e.target.value) || 60)))} />
                    </label>
                  </>
                ) : null}
              </div>
              <label className="flex items-center gap-1 text-[11px] text-sam-muted">
                <input type="checkbox" checked={acceptPartial} onChange={(e) => setAcceptPartial(e.target.checked)} />
                품질 「일부 수집」도 게시 허용 (「수집 실패」는 항상 제외)
              </label>
              <div className="flex flex-wrap gap-1">
                <AdminActionButton variant="primary" disabled={jobBusy || !counts.unpublished} onClick={() => setPendingJob("publish")}>
                  일괄 게시 ({counts.unpublished})
                </AdminActionButton>
                <AdminActionButton variant="secondary" disabled={jobBusy || !counts.published} onClick={() => setPendingJob("update")}>
                  일괄 업데이트 ({counts.published})
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy || !counts.published} onClick={() => setPendingJob("hide")}>
                  게시물 숨김
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy || !counts.published} onClick={() => setPendingJob("unhide")}>
                  숨김 해제
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy} onClick={() => setPendingJob("reprocess")}>
                  본문 재수집
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy || !counts.unpublished} onClick={() => void setStatus("skipped")}>
                  수집함에서 제외
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy} onClick={() => setSelected(new Map())}>
                  선택 해제
                </AdminActionButton>
              </div>
            </>
          ) : null}
          {job ? (
            <div className="text-[11px] text-sam-muted space-y-1">
              <div>
                작업 {job.kind}: {job.status} · 성공 {job.done} · 실패 {job.failed} · 건너뜀(중복·이미 게시) {job.skipped} / {job.total}
                {job.nextDueAt ? <span className="block">예약됨 — 다음 게시 {fmtDate(job.nextDueAt)} (서버가 자동으로 이어서 게시)</span> : null}
              </div>
              {job.lastError ? <span className="block text-rose-600 break-words">마지막 오류: {job.lastError}</span> : null}
              <div className="flex flex-wrap gap-1">
                {job.failed > 0 ? (
                  <AdminActionButton variant="secondary" disabled={jobBusy} onClick={() => void jobAction("retry_failed")}>
                    실패만 재시도 ({job.failed})
                  </AdminActionButton>
                ) : null}
                {job.status === "running" || job.status === "queued" ? (
                  <AdminActionButton variant="neutral" disabled={jobBusy} onClick={() => void jobAction("cancel")}>
                    남은 게시 취소
                  </AdminActionButton>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <AdminActionConfirmDialog
        open={pendingJob !== null}
        title={
          pendingJob === "publish"
            ? `${counts.unpublished}건을 DIBAY에 게시할까요?`
            : pendingJob === "update"
              ? `게시된 ${counts.published}건을 업데이트할까요?`
              : pendingJob === "hide"
                ? `게시된 ${counts.published}건을 숨길까요?`
                : pendingJob === "unhide"
                  ? `숨긴 게시물 ${counts.published}건을 다시 공개할까요?`
                  : `${selected.size}건의 본문을 다시 수집할까요?`
        }
        description={
          pendingJob === "publish" || pendingJob === "update"
            ? `주제: ${topics.find((t) => t.id === bulkTopic)?.name ?? "각 게시판의 기본 주제"} · 정책: ${bulkPolicy ? POLICY_LABEL[bulkPolicy] : "출처 기본값"} · 출처 ${bulkAttribution === "hide" ? "숨김" : bulkAttribution === "show" ? "표시" : "글별 설정"} · ${AUTHOR_MODE_LABEL[authorMode]} · ${DATE_MODE_LABEL[dateMode]} · 품질 「일부 수집」 ${acceptPartial ? "포함" : "제외"} (「수집 실패」는 항상 제외). ${
                pendingJob === "publish" && scheduleMode === "spread"
                  ? `${startAt.replace("T", " ")}부터 ${intervalMin}분마다 1건씩${shuffle ? " 랜덤 순서로" : ""} 게시합니다.`
                  : `공개 커뮤니티에 바로 반영됩니다${pendingJob === "publish" && shuffle ? " (랜덤 순서)" : ""}.`
              }`
            : pendingJob === "reprocess"
              ? "원문을 다시 가져와 품질을 다시 판정합니다. 게시물은 바뀌지 않습니다."
              : "커뮤니티 피드·상세의 노출 상태만 바뀝니다."
        }
        confirmLabel={pendingJob === "publish" ? "게시" : pendingJob === "update" ? "업데이트" : pendingJob === "hide" ? "숨김" : pendingJob === "unhide" ? "공개" : "재수집"}
        cancelLabel="취소"
        pending={jobBusy}
        onCancel={() => setPendingJob(null)}
        onConfirm={() => pendingJob && void runJob(pendingJob)}
      />
    </div>
  );
}
