"use client";

/**
 * Admin 화면 상태 4종 (R1 공통 기준 · 수정 계획 2-5) — 로딩 / 빈 데이터 / 불러오기 실패 / 접근 거부.
 * "데이터 없음"과 "불러오기 실패"를 같은 문구로 표시하지 않는다.
 * - 빈 데이터: 필터가 걸려 있으면 「조건에 맞는 항목이 없습니다」 + [초기화]
 * - 실패: 오류 맵 문구 + [새로고침] · 접근 거부: 필요 권한 안내
 */

import type { ReactNode } from "react";
import { AdminActionButton } from "@/components/admin/ui/AdminActionButton";
import { adminCta } from "@/lib/admin/ui-standard/admin-cta";
import {
  adminHttpStatusErrorMessage,
  adminOperatorErrorMessage,
  isAdminUnmappedError,
} from "@/lib/admin/operator-ux/operator-labels";

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
  onReset,
}: {
  ko: boolean;
  message?: string;
  action?: ReactNode;
  /** 필터가 걸린 목록 — 「조건에 맞는 항목이 없습니다」 + [초기화] */
  onReset?: () => void;
}) {
  const text =
    message ??
    (onReset
      ? ko
        ? "조건에 맞는 항목이 없습니다."
        : "No items match the filters."
      : ko
        ? "표시할 항목이 없습니다."
        : "Nothing to show.");
  return (
    <div data-admin-state="empty" className={`${BOX} border-sam-border bg-sam-surface text-sam-muted`}>
      <p>{text}</p>
      {onReset || action ? (
        <div className="mt-3 flex justify-center gap-2">
          {onReset ? (
            <AdminActionButton variant="secondary" size="sm" onClick={onReset}>
              {adminCta("reset", ko)}
            </AdminActionButton>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}

/** HTTP 403 / forbidden 계열 코드면 접근 거부, 그 외는 불러오기 실패. */
export function isAdminForbiddenCode(code: string | null | undefined, httpStatus?: number): boolean {
  if (httpStatus === 403) return true;
  const c = String(code ?? "");
  return c === "forbidden" || c === "forbidden_permission" || c === "super_admin_only";
}

/** 오류 맵 (수정 계획 2-5) — 아는 코드는 코드 문구, 모르는 코드·원문은 HTTP 상태 문구, 둘 다 없으면 불러오기 실패. */
export function adminErrorStateMessage(code: string | null | undefined, httpStatus: number | undefined, ko: boolean): string {
  const raw = String(code ?? "").trim();
  if (raw && !isAdminUnmappedError(raw)) return adminOperatorErrorMessage(raw, ko);
  if (httpStatus && httpStatus >= 400) return adminHttpStatusErrorMessage(httpStatus, ko);
  return adminOperatorErrorMessage(raw || "load_failed", ko);
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
    <div data-admin-state="error" role="alert" className={`${BOX} border-sam-danger bg-sam-danger-soft text-sam-fg`}>
      <p className="font-medium text-sam-danger">{ko ? "불러오지 못했습니다." : "Could not load."}</p>
      <p className="mt-1 text-[13px]">{adminErrorStateMessage(code, httpStatus, ko)}</p>
      {code || httpStatus ? (
        <AdminTechDetails ko={ko}>
          {httpStatus ? <div>HTTP {httpStatus}</div> : null}
          {code ? <div>{code}</div> : null}
        </AdminTechDetails>
      ) : null}
      {onRetry ? (
        <AdminActionButton variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
          {adminCta("refresh", ko)}
        </AdminActionButton>
      ) : null}
    </div>
  );
}

export function AdminForbiddenState({ ko, code }: { ko: boolean; code?: string | null }) {
  return (
    <div data-admin-state="forbidden" role="alert" className={`${BOX} border-sam-warning bg-sam-warning-soft text-sam-fg`}>
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
        ok ? "border-sam-success bg-sam-success-soft text-sam-fg" : "border-sam-danger bg-sam-danger-soft text-sam-fg",
      ].join(" ")}
    >
      <span>{ok ? result.message : adminOperatorErrorMessage(result.code, ko)}</span>
      {onClose ? (
        <AdminActionButton variant="quiet" size="sm" className="shrink-0" onClick={onClose}>
          {adminCta("close", ko)}
        </AdminActionButton>
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
