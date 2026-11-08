"use client";

/**
 * G-06 도메인 범위 선택 (전체/배달/거래/커뮤니티) — 공통 광고·프로모션 목록을 도메인 업무 화면에서 걸러 연다.
 * 값은 URL `?domain=` (`ADMIN_DOMAIN_SCOPE_QUERY_KEY`) — 상태 보존은 호출 화면(useAdminListQuery extras 등) 책임.
 */

import {
  ADMIN_DOMAIN_SCOPES,
  adminDomainScopeLabel,
  normalizeAdminDomainScope,
  type AdminDomainScope,
} from "@/lib/admin/list-query/admin-domain-scope";
import { translate, type MessageKey } from "@/lib/i18n/messages";

/** 언어 SSOT B4 — 불리언 언어 값으로 카탈로그 문구를 고른다(원래 `ko ? "…" : "…"` 와 같은 결과). */
function tx(ko: unknown, key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(ko ? "ko" : "en", key, vars);
}

export function AdminDomainScopeSelect({
  ko,
  value,
  onChange,
  includesGlobalNote = false,
  className,
}: {
  ko: boolean;
  value: string;
  onChange: (next: AdminDomainScope | "") => void;
  /** 팝업·당겨서 새로고침: 전체 노출(GLOBAL) 캠페인도 그 도메인 결과에 포함된다는 안내. */
  includesGlobalNote?: boolean;
  className?: string;
}) {
  const current = normalizeAdminDomainScope(value);
  return (
    <label
      className={
        className ?? "flex flex-col gap-1 text-[12px] font-medium text-[var(--admin-console-muted)]"
      }
    >
      {tx(ko, "admin_ui_domain")}
      <select
        className="h-10 rounded-ui-rect border border-[var(--admin-console-border)] bg-[var(--admin-console-surface)] px-2.5 text-[16px] text-[var(--admin-console-fg)]"
        value={current}
        onChange={(e) => onChange(normalizeAdminDomainScope(e.target.value))}
        data-admin-domain-scope-filter={current || "all"}
      >
        <option value="">{adminDomainScopeLabel("", ko)}</option>
        {ADMIN_DOMAIN_SCOPES.map((d) => (
          <option key={d} value={d}>
            {includesGlobalNote
              ? tx(ko, "admin_ui_incl_all_surface", { scope: String(adminDomainScopeLabel(d, ko)) })
              : adminDomainScopeLabel(d, ko)}
          </option>
        ))}
      </select>
    </label>
  );
}
