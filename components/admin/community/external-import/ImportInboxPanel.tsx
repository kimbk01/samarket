"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
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

/** API 필터 ("" = 전체) — 주소(URL)는 부모의 `useCommunityListQuery` 가 관리 */
export type InboxFilter = { site: string; board: string; status: string; quality: string; lang: string; q: string };

/** 수집함 「처리 대기」 상태 묶음 (부모 기본값과 같다) */
const INBOX_WAITING = "new,draft,source_updated,failed";

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
  /** 조회 조건(주소) — 필터 바·페이지네이션 (20/50/100) */
  lq: CommunityListQuery<"site" | "board" | "quality" | "lang">;
  activeKey: string | null;
  onOpen: (row: InboxRow) => void;
  refreshToken: number;
  onJobDone: () => void;
};

export function ImportInboxPanel({ sources, topics, filter, lq, activeKey, onOpen, refreshToken, onJobDone }: Props) {
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
          ? `${items.length}건을 DIBAY에 게시할까요?`
          : kind === "update"
            ? `게시된 ${items.length}건을 업데이트할까요?`
            : kind === "hide"
              ? `게시된 ${items.length}건을 숨길까요?`
              : kind === "unhide"
                ? `숨긴 게시물 ${items.length}건을 다시 공개할까요?`
                : `${items.length}건의 본문을 다시 수집할까요?`,
      description: publishing
        ? `주제: ${topic?.name ?? "각 게시판의 기본 주제"} · 정책: ${bulkPolicy ? POLICY_LABEL[bulkPolicy] : "출처 기본값"} · 출처 ${bulkAttribution === "hide" ? "숨김" : bulkAttribution === "show" ? "표시" : "글별 설정"} · ${AUTHOR_MODE_LABEL[authorMode]} · ${DATE_MODE_LABEL[dateMode]} · 품질 「일부 수집」 ${acceptPartial ? "포함" : "제외"} (「수집 실패」는 항상 제외). ${
            spread
              ? `${startAt.replace("T", " ")}부터 ${intervalMin}분마다 1건씩${shuffle ? " 랜덤 순서로" : ""} 게시합니다.`
              : `공개 커뮤니티에 바로 반영됩니다${kind === "publish" && shuffle ? " (랜덤 순서)" : ""}.`
          }`
        : kind === "reprocess"
          ? "원문을 다시 가져와 품질을 다시 판정합니다. 게시물은 바뀌지 않습니다."
          : "커뮤니티 피드·상세의 노출 상태만 바뀝니다.",
      confirmLabel: kind === "publish" ? "게시" : kind === "update" ? "업데이트" : kind === "hide" ? "숨김" : kind === "unhide" ? "공개" : "재수집",
      destructive: kind === "hide",
      retypeValue: `${items.length}건`,
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
        <CommunityFilterBar lq={lq} showPeriod={false} searchPlaceholder="제목 검색" pending={loading}>
          <CommunityFilterField label="출처">
            <CommunitySelect
              value={lq.query.extras.site}
              onChange={(v) => lq.patch({ extras: { site: v, board: "" } })}
              options={[{ value: "", label: "모든 출처" }, ...sources.map((s) => ({ value: s.id, label: s.displayName }))]}
            />
          </CommunityFilterField>
          <CommunityFilterField label="게시판">
            <CommunitySelect
              value={lq.query.extras.board}
              onChange={(v) => lq.setExtra("board", v)}
              options={[{ value: "", label: "모든 게시판" }, ...boards.map((b) => ({ value: b.boardId, label: b.displayName }))]}
            />
          </CommunityFilterField>
          <CommunityFilterField label="처리 상태">
            <CommunitySelect
              value={lq.query.status === "all" ? "" : lq.query.status}
              onChange={(v) => lq.setStatus(v)}
              options={[
                { value: INBOX_WAITING, label: "처리 대기" },
                { value: "", label: "전체 상태" },
                ...Object.entries(STATUS_LABEL).map(([k, v]) => ({ value: k, label: v })),
              ]}
            />
          </CommunityFilterField>
          <CommunityFilterField label="품질">
            <CommunitySelect
              value={lq.query.extras.quality}
              onChange={(v) => lq.setExtra("quality", v)}
              options={[
                { value: "", label: "모든 품질" },
                { value: "FULL", label: "전체 수집" },
                { value: "PARTIAL", label: "일부 수집" },
                { value: "FAILED", label: "수집 실패" },
                { value: "none", label: "미확인" },
              ]}
            />
          </CommunityFilterField>
          <CommunityFilterField label="언어">
            <CommunitySelect
              value={lq.query.extras.lang || "ko"}
              onChange={(v) => lq.setExtra("lang", v)}
              options={[
                { value: "ko", label: "한글 글만" },
                { value: "all", label: "모든 언어" },
                { value: "other", label: "한글 없는 글" },
              ]}
            />
          </CommunityFilterField>
        </CommunityFilterBar>
      </div>

      <div className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-sam-muted border-b border-sam-border shrink-0">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={allOnPage} onChange={togglePage} /> 이 페이지 선택
        </label>
        <span className="ml-auto flex gap-1">
          <AdminActionButton variant="neutral" disabled={loading} onClick={() => void load()}>
            새로고침
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
              message="수집된 글이 없습니다. 「출처·게시판」에서 게시판의 「지금 수집」을 누르거나 자동수집을 켜세요."
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
                <input type="checkbox" className="mt-1 shrink-0" checked={selected.has(k)} onChange={() => toggle(r)} aria-label="선택" />
                <AdminActionButton variant="quiet" size="sm" className="h-auto! justify-start! items-start! whitespace-normal! font-normal! px-0! gap-2 text-left min-w-0 flex-1 text-sam-fg" onClick={() => onOpen(r)}>
                  {r.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.thumbnailUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="w-16 h-12 object-cover rounded-ui-rect bg-sam-app shrink-0" />
                  ) : (
                    <div className="w-16 h-12 rounded-ui-rect bg-sam-app shrink-0 flex items-center justify-center text-[12px] text-sam-muted">썸네일 없음</div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-sam-fg line-clamp-2 break-words">{r.title || "(제목 없음)"}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[12px] text-sam-muted">
                      <span className="rounded-full border border-sam-border px-1.5">{STATUS_LABEL[r.status] ?? r.status}</span>
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
                <label className="flex items-center gap-1 text-[12px] text-sam-muted">
                  <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
                  랜덤 순서 (같은 출처 연속 방지)
                </label>
                {scheduleMode === "spread" ? (
                  <>
                    <label className="block text-[12px] text-sam-muted">
                      시작
                      <input type="datetime-local" className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-xs" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
                    </label>
                    <label className="block text-[12px] text-sam-muted">
                      간격(분, 5~1440)
                      <input type="number" min={5} max={1440} step={5} className="rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-sam-fg min-h-9 w-full text-xs" value={intervalMin} onChange={(e) => setIntervalMin(Math.max(5, Math.min(1440, Number(e.target.value) || 60)))} />
                    </label>
                  </>
                ) : null}
              </div>
              <label className="flex items-center gap-1 text-[12px] text-sam-muted">
                <input type="checkbox" checked={acceptPartial} onChange={(e) => setAcceptPartial(e.target.checked)} />
                품질 「일부 수집」도 게시 허용 (「수집 실패」는 항상 제외)
              </label>
              <div className="flex flex-wrap gap-1">
                {/* 화면 primary 는 필터 바 [조회] 1개 — 일괄 작업은 secondary (L3 확인 단계 유지) */}
                <AdminActionButton variant="secondary" disabled={jobBusy || !counts.unpublished} onClick={() => void runJob("publish")}>
                  일괄 게시 ({counts.unpublished})
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy || !counts.published} onClick={() => void runJob("update")}>
                  일괄 업데이트 ({counts.published})
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy || !counts.published} onClick={() => void runJob("hide")}>
                  게시물 숨김
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy || !counts.published} onClick={() => void runJob("unhide")}>
                  숨김 해제
                </AdminActionButton>
                <AdminActionButton variant="neutral" disabled={jobBusy} onClick={() => void runJob("reprocess")}>
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
            <div className="text-[12px] text-sam-muted space-y-1">
              <div>
                작업 {job.kind}: {job.status} · 성공 {job.done} · 실패 {job.failed} · 건너뜀(중복·이미 게시) {job.skipped} / {job.total}
                {job.nextDueAt ? <span className="block">예약됨 — 다음 게시 {fmtDate(job.nextDueAt)} (서버가 자동으로 이어서 게시)</span> : null}
              </div>
              {job.lastError ? <span className="block text-sam-danger break-words">마지막 오류: {job.lastError}</span> : null}
              <div className="flex flex-wrap gap-1">
                {job.failed > 0 ? (
                  <AdminActionButton variant="secondary" disabled={jobBusy} onClick={() => void jobAction("retry_failed")}>
                    실패만 다시 실행 ({job.failed})
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
    </div>
  );
}
