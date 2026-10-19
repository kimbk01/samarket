"use client";

/**
 * 커뮤니티 Admin 화면 공통 틀 (설계 v2 §C-0-1) — 목록 화면 고정 구성:
 * ① 제목 + 설명 1줄 ② 상태 탭(건수) ③ 필터 줄(검색·기간 PHT·상세 필터·초기화) ④ 일괄 처리 줄 ⑤ 표 ⑥ 서버 페이지네이션.
 * 필터·탭·페이지는 URL 쿼리에 둔다 → 상세 진입 후 복귀 시 그대로 유지된다.
 * 조치 시트는 채팅 Admin 과 같은 `AdminChatActionSheet` (2단계 확인·사유·409/404 처리)를 `CommunityActionSheet` 로 쓴다.
 */
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, type ReactNode } from "react";
import { AdminToneBadge } from "@/components/admin/ui/AdminToneBadge";
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

export function useCommunityQueryState() {
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
  return { get, set, reset, sp, selfHref, page };
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
    <div role="tablist" className="flex flex-wrap gap-1 border-b border-sam-border">
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={[
              "-mb-px border-b-2 px-3 py-2 text-[13px] font-semibold",
              on ? "border-sam-primary text-sam-fg" : "border-transparent text-sam-muted hover:text-sam-fg",
            ].join(" ")}
          >
            {t.label}
            {typeof t.count === "number" ? <span className="ml-1 text-sam-muted">{t.count.toLocaleString()}</span> : null}
          </button>
        );
      })}
    </div>
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
      <button type="submit" className={`${FIELD} ml-1 font-semibold`}>
        검색
      </button>
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
    <button type="button" onClick={onReset} className="px-2 py-1.5 text-[13px] font-medium text-sam-muted underline">
      필터 초기화
    </button>
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
        className="font-medium text-sky-800 hover:underline"
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

export function CommunityPagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  /** 총 건수를 모르면 null — 「다음」은 hasMore 로 판단 */
  total: number | null;
  onPage: (p: number) => void;
  hasMore?: boolean;
}) {
  const totalPages = total === null ? null : Math.max(1, Math.ceil(total / pageSize));
  const canNext = totalPages === null ? true : page < totalPages;
  return (
    <div className="flex items-center justify-between gap-2 px-1 text-[13px] text-sam-muted">
      <span>{total === null ? `${page}페이지` : `총 ${total.toLocaleString()}건 · ${page}/${totalPages}페이지`}</span>
      <div className="flex gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className={`${FIELD} disabled:opacity-40`}
        >
          이전
        </button>
        <button type="button" disabled={!canNext} onClick={() => onPage(page + 1)} className={`${FIELD} disabled:opacity-40`}>
          다음
        </button>
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
