"use client";

/**
 * 서버 페이지 목록 본문 (R7 목록 표준 · 회원·고객지원·알림·결제/포인트 화면 공용).
 * 화면 상태 4종(로딩·빈 목록·오류·403)과 「총 N건」 + `AdminPagination`(20/50/100) 을 한 곳에서 그린다.
 * - 첫 로딩: `AdminLoadingState` · 재조회: 기존 목록 유지 + 페이지 버튼 비활성
 * - 오류: `AdminErrorState`(code + httpStatus + [새로고침], 403 은 권한 없음) — 직전 정상 목록은 지우지 않는다(§8-5)
 * - 빈 목록: `AdminEmptyState` — 필터가 걸렸으면 [초기화]
 */

import type { ReactNode } from "react";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  isAdminForbiddenCode,
} from "@/components/admin/ui/AdminStateViews";
import type { AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import { formatAdminNumber } from "@/lib/admin/ui-standard/admin-format";
import type { MemberOpsLoadError } from "@/lib/admin/member-ops-list/use-member-ops-paged-fetch";

export function MemberOpsListBody({
  ko,
  loading,
  loaded,
  error,
  onRetry,
  rowCount,
  total,
  page,
  size,
  onPageChange,
  onSizeChange,
  isFiltered = false,
  onReset,
  emptyMessage,
  showTotal = true,
  children,
}: {
  ko: boolean;
  loading: boolean;
  loaded: boolean;
  error: MemberOpsLoadError | null;
  onRetry: () => void;
  /** 현재 쪽 행 수 */
  rowCount: number;
  /** 서버 `total` (count exact) */
  total: number;
  page: number;
  size: AdminListPageSize;
  onPageChange: (page: number) => void;
  onSizeChange?: (size: AdminListPageSize) => void;
  isFiltered?: boolean;
  onReset?: () => void;
  emptyMessage?: string;
  showTotal?: boolean;
  children: ReactNode;
}) {
  const forbidden = error ? isAdminForbiddenCode(error.code, error.httpStatus) : false;
  return (
    <div className="space-y-3" data-member-ops-list="1">
      {showTotal && loaded && !forbidden ? (
        <p className="sam-text-body-secondary tabular-nums text-sam-muted" data-admin-list-total="1">
          {ko ? `총 ${formatAdminNumber(total)}건` : `${formatAdminNumber(total)} total`}
        </p>
      ) : null}
      {error ? (
        <AdminErrorState ko={ko} code={error.code} httpStatus={error.httpStatus} onRetry={onRetry} />
      ) : null}
      {forbidden ? null : !loaded ? (
        error ? null : <AdminLoadingState ko={ko} />
      ) : rowCount === 0 ? (
        <AdminEmptyState
          ko={ko}
          message={isFiltered && onReset ? undefined : emptyMessage}
          onReset={isFiltered ? onReset : undefined}
        />
      ) : (
        <div aria-busy={loading || undefined} className={loading ? "opacity-60" : undefined}>
          {children}
        </div>
      )}
      {loaded && !forbidden && total > 0 ? (
        <AdminPagination
          ko={ko}
          page={page}
          size={size}
          total={total}
          onPageChange={onPageChange}
          onSizeChange={onSizeChange}
          disabled={loading}
        />
      ) : null}
    </div>
  );
}
