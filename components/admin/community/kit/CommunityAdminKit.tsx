"use client";

/**
 * 커뮤니티 Admin 화면 공통 틀 (설계 v2 §C-0-1) — 목록 화면 고정 구성:
 * ① 제목 + 설명 1줄 ② 상태 탭(건수) ③ 필터 바(`CommunityFilterBar` = AdminFilterBar: 기간 PHT·상태·도메인·검색어·[조회][초기화])
 * ④ 일괄 처리 줄 ⑤ 표 ⑥ 서버 페이지네이션(`CommunityListPagination` = AdminPagination 20/50/100, URL `size`).
 * 필터·탭·페이지는 URL 쿼리에 둔다 → 상세 진입 후 복귀 시 그대로 유지된다.
 * 조치 시트는 채팅 Admin 과 같은 `AdminChatActionSheet` (2단계 확인·사유·409/404 처리)를 `CommunityActionSheet` 로 쓴다.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminFilterBar } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import {
  ADMIN_LIST_PAGE_SIZES,
  normalizeAdminListPageSize,
  type AdminListPageSize,
} from "@/lib/admin/list-query/admin-list-query";
import type { AdminListQueryDraft } from "@/lib/admin/list-query/use-admin-list-query";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import {
  adminCommunityLabel,
  type AdminCommunityLabelDomain,
} from "@/lib/admin/status-labels/community-status-labels";
import { formatAdminManilaDateTime } from "@/lib/admin/metrics/manila-period";
import { withAdminReturnTo } from "@/lib/admin/admin-operation-return-context";

export {
  AdminChatActionSheet as CommunityActionSheet,
  adminChatSheetFetch as communitySheetFetch,
  type AdminChatSheetResult as CommunitySheetResult,
  type AdminChatSheetSettle as CommunitySheetSettle,
  type AdminChatSheetRow as CommunitySheetRow,
} from "@/components/admin/chats/AdminChatActionSheet";

/* ───────── URL 상태 ───────── */

/** 커뮤니티 목록 기본 페이지 크기 — 20/50/100 중 50 (URL `size` 가 없을 때). */
export const COMMUNITY_LIST_DEFAULT_PAGE_SIZE: AdminListPageSize = 50;

/**
 * 목록 조건 = URL 쿼리. `page`(1부터) · `size`(20/50/100, 기본 50) 는 공통 키.
 * 필터 키를 바꾸면 1쪽으로 (keepPage 제외). 「초기화」는 `size` 를 유지한다 (보기 설정이지 조건이 아님).
 */
export function useCommunityQueryState(opts: { defaultSize?: AdminListPageSize } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const defaultSize = opts.defaultSize ?? COMMUNITY_LIST_DEFAULT_PAGE_SIZE;
  const get = useCallback((k: string) => sp.get(k) ?? "", [sp]);
  const hrefOf = useCallback(
    (next: URLSearchParams) => {
      const qs = next.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname]
  );
  /** patch 를 적용한 주소 — 지금 주소와 같으면 null (router 가 다시 그리지 않는다). */
  const nextHref = useCallback(
    (patch: Record<string, string | number | null | undefined>, opts2?: { keepPage?: boolean }) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, String(v));
      }
      if (!opts2?.keepPage && !("page" in patch)) next.delete("page");
      const href = hrefOf(next);
      return href === hrefOf(new URLSearchParams(sp.toString())) ? null : href;
    },
    [hrefOf, sp]
  );
  const set = useCallback(
    (patch: Record<string, string | number | null | undefined>, opts2?: { keepPage?: boolean }): boolean => {
      const href = nextHref(patch, opts2);
      if (href === null) return false;
      router.replace(href, { scroll: false });
      return true;
    },
    [nextHref, router]
  );
  const reset = useCallback(
    (keep: string[] = []) => {
      const next = new URLSearchParams();
      for (const k of [...keep, "size"]) {
        const v = sp.get(k);
        if (v) next.set(k, v);
      }
      router.replace(hrefOf(next), { scroll: false });
    },
    [hrefOf, router, sp]
  );
  /** 현재 목록 URL — 상세로 갈 때 returnTo 로 넘긴다 */
  const selfHref = useMemo(() => hrefOf(new URLSearchParams(sp.toString())), [hrefOf, sp]);
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  const size = normalizeAdminListPageSize(sp.get("size"), defaultSize);
  const setPage = useCallback((p: number) => set({ page: p > 1 ? p : null }), [set]);
  const setSize = useCallback(
    (s: AdminListPageSize) => set({ size: s === defaultSize ? null : s, page: null }),
    [defaultSize, set]
  );
  /** 서버 목록 API 의 limit/offset (현재 쪽·크기) */
  const limitOffset = { limit: size, offset: (page - 1) * size };
  /** 주어진 키 중 하나라도 값이 있으면 true — 빈 목록에서 [초기화] 표시용 */
  const hasAny = useCallback((keys: readonly string[]) => keys.some((k) => Boolean(sp.get(k))), [sp]);
  return { get, set, reset, sp, selfHref, page, size, setPage, setSize, limitOffset, hasAny, nextHref };
}

export function communityDetailHref(href: string, returnTo: string): string {
  return withAdminReturnTo(href, returnTo);
}

/* ───────── 목록 화면 틀 ───────── */

export function CommunityListShell({
  title,
  description,
  actions,
  tabs,
  filters,
  filterBar,
  bulkBar,
  banner,
  children,
  footer,
}: {
  title: string;
  /** 업무 목적 1줄 — 기술 설명 금지 */
  description?: string;
  /** 제목 오른쪽 (예: 「공지 작성」, 「새로고침」) */
  actions?: ReactNode;
  tabs?: ReactNode;
  /** @deprecated 자체 필터 요소 묶음 (테두리 상자 안). 목록 화면은 `filterBar` 에 `CommunityFilterBar` 를 넣는다. */
  filters?: ReactNode;
  /** 표준 필터 바 (`CommunityFilterBar`) — 자체 테두리를 가지므로 상자 없이 그린다. */
  filterBar?: ReactNode;
  bulkBar?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div data-community-admin-list="1" className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="sam-text-page-title font-semibold text-sam-fg">{title}</h1>
          {description ? <p className="mt-1 sam-text-body text-sam-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {banner}
      {tabs}
      {filters ? (
        <div className="flex flex-wrap items-end gap-2 rounded-ui-rect border border-sam-border bg-sam-surface p-3">
          {filters}
        </div>
      ) : null}
      {filterBar}
      {bulkBar}
      <div className="overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface">{children}</div>
      {footer}
    </div>
  );
}

export type CommunityTab = { value: string; label: string; count?: number | null };

export function CommunityTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: CommunityTab[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <AdminTabs
      ariaLabel="상태"
      tabs={tabs.map((t) => ({ id: t.value, label: t.label, count: typeof t.count === "number" ? t.count : null }))}
      value={value}
      syncUrl={false}
      onChange={onChange}
    />
  );
}

/* ───────── 필터 요소 ───────── */

/** 필터 입력 — `AdminFilterBar` 와 같은 높이 40 · 글자 16px (태블릿 확대 방지). */
const FIELD =
  "h-10 rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 text-[16px] text-sam-fg outline-none focus:border-sam-primary disabled:opacity-50";

export function CommunityFilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-[8rem] flex-col gap-1 text-[12px] font-medium text-sam-muted">
      {label}
      {children}
    </label>
  );
}

/** @deprecated 목록 화면은 `CommunityFilterBar`(AdminFilterBar) 를 쓴다. 기존 호출부 호환용. */
export function CommunitySearchInput({
  value,
  onCommit,
  placeholder,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder: string;
}) {
  return (
    <form
      className="flex"
      onSubmit={(e) => {
        e.preventDefault();
        const v = String(new FormData(e.currentTarget).get("q") ?? "").trim();
        onCommit(v);
      }}
    >
      <input name="q" defaultValue={value} key={value} placeholder={placeholder} className={`${FIELD} w-56`} />
      <AdminActionButton type="submit" variant="secondary" size="sm" className="ml-1">
        {adminCta("search", true)}
      </AdminActionButton>
    </form>
  );
}

export function CommunitySelect({
  value,
  onChange,
  options,
  name,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  name?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      name={name}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={FIELD}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export const COMMUNITY_PERIOD_OPTIONS = [
  { value: "", label: "전체 기간" },
  { value: "today", label: "오늘" },
  { value: "7d", label: "최근 7일" },
  { value: "30d", label: "최근 30일" },
  { value: "custom", label: "직접 지정" },
] as const;

/** @deprecated 목록 화면은 `CommunityFilterBar showPeriod` 를 쓴다. 기존 호출부 호환용. 기간 — 필리핀 시간 날짜. */
export function CommunityPeriodFilter({
  period,
  from,
  to,
  onChange,
}: {
  period: string;
  from: string;
  to: string;
  onChange: (v: { period: string; from: string; to: string }) => void;
}) {
  return (
    <CommunityFilterField label="기간 (필리핀 시간)">
      <div className="flex flex-wrap items-center gap-1">
        <CommunitySelect
          value={period}
          onChange={(p) => onChange({ period: p, from: p === "custom" ? from : "", to: p === "custom" ? to : "" })}
          options={COMMUNITY_PERIOD_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        {period === "custom" ? (
          <>
            <input type="date" value={from} onChange={(e) => onChange({ period, from: e.target.value, to })} className={FIELD} />
            <span className="text-sam-muted">~</span>
            <input type="date" value={to} onChange={(e) => onChange({ period, from, to: e.target.value })} className={FIELD} />
          </>
        ) : null}
      </div>
    </CommunityFilterField>
  );
}

/** @deprecated 목록 화면은 `CommunityFilterBar` 의 [초기화] 를 쓴다. 기존 호출부 호환용. */
export function CommunityResetFilters({ onReset }: { onReset: () => void }) {
  return (
    <AdminActionButton variant="quiet" size="sm" onClick={onReset}>
      필터 {adminCta("reset", true)}
    </AdminActionButton>
  );
}

/**
 * 커뮤니티 목록 필터 바 — 표준 `AdminFilterBar` (기간 PHT · 상태 · 도메인 필터(children) · 검색어 · 오른쪽 [조회][초기화]).
 * 조건은 URL 쿼리(`useCommunityQueryState`) 에 둔다:
 * - 검색어(`searchKey`, 기본 q)·기간 날짜(from/to) → 「조회」/Enter 때 적용. 날짜를 넣으면 period=custom.
 * - 상태(`status.key`)·기간 빠른 선택(period)·children 의 select → 바꾸는 즉시 적용 (호출부가 `q.set`).
 * - 「조회」를 같은 조건으로 누르면 `onRefresh` (주소가 그대로라 다시 불러오지 않으므로).
 * - 「초기화」 → `resetKeep`(예: tab) 과 페이지 크기만 남기고 조건 삭제. `onReset` 을 주면 그것을 쓴다.
 */
export function CommunityFilterBar({
  ko = true,
  showSearch = true,
  searchKey = "q",
  searchPlaceholder,
  showPeriod = false,
  status,
  children,
  resetKeep = [],
  onReset,
  onRefresh,
  pending = false,
  defaultSize,
}: {
  ko?: boolean;
  showSearch?: boolean;
  searchKey?: string;
  searchPlaceholder?: string;
  /** 기간(PHT) — 빠른 선택(오늘·7일·30일) + 시작일~종료일 */
  showPeriod?: boolean;
  status?: { key?: string; label?: string; options: readonly { value: string; label: string }[] };
  children?: ReactNode;
  resetKeep?: string[];
  onReset?: () => void;
  onRefresh?: () => void;
  pending?: boolean;
  defaultSize?: AdminListPageSize;
}) {
  const q = useCommunityQueryState({ defaultSize });
  const applied: AdminListQueryDraft = {
    q: showSearch ? q.get(searchKey) : "",
    from: showPeriod ? q.get("from") : "",
    to: showPeriod ? q.get("to") : "",
  };
  const appliedKey = `${applied.q}\u0000${applied.from}\u0000${applied.to}`;
  const [draftState, setDraftState] = useState<{ key: string; draft: AdminListQueryDraft }>(() => ({
    key: appliedKey,
    draft: applied,
  }));
  let draft = draftState.draft;
  if (draftState.key !== appliedKey) {
    draft = applied;
    setDraftState({ key: appliedKey, draft });
  }
  const period = q.get("period");
  const statusKey = status?.key ?? "status";

  const submit = () => {
    const patch: Record<string, string | null> = {};
    if (showSearch) patch[searchKey] = draft.q.trim() || null;
    if (showPeriod) {
      const a = draft.from || draft.to;
      const b = draft.to || draft.from;
      if (a) {
        patch.period = "custom";
        patch.from = a <= b ? a : b;
        patch.to = a <= b ? b : a;
      } else {
        patch.from = null;
        patch.to = null;
        if (period === "custom") patch.period = null;
      }
    }
    if (!q.set(patch)) onRefresh?.();
  };

  return (
    <AdminFilterBar
      ko={ko}
      draft={draft}
      onDraftChange={(p) => setDraftState((prev) => ({ key: prev.key, draft: { ...prev.draft, ...p } }))}
      onSubmit={submit}
      onReset={onReset ?? (() => q.reset(resetKeep))}
      showSearch={showSearch}
      showPeriod={showPeriod}
      searchPlaceholder={searchPlaceholder}
      pending={pending}
      status={
        status
          ? {
              value: q.get(statusKey),
              label: status.label,
              options: status.options,
              onChange: (v) => q.set({ [statusKey]: v || null }),
            }
          : undefined
      }
    >
      {showPeriod ? (
        <CommunityFilterField label={ko ? "기간 (필리핀 시간)" : "Period (PHT)"}>
          <CommunitySelect
            name="period"
            value={period}
            onChange={(v) => q.set({ period: v || null, from: null, to: null })}
            options={COMMUNITY_PERIOD_OPTIONS.filter((o) => o.value !== "custom" || period === "custom").map((o) => ({
              value: o.value,
              label: o.value === "custom" ? "직접 지정 (시작일~종료일)" : o.label,
            }))}
          />
        </CommunityFilterField>
      ) : null}
      {children}
    </AdminFilterBar>
  );
}

/* ───────── 표 셀 ───────── */

export function CommunityStatusBadge({
  domain,
  value,
  ko = true,
}: {
  domain: AdminCommunityLabelDomain;
  value: string | null | undefined;
  ko?: boolean;
}) {
  const l = adminCommunityLabel(domain, value, ko);
  return <AdminToneBadge tone={l.tone}>{l.label}</AdminToneBadge>;
}

/** 누가 — 닉네임 + DIBAY ID + 작성자 조회 링크 */
export function CommunityAuthorCell({
  userId,
  nickname,
  handle,
  origin,
  sourceName,
}: {
  userId: string | null | undefined;
  nickname?: string | null;
  handle?: string | null;
  origin?: string | null;
  /** 외부 수집 글 출처 사이트명 */
  sourceName?: string | null;
}) {
  if (origin === "imported") {
    return (
      <span className="flex flex-col">
        <span className="font-medium text-sam-fg">외부 수집</span>
        {sourceName ? <span className="sam-text-xxs text-sam-muted">출처: {sourceName}</span> : null}
      </span>
    );
  }
  if (origin === "admin") {
    return <span className="font-medium text-sam-fg">DIBAY 운영팀</span>;
  }
  if (!userId) return <span className="text-sam-muted">—</span>;
  return (
    <span className="flex flex-col">
      <Link
        href={`/admin/community/members/${encodeURIComponent(userId)}`}
        className="font-medium text-sam-primary hover:underline"
      >
        {nickname?.trim() || "이름 없음"}
      </Link>
      {handle ? <span className="sam-text-xxs text-sam-muted">@{handle}</span> : null}
    </span>
  );
}

/** 언제 — 상대 시간 + 마우스 올리면 필리핀 절대 시각 */
export function CommunityTimeCell({ iso, absolute = false }: { iso: string | null | undefined; absolute?: boolean }) {
  if (!iso) return <span className="text-sam-muted">—</span>;
  const abs = `${formatAdminManilaDateTime(iso)} PHT`;
  if (absolute) return <span className="whitespace-nowrap">{abs}</span>;
  return (
    <time dateTime={iso} title={abs} className="whitespace-nowrap">
      {relativeKo(iso)}
    </time>
  );
}

function relativeKo(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}일 전`;
  return formatAdminManilaDateTime(iso).slice(0, 10);
}

/* ───────── 페이지네이션 (서버) ───────── */

/**
 * 서버 페이지네이션 — 총 건수를 알면 표준 `AdminPagination`(「전체 N건 중」·번호·20/50/100),
 * 모르면(hasMore 만 아는 API) 이전/다음 + 페이지 크기.
 * `onSizeChange` 를 주면 20/50/100 선택을 보인다 (`useCommunityQueryState().setSize`).
 */
export function CommunityPagination({
  page,
  pageSize,
  total,
  onPage,
  hasMore,
  onSizeChange,
  disabled = false,
  ko = true,
}: {
  page: number;
  pageSize: number;
  /** 총 건수를 모르면 null — 「다음」은 hasMore 로 판단 */
  total: number | null;
  onPage: (p: number) => void;
  hasMore?: boolean;
  onSizeChange?: (size: AdminListPageSize) => void;
  disabled?: boolean;
  ko?: boolean;
}) {
  const size = normalizeAdminListPageSize(pageSize, COMMUNITY_LIST_DEFAULT_PAGE_SIZE);
  if (total !== null) {
    return (
      <AdminPagination
        ko={ko}
        page={page}
        size={size}
        total={total}
        onPageChange={onPage}
        onSizeChange={onSizeChange}
        disabled={disabled}
        className="px-1"
      />
    );
  }
  const canNext = hasMore ?? true;
  return (
    <nav
      data-admin-pagination="1"
      aria-label={ko ? "페이지 이동" : "Pagination"}
      className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2 px-1 py-3 text-[13px] text-sam-muted"
    >
      <span data-admin-pagination-summary="1">{ko ? `${formatAdminNumber(page)}쪽` : `Page ${formatAdminNumber(page)}`}</span>
      <div className="flex gap-1">
        <AdminActionButton variant="secondary" size="sm" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
          {ko ? "이전" : "Prev"}
        </AdminActionButton>
        <AdminActionButton variant="secondary" size="sm" disabled={disabled || !canNext} onClick={() => onPage(page + 1)}>
          {ko ? "다음" : "Next"}
        </AdminActionButton>
      </div>
      {onSizeChange ? (
        <label className="flex items-center gap-1.5">
          <span>{ko ? "페이지당" : "Per page"}</span>
          <select
            value={size}
            disabled={disabled}
            onChange={(e) => onSizeChange(normalizeAdminListPageSize(e.target.value, size))}
            className="h-9 rounded-ui-rect border border-sam-border bg-sam-surface px-2 text-[13px] text-sam-fg"
            data-admin-pagination-size="1"
          >
            {ADMIN_LIST_PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {ko ? `${s}건` : String(s)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </nav>
  );
}

/** 목록 화면 하단 — URL 상태(`useCommunityQueryState`) 와 연결된 표준 페이지네이션. */
export function CommunityListPagination({
  q,
  total,
  hasMore,
  disabled,
}: {
  q: Pick<ReturnType<typeof useCommunityQueryState>, "page" | "size" | "setPage" | "setSize">;
  total: number | null;
  hasMore?: boolean;
  disabled?: boolean;
}) {
  if (total !== null && total <= 0) return null;
  if (total === null && q.page <= 1 && !hasMore) return null;
  return (
    <CommunityPagination
      page={q.page}
      pageSize={q.size}
      total={total}
      hasMore={hasMore}
      onPage={q.setPage}
      onSizeChange={q.setSize}
      disabled={disabled}
    />
  );
}

/* ───────── 표 ───────── */

export function CommunityTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div data-admin-mgmt-table-viewport="1" className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-sam-border bg-sam-app text-left text-[12px] text-sam-muted">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const COMMUNITY_TD = "px-3 py-2 align-top";

/** 상세 시트·페이지 고정 구성 ① 대상 요약 카드 */
export function CommunitySummaryCard({ rows }: { rows: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-2 rounded-ui-rect border border-sam-border bg-sam-app p-3 text-[13px] sm:grid-cols-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[6.5rem_1fr] gap-2">
          <dt className="text-sam-muted">{r.label}</dt>
          <dd className="min-w-0 text-sam-fg [overflow-wrap:anywhere]">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** ② 조치 이력 타임라인 */
export function CommunityTimeline({
  items,
  emptyText = "조치 기록이 없습니다.",
}: {
  items: { id: string; at: string; actor: string; action: string; reason?: string | null }[];
  emptyText?: string;
}) {
  if (items.length === 0) return <p className="text-[13px] text-sam-muted">{emptyText}</p>;
  return (
    <ol className="space-y-2">
      {items.map((it) => (
        <li key={it.id} className="rounded-ui-rect border border-sam-border-soft bg-sam-surface px-3 py-2 text-[13px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-sam-fg">{it.action}</span>
            <span className="text-sam-muted">{formatAdminManilaDateTime(it.at)} PHT · {it.actor}</span>
          </div>
          {it.reason ? <p className="mt-1 whitespace-pre-wrap text-sam-muted">사유: {it.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}
