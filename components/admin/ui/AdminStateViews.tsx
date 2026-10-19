"use client";

/**
 * Admin 화면 상태 4종 (R1 공통 기준) — 로딩 / 빈 데이터 / 불러오기 실패 / 접근 거부.
 * "데이터 없음"과 "불러오기 실패"를 같은 문구로 표시하지 않는다.
 */

import type { ReactNode } from "react";
import { adminOperatorErrorMessage } from "@/lib/admin/operator-ux/operator-labels";

const BOX = "rounded-ui-rect border px-4 py-6 text-center sam-text-body";

export function AdminLoadingState({ ko, label }: { ko: boolean; label?: string }) {
  return (
    <div data-admin-state="loading" className={`${BOX} border-sam-border bg-sam-surface text-sam-muted`} role="status">
      {label ?? (ko ? "불러오는 중…" : "Loading…")}
    </div>
  );
}

export function AdminEmptyState({
  ko,
  message,
  action,
}: {
  ko: boolean;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div data-admin-state="empty" className={`${BOX} border-sam-border bg-sam-surface text-sam-muted`}>
      <p>{message ?? (ko ? "표시할 항목이 없습니다." : "Nothing to show.")}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/** HTTP 403 / forbidden 계열 코드면 접근 거부, 그 외는 불러오기 실패. */
export function isAdminForbiddenCode(code: string | null | undefined, httpStatus?: number): boolean {
  if (httpStatus === 403) return true;
  const c = String(code ?? "");
  return c === "forbidden" || c === "forbidden_permission" || c === "super_admin_only";
}

export function AdminErrorState({
  ko,
  code,
  httpStatus,
  onRetry,
}: {
  ko: boolean;
  code: string | null | undefined;
  httpStatus?: number;
  onRetry?: () => void;
}) {
  if (isAdminForbiddenCode(code, httpStatus)) {
    return <AdminForbiddenState ko={ko} code={code} />;
  }
  return (
    <div data-admin-state="error" role="alert" className={`${BOX} border-red-200 bg-red-50 text-red-900`}>
      <p className="font-medium">{ko ? "불러오지 못했습니다." : "Could not load."}</p>
      <p className="mt-1 text-[13px]">{adminOperatorErrorMessage(code ?? "load_failed", ko)}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-ui-rect border border-red-300 bg-white px-3 py-1.5 text-[13px] font-medium text-red-900"
        >
          {ko ? "다시 불러오기" : "Reload"}
        </button>
      ) : null}
    </div>
  );
}

export function AdminForbiddenState({ ko, code }: { ko: boolean; code?: string | null }) {
  return (
    <div data-admin-state="forbidden" role="alert" className={`${BOX} border-amber-300 bg-amber-50 text-amber-950`}>
      <p className="font-medium">{ko ? "접근 권한이 없습니다." : "Access denied."}</p>
      <p className="mt-1 text-[13px]">{adminOperatorErrorMessage(code ?? "forbidden", ko)}</p>
    </div>
  );
}

/** 처리 결과 배너 — 성공/실패. 실패 문구는 오류 코드 맵을 거친다 (원시 코드 노출 금지). */
export function AdminResultBanner({
  ko,
  result,
  onClose,
}: {
  ko: boolean;
  result: { ok: true; message: string } | { ok: false; code: string } | null;
  onClose?: () => void;
}) {
  if (!result) return null;
  const ok = result.ok;
  return (
    <div
      data-admin-result={ok ? "success" : "error"}
      role={ok ? "status" : "alert"}
      className={[
        "flex items-start justify-between gap-3 rounded-ui-rect border px-3 py-2 text-[13px]",
        ok ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-red-300 bg-red-50 text-red-900",
      ].join(" ")}
    >
      <span>{ok ? result.message : adminOperatorErrorMessage(result.code, ko)}</span>
      {onClose ? (
        <button type="button" onClick={onClose} className="shrink-0 font-medium underline">
          {ko ? "닫기" : "Close"}
        </button>
      ) : null}
    </div>
  );
}

/** 기술 정보 (UUID·원시 값) — 기본 접힘. 운영 화면 1차 정보로 쓰지 않는다. */
export function AdminTechDetails({ ko, children }: { ko: boolean; children: ReactNode }) {
  return (
    <details data-admin-tech-details="1" className="mt-2 text-[12px] text-sam-muted">
      <summary className="cursor-pointer select-none">{ko ? "기술 정보" : "Technical details"}</summary>
      <div className="mt-1 break-all font-mono">{children}</div>
    </details>
  );
}
