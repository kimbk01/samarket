"use client";

/**
 * 서버 페이지 목록의 화면 상태 + 하단 `AdminPagination` (R7).
 * 첫 로딩 → AdminLoadingState · 실패 → AdminErrorState(code·HTTP·[새로고침], 403 은 접근 거부) — 직전 목록이 있으면 위에 오류만 얹고 목록 유지 ·
 * 0건 → AdminEmptyState(필터가 걸렸으면 [초기화]) · 그 외 children + 「총 N건」 페이지 이동(20/50/100).
 */

import type { ReactNode } from "react";
import { AdminEmptyState, AdminErrorState, AdminLoadingState } from "@/components/admin/ui/AdminStateViews";
import { AdminPagination } from "@/components/admin/ui/AdminPagination";
import type { AdminListPageSize } from "@/lib/admin/list-query/admin-list-query";
import type { AdminServerPageState } from "@/components/admin/sync-list/useAdminServerPage";

export function AdminServerListFrame<T>({
  ko,
  state,
  page,
  size,
  onPageChange,
  onSizeChange,
  onRetry,
  onReset,
  emptyMessage,
  children,
}: {
  ko: boolean;
  state: AdminServerPageState<T>;
  page: number;
  size: AdminListPageSize;
  onPageChange: (page: number) => void;
  onSizeChange: (size: AdminListPageSize) => void;
  onRetry: () => void;
  /** 필터가 걸린 상태면 넘긴다 — 빈 목록에 [초기화] */
  onReset?: () => void;
  emptyMessage?: string;
  children: (items: T[]) => ReactNode;
}) {
  if (!state.loaded && state.loading) return <AdminLoadingState ko={ko} />;
  if (!state.loaded && state.error) {
    return <AdminErrorState ko={ko} code={state.error.code} httpStatus={state.error.httpStatus} onRetry={onRetry} />;
  }
  return (
    <div className="space-y-3">
      {state.error ? (
        <AdminErrorState ko={ko} code={state.error.code} httpStatus={state.error.httpStatus} onRetry={onRetry} />
      ) : null}
      {state.items.length === 0 ? (
        <AdminEmptyState ko={ko} message={onReset ? undefined : emptyMessage} onReset={onReset} />
      ) : (
        children(state.items)
      )}
      {state.total > 0 ? (
        <AdminPagination
          ko={ko}
          page={page}
          size={size}
          total={state.total}
          onPageChange={onPageChange}
          onSizeChange={onSizeChange}
          disabled={state.loading}
        />
      ) : null}
    </div>
  );
}
