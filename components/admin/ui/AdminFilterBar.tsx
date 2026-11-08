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
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

export type AdminFilterStatusOption = { value: string; label: string };

const FIELD =
  "h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)] focus:outline focus:outline-2 focus:-outline-offset-1 focus:outline-[var(--admin-console-accent)] disabled:opacity-50";
const LABEL = "flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]";

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
  requireCompletePeriod = false,
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
  /**
   * 돈 화면(재감사 D-12·D-16): 시작일·종료일 중 하나만 있거나 시작 > 종료면 조회하지 않고 안내.
   * 서버도 같은 입력을 400 `invalid_period` 로 거절한다(`storeCommissionPeriodInputError`). 다른 화면은 지금 동작 그대로.
   */
  requireCompletePeriod?: boolean;
  /** 도메인 특수 필터 (상태와 검색어 사이) */
  children?: ReactNode;
  className?: string;
}) {
  const periodIncomplete =
    requireCompletePeriod && showPeriod && (Boolean(draft.from) !== Boolean(draft.to) || (Boolean(draft.from) && draft.from > draft.to));
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!pending && !periodIncomplete) onSubmit();
  };
  const statusOptions = status
    ? status.options.some((o) => o.value === "")
      ? status.options
      : [{ value: "", label: tx(ko, "common_all") }, ...status.options]
    : [];

  return (
    <form
      role="search"
      onSubmit={handleSubmit}
      data-admin-filter-bar="1"
      className={`flex flex-wrap items-end gap-2 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] p-3 ${className}`.trim()}
    >
      {showPeriod ? (
        <div className="flex items-end gap-1" data-admin-filter-period="1">
          <label className={LABEL}>
            {tx(ko, "admin_ui_from")}
            <input
              type="date"
              value={draft.from}
              max={draft.to || undefined}
              onChange={(e) => onDraftChange({ from: e.target.value })}
              className={FIELD}
              name="from"
            />
          </label>
          <span aria-hidden className="pb-2.5 text-[var(--admin-console-muted)]">
            ~
          </span>
          <label className={LABEL}>
            {tx(ko, "admin_ui_to")}
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
      {periodIncomplete ? (
        <p role="status" className="basis-full text-[12px] text-sam-danger" data-admin-filter-period-incomplete="1">
          {tx(ko, "admin_ui_pick_both_start_and_end_dates")}
        </p>
      ) : null}
      {status ? (
        <label className={LABEL} data-admin-filter-status="1">
          {status.label ?? tx(ko, "admin_ui_status")}
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
          {tx(ko, "admin_ui_search")}
          <input
            type="search"
            value={draft.q}
            onChange={(e) => onDraftChange({ q: e.target.value })}
            placeholder={searchPlaceholder ?? tx(ko, "admin_ui_type_and_press_enter")}
            className={FIELD}
            name="q"
            enterKeyHint="search"
          />
        </label>
      ) : null}
      <div className="flex items-center gap-1">
        <AdminActionButton
          type="submit"
          variant="primary"
          className="h-10"
          disabled={pending || periodIncomplete}
          data-admin-filter-submit="1"
        >
          {tx(ko, "admin_ui_search_btn")}
        </AdminActionButton>
        <AdminActionButton type="button" variant="ghost" className="h-10" disabled={pending} onClick={onReset} data-admin-filter-reset="1">
          {tx(ko, "admin_ui_reset")}
        </AdminActionButton>
      </div>
    </form>
  );
}
