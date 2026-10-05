"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  type TopicOption,
} from "./api";

export type InboxFilter = { site: string; board: string; status: string; quality: string; q: string };

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
  const [job, setJob] = useState<JobSummary | null>(null);
  const [jobBusy, setJobBusy] = useState(false);

  const boards = useMemo(() => sources.find((s) => s.id === filter.site)?.boards ?? [], [sources, filter.site]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const p = new URLSearchParams();
    if (filter.site) p.set("site", filter.site);
    if (filter.board) p.set("board", filter.board);
    if (filter.status) p.set("status", filter.status);
    if (filter.quality) p.set("quality", filter.quality);
    if (filter.q) p.set("q", filter.q);
    p.set("limit", String(PAGE));
    p.set("offset", String(offset));
    try {
      const r = await call<{ rows: InboxRow[]; total: number }>(`/inbox?${p.toString()}`);
      setRows(r.rows);
      setTotal(r.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
  }, [filter.site, filter.board, filter.status, filter.quality, filter.q]);

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
    setJobBusy(true);
    try {
      let r = await call<{ job: JobSummary }>("/jobs", {
        body: {
          action: "create",
          kind,
          items,
          params: { topicId: topic?.id ?? null, topicSlug: topic?.slug ?? null, acceptPartial, contentPolicy: bulkPolicy || null },
        },
      });
      setJob(r.job);
      while (r.job.status === "running" || r.job.status === "queued") {
        r = await call<{ job: JobSummary }>("/jobs", { body: { action: "run", jobId: r.job.id } });
        setJob(r.job);
      }
      setSelected(new Map());
      onJobDone();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-2 border-b border-sam-border shrink-0">
        <select className="sam-input text-xs" value={filter.site} onChange={(e) => setFilter({ ...filter, site: e.target.value, board: "" })}>
          <option value="">모든 출처</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
        <select className="sam-input text-xs" value={filter.board} disabled={!filter.site} onChange={(e) => setFilter({ ...filter, board: e.target.value })}>
          <option value="">모든 게시판</option>
          {boards.map((b) => (
            <option key={b.boardId} value={b.boardId}>
              {b.displayName}
            </option>
          ))}
        </select>
        <select className="sam-input text-xs" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
          <option value="new,draft,source_updated,failed">처리 대기</option>
          <option value="">전체 상태</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="sam-input text-xs" value={filter.quality} onChange={(e) => setFilter({ ...filter, quality: e.target.value })}>
          <option value="">모든 품질</option>
          <option value="FULL">FULL</option>
          <option value="PARTIAL">PARTIAL</option>
          <option value="FAILED">FAILED</option>
          <option value="none">미확인</option>
        </select>
        <input className="sam-input text-xs col-span-2 sm:col-span-1" placeholder="제목 검색" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} />
      </div>

      <div className="flex items-center gap-2 px-2 py-1.5 text-[11px] text-sam-muted border-b border-sam-border shrink-0">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={allOnPage} onChange={togglePage} /> 이 페이지 선택
        </label>
        <span>
          {total}건 중 {total ? offset + 1 : 0}–{Math.min(offset + PAGE, total)}
        </span>
        <span className="ml-auto flex gap-1">
          <button type="button" className="sam-btn sam-btn-ghost text-[11px]" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            이전
          </button>
          <button type="button" className="sam-btn sam-btn-ghost text-[11px]" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
            다음
          </button>
          <button type="button" className="sam-btn sam-btn-ghost text-[11px]" onClick={() => void load()}>
            새로고침
          </button>
        </span>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {error ? <p className="p-3 text-xs text-rose-600 break-words">{error}</p> : null}
        {loading && !rows.length ? <p className="p-3 text-xs text-sam-muted">불러오는 중…</p> : null}
        {!loading && !rows.length && !error ? (
          <p className="p-4 text-xs text-sam-muted">수집된 글이 없습니다. 「출처·게시판」에서 게시판의 「지금 수집」을 누르거나 자동수집을 켜세요.</p>
        ) : null}
        <ul>
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
                <select className="sam-input text-xs" value={bulkTopic} onChange={(e) => setBulkTopic(e.target.value)}>
                  <option value="">주제: 게시판 기본값 사용</option>
                  {topics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <select className="sam-input text-xs" value={bulkPolicy} onChange={(e) => setBulkPolicy(e.target.value as "" | ContentPolicy)}>
                  <option value="">정책: 출처 기본값</option>
                  {(Object.keys(POLICY_LABEL) as ContentPolicy[]).map((p) => (
                    <option key={p} value={p}>
                      {POLICY_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-1 text-[11px] text-sam-muted">
                <input type="checkbox" checked={acceptPartial} onChange={(e) => setAcceptPartial(e.target.checked)} />
                품질 PARTIAL도 게시 허용 (FAILED는 항상 제외)
              </label>
              <div className="flex flex-wrap gap-1">
                <button type="button" className="sam-btn sam-btn-primary text-xs" disabled={jobBusy || !counts.unpublished} onClick={() => void runJob("publish")}>
                  일괄 게시 ({counts.unpublished})
                </button>
                <button type="button" className="sam-btn sam-btn-secondary text-xs" disabled={jobBusy || !counts.published} onClick={() => void runJob("update")}>
                  일괄 업데이트 ({counts.published})
                </button>
                <button type="button" className="sam-btn sam-btn-ghost text-xs" disabled={jobBusy || !counts.published} onClick={() => void runJob("hide")}>
                  게시물 숨김
                </button>
                <button type="button" className="sam-btn sam-btn-ghost text-xs" disabled={jobBusy || !counts.published} onClick={() => void runJob("unhide")}>
                  숨김 해제
                </button>
                <button type="button" className="sam-btn sam-btn-ghost text-xs" disabled={jobBusy} onClick={() => void runJob("reprocess")}>
                  본문 재수집
                </button>
                <button type="button" className="sam-btn sam-btn-ghost text-xs" disabled={jobBusy || !counts.unpublished} onClick={() => void setStatus("skipped")}>
                  수집함에서 제외
                </button>
                <button type="button" className="sam-btn sam-btn-ghost text-xs" disabled={jobBusy} onClick={() => setSelected(new Map())}>
                  선택 해제
                </button>
              </div>
            </>
          ) : null}
          {job ? (
            <div className="text-[11px] text-sam-muted">
              작업 {job.kind}: {job.status} · 완료 {job.done} · 실패 {job.failed} · 건너뜀 {job.skipped} / {job.total}
              {job.lastError ? <span className="block text-rose-600 break-words">마지막 오류: {job.lastError}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
