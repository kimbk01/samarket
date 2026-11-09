"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";
import {
  resolveStoreApplicationStep,
  resolveStoreApplicationStepTimes,
  type StoreApplicationEventRow,
  type StoreApplicationPhase,
  type StoreApplicationStepKey,
  type StoreApplicationStepState,
} from "@/lib/stores/store-application-step";
import { formatManilaDateTimeShort } from "@/lib/stores/store-application-time";
import { FORM_INTERACTIVE_PRESS_CLASS } from "@/lib/ui/form-keyboard-viewport-contract";

const STEP_LABEL: Record<StoreApplicationStepKey, MessageKey> = {
  submit: "store_apply_step_submit",
  received: "store_apply_step_received",
  review: "store_apply_step_review",
  approved: "store_apply_step_approved",
  sales: "store_apply_step_sales",
  live: "store_apply_step_live",
};

const PHASE_TITLE: Record<StoreApplicationPhase, MessageKey> = {
  received: "store_apply_phase_received_title",
  under_review: "store_apply_phase_review_title",
  revision_requested: "store_apply_phase_revision_title",
  rejected: "store_apply_phase_rejected_title",
  approved_wait_sales: "store_apply_phase_approved_title",
  sales_wait_visible: "store_apply_phase_sales_title",
  live: "store_apply_phase_live_title",
  suspended: "store_apply_phase_suspended_title",
};

const PHASE_DESC: Record<StoreApplicationPhase, MessageKey> = {
  received: "store_apply_phase_received_desc",
  under_review: "store_apply_phase_review_desc",
  revision_requested: "store_apply_phase_revision_desc",
  rejected: "store_apply_phase_rejected_desc",
  approved_wait_sales: "store_apply_phase_approved_desc",
  sales_wait_visible: "store_apply_phase_sales_desc",
  live: "store_apply_phase_live_desc",
  suspended: "store_apply_phase_suspended_desc",
};

function barClass(state: StoreApplicationStepState): string {
  switch (state) {
    case "done":
      return "bg-sam-primary";
    case "current":
      return "bg-sam-primary/45";
    case "warn":
      return "bg-sam-warning";
    case "bad":
      return "bg-sam-danger";
    default:
      return "bg-sam-border";
  }
}

function labelClass(state: StoreApplicationStepState): string {
  switch (state) {
    case "done":
      return "text-sam-primary";
    case "current":
      return "font-bold text-sam-fg";
    case "warn":
      return "font-bold text-sam-warning";
    case "bad":
      return "font-bold text-sam-danger";
    default:
      return "text-sam-muted";
  }
}

/** 진행 막대만 (신청 화면 맨 위 · 「신청」 단계가 현재) */
export function StoreApplicationProgressBar({
  steps,
}: {
  steps: { key: StoreApplicationStepKey; state: StoreApplicationStepState }[];
}) {
  const { t } = useI18n();
  return (
    <ol className="grid grid-cols-6 gap-1" aria-label={t("store_apply_progress_aria")} data-testid="store-application-progress">
      {steps.map((s) => (
        <li
          key={s.key}
          className="min-w-0 text-center"
          aria-current={s.state === "current" || s.state === "warn" || s.state === "bad" ? "step" : undefined}
          data-step={s.key}
          data-state={s.state}
        >
          <span className={`mb-1.5 block h-1.5 rounded-full ${barClass(s.state)}`} aria-hidden />
          <span className={`block break-keep text-[11px] leading-tight ${labelClass(s.state)}`}>
            {s.key === "review" && s.state === "warn"
              ? t("store_apply_step_revision")
              : s.key === "review" && s.state === "bad"
                ? t("store_apply_step_rejected")
                : s.key === "live" && s.state === "bad"
                  ? t("store_apply_step_suspended")
                  : t(STEP_LABEL[s.key])}
          </span>
        </li>
      ))}
    </ol>
  );
}

export type StoreApplicationProgressRow = {
  id: string;
  approval_status: string;
  is_visible?: boolean | null;
  sales_permission?: { sales_status?: string | null } | null;
  rejected_reason?: string | null;
  revision_note?: string | null;
};

type AppResp = {
  ok?: boolean;
  store?: { created_at?: string; approved_at?: string | null; first_listed_at?: string | null; suspended_reason?: string | null };
  sales?: { sales_status?: string | null; approved_at?: string | null } | null;
  events?: StoreApplicationEventRow[];
};

/**
 * 운영 홈 진행 카드 — 막대 + 현재 단계 제목·설명·사유·시각 + 주 버튼 1개 (Owner 2026-11-10).
 * 상태는 매장 행에서(즉시), 단계 시각은 `/api/me/stores/[id]/application` 에서(뒤늦게) 채운다.
 */
export function StoreApplicationProgressCard({
  row,
  action,
}: {
  row: StoreApplicationProgressRow;
  /** 현재 단계 주 버튼 (없으면 버튼 없음) */
  action?: { href: string; label: string } | null;
}) {
  const { t, language } = useI18n();
  const [resp, setResp] = useState<AppResp | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/me/stores/${encodeURIComponent(row.id)}/application`, { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j: AppResp) => {
        if (!cancelled && j?.ok) setResp(j);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [row.id, row.approval_status]);

  const salesStatus = resp?.sales?.sales_status ?? row.sales_permission?.sales_status ?? null;
  const view = resolveStoreApplicationStep({
    approval_status: row.approval_status,
    sales_status: salesStatus,
    is_visible: row.is_visible ?? null,
  });
  const times = resolveStoreApplicationStepTimes({
    created_at: resp?.store?.created_at ?? null,
    approved_at: resp?.store?.approved_at ?? null,
    sales_approved_at: resp?.sales?.approved_at ?? null,
    first_listed_at: resp?.store?.first_listed_at ?? null,
    events: resp?.events ?? [],
  });
  const currentStep = view.steps.find((s) => s.state === "current" || s.state === "warn" || s.state === "bad");
  const currentTime = currentStep ? times[currentStep.key] : undefined;
  const reason =
    view.phase === "rejected"
      ? (row.rejected_reason ?? "").trim()
      : view.phase === "revision_requested"
        ? (row.revision_note ?? "").trim()
        : view.phase === "suspended"
          ? (resp?.store?.suspended_reason ?? "").trim()
          : "";
  const tone =
    view.phase === "revision_requested"
      ? "border-sam-warning/40 bg-sam-warning-soft"
      : view.phase === "rejected" || view.phase === "suspended"
        ? "border-sam-danger/30 bg-sam-danger-soft"
        : "";

  let reasonBlock: ReactNode = null;
  if (reason) {
    reasonBlock = (
      <div className={`mt-2 whitespace-pre-wrap rounded-ui-rect border px-3 py-2 text-[14px] text-sam-fg ${tone}`}>
        <span className="font-semibold">{t("store_apply_reason_label")}</span> {reason}
      </div>
    );
  }

  return (
    <section
      className="rounded-ui-rect border border-sam-border bg-sam-surface p-4 shadow-sm"
      data-testid="store-application-progress-card"
      data-phase={view.phase}
    >
      <StoreApplicationProgressBar steps={view.steps} />
      <h2 className="mt-4 text-[16px] font-bold text-sam-fg">{t(PHASE_TITLE[view.phase])}</h2>
      <p className="mt-1 text-[14px] leading-[1.5] text-sam-muted">{t(PHASE_DESC[view.phase])}</p>
      {currentTime ? (
        <p className="mt-1 text-[12px] tabular-nums text-sam-muted">
          {formatManilaDateTimeShort(currentTime, language)} PHT
        </p>
      ) : null}
      {reasonBlock}
      {action ? (
        <Link
          href={action.href}
          className={`mt-4 flex min-h-[48px] w-full items-center justify-center rounded-ui-rect bg-sam-primary px-4 text-[16px] font-bold text-sam-on-primary ${FORM_INTERACTIVE_PRESS_CLASS}`}
        >
          {action.label}
        </Link>
      ) : null}
    </section>
  );
}
