"use client";

/**
 * Admin 목록 필터 바 (설계 v4 §7 「필터 바」).
 * 순서: 기간(from/to) → 상태 → 도메인 특수(children) → 검색어 → 「조회」(primary) / 「초기화」(ghost).
 * 상태는 바꾸는 즉시 적용, 검색어·기간은 「조회」/Enter 로 적용 — 이 규칙은 `useAdminListQuery` 가 지킨다.
 * 상태를 갖지 않는다. 연결 예:
 *   const lq = useAdminListQuery({ statuses: ["pending", "completed"] });
 *   <AdminFilterBar ko={ko} draft={lq.draft} onDraftChange={lq.setDraft} onSubmit={lq.submit} onReset={lq.reset}
 *     status={{ value: lq.query.status, onChange: lq.setStatus, options: [...] }} />
 * 입력 글자 크기 16px (태블릿 확대 방지), 높이 40.
 */

import type { FormEvent, ReactNode } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import type { AdminListQueryDraft } from "@/lib/admin/list-query/use-admin-list-query";

export type AdminFilterStatusOption = { value: string; label: string };

const FIELD =
  "h-10 rounded-ui-rect border border-[var(--admin-console-border,#d0d7e2)] bg-[var(--admin-console-surface,#fff)] px-2.5 text-[16px] text-[var(--admin-console-fg,#1f2937)] focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-[var(--admin-console-accent,#1d4ed8)] disabled:opacity-50";
const LABEL = "flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted,#667085)]";

export function AdminFilterBar({
  ko,
  draft,
  onDraftChange,
  onSubmit,
  onReset,
  status,
  showPeriod = true,
  showSearch = true,
  searchPlaceholder,
  pending = false,
  children,
  className = "",
}: {
  ko: boolean;
  draft: AdminListQueryDraft;
  onDraftChange: (patch: Partial<AdminListQueryDraft>) => void;
  /** 「조회」/Enter */
  onSubmit: () => void;
  /** 「초기화」 */
  onReset: () => void;
  /** 상태 선택 — 생략하면 숨김. 「전체」(value "") 가 없으면 맨 앞에 자동으로 넣는다. */
  status?: {
    value: string;
    options: readonly AdminFilterStatusOption[];
    onChange: (value: string) => void;
    label?: string;
  };
  showPeriod?: boolean;
  showSearch?: boolean;
  searchPlaceholder?: string;
  /** 조회 중 — 버튼 비활성 */
  pending?: boolean;
  /** 도메인 특수 필터 (상태와 검색어 사이) */
  children?: ReactNode;
  className?: string;
}) {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pending) onSubmit();
  };
  const statusOptions = status
    ? status.options.some((o) => o.value === "")
      ? status.options
      : [{ value: "", label: ko ? "전체" : "All" }, ...status.options]
    : [];

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      data-admin-filter-bar="1"
      className={`flex flex-wrap items-end gap-2 rounded-ui-rect border border-[var(--admin-console-border,#d0d7e2)] bg-[var(--admin-console-surface,#fff)] p-3 ${className}`.trim()}
    >
      {showPeriod ? (
        <div className="flex items-end gap-1" data-admin-filter-period="1">
          <label className={LABEL}>
            {ko ? "시작일" : "From"}
            <input
              type="date"
              value={draft.from}
              max={draft.to || undefined}
              onChange={(e) => onDraftChange({ from: e.target.value })}
              className={FIELD}
              name="from"
            />
          </label>
          <span aria-hidden className="pb-2.5 text-[var(--admin-console-muted,#667085)]">
            ~
          </span>
          <label className={LABEL}>
            {ko ? "종료일" : "To"}
            <input
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(e) => onDraftChange({ to: e.target.value })}
              className={FIELD}
              name="to"
            />
          </label>
        </div>
      ) : null}
      {status ? (
        <label className={LABEL} data-admin-filter-status="1">
          {status.label ?? (ko ? "상태" : "Status")}
          <select value={status.value} onChange={(e) => status.onChange(e.target.value)} className={FIELD} name="status">
            {statusOptions.map((o) => (
              <option key={o.value || "__all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {children ? (
        <div className="flex flex-wrap items-end gap-2" data-admin-filter-domain="1">
          {children}
        </div>
      ) : null}
      {showSearch ? (
        <label className={`${LABEL} min-w-[12rem] flex-1`}>
          {ko ? "검색어" : "Search"}
          <input
            type="search"
            value={draft.q}
            onChange={(e) => onDraftChange({ q: e.target.value })}
            placeholder={searchPlaceholder ?? (ko ? "검색어 입력 후 Enter" : "Type and press Enter")}
            className={FIELD}
            name="q"
            enterKeyHint="search"
          />
        </label>
      ) : null}
      <div className="flex items-center gap-1">
        <AdminActionButton type="submit" variant="primary" className="h-10" disabled={pending} data-admin-filter-submit="1">
          {ko ? "조회" : "Search"}
        </AdminActionButton>
        <AdminActionButton type="button" variant="ghost" className="h-10" disabled={pending} onClick={onReset} data-admin-filter-reset="1">
          {ko ? "초기화" : "Reset"}
        </AdminActionButton>
      </div>
    </form>
  );
}
