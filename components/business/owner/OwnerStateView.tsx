"use client";

import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 4-0 (RC-11) — 오너 화면 공통 상태 화면.
 * loading(스켈레톤) · empty(다음 행동 CTA 1개) · error(재시도) ·
 * no_permission · suspended · under_review · revision_requested
 * (뒤 4종은 1-B 게이트 결과의 사유·허용 화면 링크를 표시).
 */

export type OwnerStateViewKind =
  | "loading"
  | "empty"
  | "error"
  | "no_permission"
  | "suspended"
  | "under_review"
  | "revision_requested";

export type OwnerStateViewLink = { label: string; href: string };

const DEFAULT_TITLE_KEY: Record<Exclude<OwnerStateViewKind, "loading">, MessageKey> = {
  empty: "owner_s4_state_empty_title",
  error: "owner_s4_state_error_title",
  no_permission: "owner_s4_state_no_permission_title",
  suspended: "owner_s4_state_suspended_title",
  under_review: "owner_s4_state_under_review_title",
  revision_requested: "owner_s4_state_revision_requested_title",
};

export function OwnerStateView({
  kind,
  title,
  message,
  reason,
  action,
  onRetry,
  className = "",
}: {
  kind: OwnerStateViewKind;
  /** 기본 제목 대체 */
  title?: string | null;
  /** 보조 설명 (error: 오류 문구) */
  message?: string | null;
  /** 게이트 4종 — 사유 */
  reason?: string | null;
  /** empty: 다음 행동 CTA 1개 · 게이트 4종: 허용 화면 링크 */
  action?: OwnerStateViewLink | null;
  /** error: 재시도 */
  onRetry?: (() => void) | null;
  className?: string;
}) {
  const { t } = useI18n();

  if (kind === "loading") {
    return (
      <div
        data-owner-state-view="loading"
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={`space-y-2 rounded-ui-rect border border-sam-border bg-sam-surface p-4 ${className}`}
      >
        <span className="sr-only">{t("owner_s4_state_loading")}</span>
        <div className="h-4 w-1/2 animate-pulse rounded-ui-rect bg-sam-surface-muted" aria-hidden />
        <div className="h-4 w-5/6 animate-pulse rounded-ui-rect bg-sam-surface-muted" aria-hidden />
        <div className="h-4 w-2/3 animate-pulse rounded-ui-rect bg-sam-surface-muted" aria-hidden />
      </div>
    );
  }

  const heading = title?.trim() || t(DEFAULT_TITLE_KEY[kind]);
  const isError = kind === "error";

  return (
    <div
      data-owner-state-view={kind}
      role={isError ? "alert" : undefined}
      className={`rounded-ui-rect border border-sam-border bg-sam-surface p-4 text-center ${className}`}
    >
      <p className={`sam-text-body font-semibold ${isError ? "text-sam-danger" : "text-sam-fg"}`}>{heading}</p>
      {message?.trim() ? (
        <p className="mt-1 sam-text-body-secondary text-sam-muted">{message.trim()}</p>
      ) : null}
      {reason?.trim() ? (
        <p className="mt-1 sam-text-body-secondary text-sam-muted">
          {t("owner_s4_state_reason", { reason: reason.trim() })}
        </p>
      ) : null}
      {isError && onRetry ? (
        <button
          type="button"
          onClick={() => onRetry()}
          className="mt-3 inline-flex min-h-10 items-center rounded-ui-rect border border-sam-border bg-sam-surface px-4 sam-text-body-secondary font-semibold text-sam-fg"
        >
          {t("owner_s4_state_retry")}
        </button>
      ) : null}
      {!isError && action ? (
        <Link
          href={action.href}
          className="mt-3 inline-flex min-h-10 items-center rounded-ui-rect bg-sam-primary px-4 sam-text-body-secondary font-semibold text-sam-on-primary no-underline"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
