"use client";

/**
 * 커뮤니티 Admin 화면 공통 틀 (설계 v2 §C-0-1) — 목록 화면 고정 구성:
 * ① 제목 + 설명 1줄 ② 상태 탭(건수) ③ 필터 줄(검색·기간 PHT·상세 필터·초기화) ④ 일괄 처리 줄 ⑤ 표 ⑥ 서버 페이지네이션.
 * 필터·탭·페이지는 URL 쿼리에 둔다 → 상세 진입 후 복귀 시 그대로 유지된다.
 * 조치 시트는 채팅 Admin 과 같은 `AdminChatActionSheet` (2단계 확인·사유·409/404 처리)를 `CommunityActionSheet` 로 쓴다.
 *
 * R7 목록 표준 (신규 — 기존 export 는 그대로 유지):
 * - `useCommunityListQuery` = `useAdminListQuery` + 옛 `period` 프리셋 링크 호환 + `selfHref` + 커뮤니티 API 파라미터(`apiParams`).
 * - `CommunityFilterBar` = `AdminFilterBar` (기간 from/to · 상태 · 도메인 필터 · 검색어 · [조회] · [초기화]).
 * - `CommunityListPagination` = `AdminPagination` (20/50/100 · URL `size`).
 * - `CommunityListBody` = 로딩 / 오류(403 구분 · 기존 목록 유지) / 빈 목록(필터 중 [초기화]) / 표.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, type ReactNode } from "react";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { AdminTabs } from "@/components/admin/ui/AdminTabs";
import { AdminFilterBar, type AdminFilterStatusOption } from "@/components/admin/ui/AdminFilterBar";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import {
  ADMIN_LIST_PAGE_SIZES,
  defaultAdminListQuery,
  normalizeAdminListPageSize,
  type AdminListPageSize,
  type AdminListQueryConfig,
} from "@/lib/admin/list-query/admin-list-query";
import { useAdminListQuery, type UseAdminListQueryResult } from "@/lib/admin/list-query/use-admin-list-query";
import { communityAdminListPeriodParams } from "@/lib/admin/community-admin/community-admin-period";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
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

export function useCommunityQueryState(opts?: { defaultSize?: AdminListPageSize }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const get = useCallback((k: string) => sp.get(k) ?? "", [sp]);
  const set = useCallback(
    (patch: Record<string, string | number | null | undefined>, opts?: { keepPage?: boolean }) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === undefined || v === "") next.delete(k);
        else next.set(k, String(v));
      }
      if (!opts?.keepPage && !("page" in patch)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, sp]
  );
  const reset = useCallback(
    (keep: string[] = []) => {
      const next = new URLSearchParams();
      for (const k of keep) {
        const v = sp.get(k);
        if (v) next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, sp]
  );
  /** 현재 목록 URL — 상세로 갈 때 returnTo 로 넘긴다 */
  const selfHref = useMemo(() => {
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, sp]);
  const page = Math.max(1, Number(sp.get("page") ?? 1) || 1);
  /** URL `size` (20/50/100 만, 그 외 기본값) — `CommunityPagination` 의 `onPageSize` 와 함께 쓴다 */
  const size = normalizeAdminListPageSize(sp.get("size"), opts?.defaultSize);
  return { get, set, reset, sp, selfHref, page, size };
}

/* ───────── R7 목록 조회 조건 (AdminFilterBar · AdminPagination) ───────── */

/** 옛 기간 프리셋 키 — 대시보드·다른 화면 딥링크(`?period=7d`) 호환용 추가 키 */
const LEGACY_PERIOD_KEY = "period";

export type CommunityListQueryConfig<E extends string = string> = AdminListQueryConfig<E> & {
  /**
   * [초기화] 후에도 유지할 공통 키 — 상태를 탭으로 보여 주는 화면(`status` 가 탭)에서 `{ status: true }`.
   * 유지하는 키는 `isFiltered`(빈 목록 [초기화] 표시 기준)에서도 빠진다.
   */
  keepOnReset?: { status?: boolean };
};

export type CommunityListQuery<E extends string = string> = UseAdminListQueryResult<E | "period"> & {
  /** 현재 목록 URL — 상세로 갈 때 returnTo 로 넘긴다 */
  selfHref: string;
  /** 옛 `period` 프리셋(today/7d/30d) — 날짜를 직접 고르면 지워진다. 없으면 "" */
  legacyPeriod: string;
  /**
   * 커뮤니티 목록 API 파라미터: `limit`/`offset` + `q` + `status` + 추가 키 + 기간(`period`/`from`/`to`).
   * - `statusKey`/`qKey`: API 키 이름이 다를 때 (예: `tab`)
   * - `period: false`: 기간을 보내지 않는다 / `"dates"`: from/to 만 (period 키 없이)
   * - `omit`: 보내지 않을 추가 키
   */
  apiParams: (opts?: {
    statusKey?: string;
    qKey?: string;
    period?: boolean | "dates";
    omit?: readonly string[];
  }) => URLSearchParams;
};

/**
 * 커뮤니티 목록 조회 조건 — `useAdminListQuery` 를 그대로 쓰고 커뮤니티 API 연결만 더한다.
 * 주소 키: page · size(20/50/100) · status · q · from/to(PHT 날짜) · sort · 추가 키 · (호환) period.
 * `useSearchParams` 를 쓰므로 `<Suspense>` 안에서 렌더한다.
 */
export function useCommunityListQuery<E extends string = string>(
  config: CommunityListQueryConfig<E> = {}
): CommunityListQuery<E> {
  const pathname = usePathname() ?? "";
  const sp = useSearchParams();
  const keepStatus = config.keepOnReset?.status === true;
  const fullConfig = useMemo<AdminListQueryConfig<E | "period">>(
    () => ({
      defaults: config.defaults,
      statuses: config.statuses,
      sorts: config.sorts,
      extraDefaults: config.extraDefaults as Partial<Record<E | "period", string>> | undefined,
      extras: [...(config.extras ?? []).filter((k) => k !== LEGACY_PERIOD_KEY), LEGACY_PERIOD_KEY] as (E | "period")[],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 내용 비교 (useAdminListQuery 와 같은 규칙)
    [JSON.stringify(config)]
  );
  const lq = useAdminListQuery<E | "period">(fullConfig);
  const legacyRaw = lq.query.extras[LEGACY_PERIOD_KEY as E | "period"] ?? "";
  const legacyPeriod = ["today", "7d", "30d"].includes(legacyRaw) ? legacyRaw : "";
  const { patch, draft, setDraft } = lq;
  /** 「조회」 — 날짜를 직접 고르면 옛 프리셋은 지운다 */
  const submit = useCallback(() => {
    const extras = (draft.from || draft.to ? { [LEGACY_PERIOD_KEY]: "" } : {}) as Partial<Record<E | "period", string>>;
    patch({ q: draft.q, from: draft.from, to: draft.to, extras });
  }, [draft, patch]);
  const def = useMemo(() => defaultAdminListQuery(fullConfig), [fullConfig]);
  /** 「초기화」 — 기본값으로 (keepOnReset 키는 유지, 페이지 크기는 유지) */
  const reset = useCallback(() => {
    if (!keepStatus) {
      lq.reset();
      return;
    }
    setDraft({ q: "", from: "", to: "" });
    patch({ q: "", from: "", to: "", sort: def.sort, extras: def.extras });
  }, [def, keepStatus, lq, patch, setDraft]);
  const isFiltered = useMemo(() => {
    if (!keepStatus) return lq.isFiltered;
    const pick = (x: { q: string; from: string; to: string; sort: string; extras: unknown }) =>
      JSON.stringify([x.q, x.from, x.to, x.sort, x.extras]);
    return pick(def) !== pick(lq.query);
  }, [def, keepStatus, lq.isFiltered, lq.query]);
  const search = sp?.toString() ?? "";
  const selfHref = search ? `${pathname}?${search}` : pathname;
  const { query } = lq;
  const apiParams = useCallback(
    (opts: { statusKey?: string; qKey?: string; period?: boolean | "dates"; omit?: readonly string[] } = {}) => {
      const out = new URLSearchParams();
      out.set("limit", String(query.size));
      out.set("offset", String((query.page - 1) * query.size));
      if (query.status) out.set(opts.statusKey ?? "status", query.status);
      if (query.q) out.set(opts.qKey ?? "q", query.q);
      if (query.sort) out.set("sort", query.sort);
      for (const [k, v] of Object.entries(query.extras) as [string, string][]) {
        if (k === LEGACY_PERIOD_KEY || !v || opts.omit?.includes(k)) continue;
        out.set(k, v);
      }
      if (opts.period !== false) {
        const p = communityAdminListPeriodParams({ period: legacyPeriod, from: query.from, to: query.to });
        if (opts.period === "dates") {
          if (p.from) out.set("from", p.from);
          if (p.to) out.set("to", p.to);
        } else {
          out.set("period", p.period);
          if (p.from) out.set("from", p.from);
          if (p.to) out.set("to", p.to);
        }
      }
      return out;
    },
    [legacyPeriod, query]
  );
  return { ...lq, submit, reset, isFiltered, selfHref, legacyPeriod, apiParams };
}

const LEGACY_PERIOD_LABEL: Record<string, string> = { today: "오늘", "7d": "최근 7일", "30d": "최근 30일" };

/**
 * 목록 필터 바 — `AdminFilterBar` 를 커뮤니티 조회 조건에 연결한다.
 * 상태 선택은 즉시 적용, 검색어·기간은 [조회]/Enter. [초기화] 는 모든 조건(추가 키 포함)을 기본값으로.
 */
export function CommunityFilterBar<E extends string = string>({
  lq,
  status,
  searchPlaceholder,
  showPeriod = true,
  showSearch = true,
  pending = false,
  children,
}: {
  lq: CommunityListQuery<E>;
  status?: { options: readonly AdminFilterStatusOption[]; label?: string };
  searchPlaceholder?: string;
  showPeriod?: boolean;
  showSearch?: boolean;
  pending?: boolean;
  /** 도메인 특수 필터 — `CommunityFilterField` + `CommunitySelect` (즉시 적용은 `lq.setExtra`) */
  children?: ReactNode;
}) {
  return (
    <AdminFilterBar
      ko
      draft={lq.draft}
      onDraftChange={lq.setDraft}
      onSubmit={lq.submit}
      onReset={lq.reset}
      status={status ? { value: lq.query.status, onChange: lq.setStatus, options: status.options, label: status.label } : undefined}
      showPeriod={showPeriod}
      showSearch={showSearch}
      searchPlaceholder={searchPlaceholder}
      pending={pending}
    >
      {showPeriod && lq.legacyPeriod && !lq.query.from && !lq.query.to ? (
        <CommunityFilterField label="기간 (필리핀 시간)">
          <span className="flex h-10 items-center gap-2 text-[13px] text-sam-fg">
            {LEGACY_PERIOD_LABEL[lq.legacyPeriod]}
            <AdminActionButton
              variant="quiet"
              size="sm"
              className="h-auto! px-1!"
              onClick={() => lq.patch({ extras: { period: "" } as Partial<Record<E | "period", string>> })}
            >
              해제
            </AdminActionButton>
          </span>
        </CommunityFilterField>
      ) : null}
      {children}
    </AdminFilterBar>
  );
}

/** 목록 하단 페이지네이션 — 「총 N건」 · 이전/번호/다음 · 페이지당 20/50/100 (URL `size`). total 을 모르면 숨긴다. */
export function CommunityListPagination<E extends string = string>({
  lq,
  total,
  disabled = false,
}: {
  lq: CommunityListQuery<E>;
  total: number | null | undefined;
  disabled?: boolean;
}) {
  if (typeof total !== "number" || total <= 0) return null;
  return (
    <AdminPagination
      ko
      page={lq.query.page}
      size={lq.query.size}
      total={total}
      onPageChange={lq.setPage}
      onSizeChange={lq.setSize}
      disabled={disabled}
    />
  );
}

/** 목록 빈 상태 — 조건이 걸려 있으면 「조건에 맞는 항목이 없습니다」 + [초기화] */
export function CommunityListEmpty<E extends string = string>({
  lq,
  message,
  filteredMessage,
}: {
  lq?: CommunityListQuery<E> | null;
  /** 조건이 없을 때 문구 */
  message?: string;
  /** 조건이 걸렸을 때 문구 (생략 시 표준 문구) */
  filteredMessage?: string;
}) {
  if (lq?.isFiltered) return <AdminEmptyState ko message={filteredMessage} onReset={lq.reset} />;
  return <AdminEmptyState ko message={message} />;
}

/** `useCommunityAdminJson` 의 상태와 같은 모양 (kit 이 data 훅에 의존하지 않도록 구조만) */
export type CommunityListLoadState =
  | { status: "loading"; data: unknown }
  | { status: "ok"; data: unknown }
  | { status: "error"; data: unknown; code: string; httpStatus: number };

/**
 * 목록 본문 4상태 — 로딩(처음만) · 오류(403 은 권한 없음, 기존 목록이 있으면 오류 안내 + 기존 목록 유지) ·
 * 빈 목록(필터 중 [초기화]) · 표.
 */
export function CommunityListBody<E extends string = string>({
  state,
  empty,
  lq,
  onRetry,
  emptyMessage,
  filteredEmptyMessage,
  children,
}: {
  state: CommunityListLoadState;
  /** 표시할 행이 없는지 */
  empty: boolean;
  lq?: CommunityListQuery<E> | null;
  onRetry: () => void;
  emptyMessage?: string;
  filteredEmptyMessage?: string;
  children: ReactNode;
}) {
  const hasData = state.data !== null && state.data !== undefined;
  if (state.status === "loading" && !hasData) return <AdminLoadingState ko />;
  if (state.status === "error" && (!hasData || empty)) {
    return <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={onRetry} />;
  }
  return (
    <>
      {state.status === "error" ? (
        <AdminErrorState ko code={state.code} httpStatus={state.httpStatus} onRetry={onRetry} />
      ) : null}
      {empty ? <CommunityListEmpty lq={lq} message={emptyMessage} filteredMessage={filteredEmptyMessage} /> : children}
    </>
  );
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
  filters?: ReactNode;
  /** 표준 필터 바 (`CommunityFilterBar`) — 자체 테두리가 있어 감싸지 않는다 */
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

const FIELD = "rounded-ui-rect border border-sam-border bg-sam-surface px-2.5 py-1.5 text-[13px] text-sam-fg outline-none focus:border-sam-primary";

export function CommunityFilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-[8rem] flex-col gap-1 text-[12px] font-medium text-sam-muted">
      {label}
      {children}
    </label>
  );
}

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
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD}>
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

/** 기간 — 필리핀 시간 날짜. 서버가 Asia/Manila [from, to) 로 바꾼다. */
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

export function CommunityResetFilters({ onReset }: { onReset: () => void }) {
  return (
    <AdminActionButton variant="quiet" size="sm" onClick={onReset}>
      필터 {adminCta("reset", true)}
    </AdminActionButton>
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
 * (기존 API) 서버 페이지네이션. 총 건수를 알면 표준 `AdminPagination`(번호·「총 N건」)으로 그리고,
 * `onPageSize` 를 주면 페이지당 20/50/100 선택도 보인다 (URL `size` — `useCommunityQueryState().size`).
 * 새 화면은 `useCommunityListQuery` + `CommunityListPagination` 을 쓴다.
 */
export function CommunityPagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  disabled = false,
}: {
  page: number;
  pageSize: number;
  /** 총 건수를 모르면 null — 「다음」은 hasMore 로 판단 */
  total: number | null;
  onPage: (p: number) => void;
  hasMore?: boolean;
  /** 페이지당 건수 변경 (20/50/100) — 생략하면 선택을 숨긴다 */
  onPageSize?: (size: AdminListPageSize) => void;
  disabled?: boolean;
}) {
  if (total !== null) {
    const isStd = (ADMIN_LIST_PAGE_SIZES as readonly number[]).includes(pageSize);
    return (
      <AdminPagination
        ko
        page={page}
        size={pageSize as AdminListPageSize}
        total={total}
        onPageChange={onPage}
        onSizeChange={isStd ? onPageSize : undefined}
        disabled={disabled}
      />
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 px-1 text-[13px] text-sam-muted">
      <span>{`${page}페이지`}</span>
      <div className="flex gap-1">
        <AdminActionButton variant="secondary" size="sm" disabled={disabled || page <= 1} onClick={() => onPage(page - 1)}>
          이전
        </AdminActionButton>
        <AdminActionButton variant="secondary" size="sm" disabled={disabled} onClick={() => onPage(page + 1)}>
          다음
        </AdminActionButton>
      </div>
    </div>
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
