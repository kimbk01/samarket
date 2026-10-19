"use client";

/**
 * 채팅 Admin 조치 시트 공통 (설계 §5 S1~S6).
 *
 * 1단계 = 시트 입력(대상 요약·추가 입력·사유) → 2단계 = 같은 시트 안 확인(요약 + 사유, L3 는 대상 재입력) → 실행.
 * 실패 처리 (설계 §5 공통):
 * - 400 입력 오류 → 시트 유지·안내 · 403 → 권한 없음 표시(실행 숨김)
 * - 404 → 「대상 없음」 후 `onSettled("gone")` · 409 → 「다른 관리자가 먼저 처리」 후 `onSettled("stale")`
 * - 그 외 → 오류 안내 + 입력 유지(다시 실행 가능) · 성공 → `onSettled("done")`
 * 버튼: 하단 고정 `DibayOverlayButton` 취소(왼쪽)·실행(오른쪽) 균등폭 (설계 §4-2).
 */
import { useState, type ReactNode } from "react";
import { AdminFormSheet } from "@/components/admin/AdminFormSheet";
import { AdminForbiddenState, isAdminForbiddenCode } from "@/components/admin/ui/AdminStateViews";
import { DibayOverlayButton } from "@/components/ui/dibay-overlay";
import { OverlayUi } from "@/lib/ui/dibay-overlay-contract";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

export type AdminChatSheetResult = { ok: true } | { ok: false; status: number; code: string };
export type AdminChatSheetSettle = "done" | "stale" | "gone";
export type AdminChatSheetRow = { label: string; value: ReactNode };

export async function adminChatSheetFetch(input: RequestInfo, init?: RequestInit): Promise<AdminChatSheetResult> {
  try {
    const res = await fetch(input, init);
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (res.ok && json.ok !== false) return { ok: true };
    return { ok: false, status: res.status, code: json.error || `http_${res.status}` };
  } catch {
    return { ok: false, status: 0, code: "network_error" };
  }
}

const STALE_CODES = new Set(["stale_state", "conflict", "already_processed"]);

export function AdminChatActionSheet({
  title,
  subtitle,
  rows,
  notice,
  children,
  reason,
  retypeValue,
  ready = true,
  destructive = false,
  confirmLabel,
  onSubmit,
  onClose,
  onSettled,
}: {
  title: string;
  subtitle?: string;
  /** 대상 요약 (1·2단계 모두 표시) */
  rows: AdminChatSheetRow[];
  /** 사용자 앱 영향 등 안내 (1단계) */
  notice?: ReactNode;
  /** 추가 입력 (1단계) */
  children?: ReactNode;
  /** 사유 입력 — null 이면 사유 없음 (L1) */
  reason: { minLength: number; placeholder?: string } | null;
  /** L3: 2단계에서 다시 입력해야 하는 값 */
  retypeValue?: string;
  /** 추가 입력 충족 여부 */
  ready?: boolean;
  destructive?: boolean;
  confirmLabel: string;
  onSubmit: (reason: string) => Promise<AdminChatSheetResult>;
  onClose: () => void;
  onSettled: (kind: AdminChatSheetSettle) => void;
}) {
  const { t, language } = useI18n();
  const [step, setStep] = useState<1 | 2>(1);
  const [reasonText, setReasonText] = useState("");
  const [retype, setRetype] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ code: string; status: number } | null>(null);
  const [forbidden, setForbidden] = useState<string | null>(null);

  const trimmed = reasonText.trim();
  const reasonOk = reason === null || trimmed.length >= reason.minLength;
  const retypeOk = !retypeValue || retype.trim() === retypeValue;
  const canNext = ready && reasonOk && !pending;
  const canRun = canNext && retypeOk;

  const run = async () => {
    if (!canRun) return;
    setPending(true);
    setError(null);
    const result = await onSubmit(trimmed);
    setPending(false);
    if (result.ok) {
      onSettled("done");
      return;
    }
    if (isAdminForbiddenCode(result.code, result.status)) {
      setForbidden(result.code);
      return;
    }
    if (result.status === 409 || STALE_CODES.has(result.code)) {
      onSettled("stale");
      return;
    }
    if (result.status === 404) {
      onSettled("gone");
      return;
    }
    if (result.status === 400) setStep(1);
    setError(result);
  };

  const errorText = error
    ? error.status === 400
      ? t("admin_chat_sheet_err_input", { code: error.code })
      : t("admin_chat_sheet_err_failed", { code: error.code })
    : null;

  const summary = (
    <dl className="space-y-2 rounded-ui-rect border border-sam-border bg-sam-app p-3 sam-text-body">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[7rem_1fr] gap-2">
          <dt className="text-sam-muted">{row.label}</dt>
          <dd className="min-w-0 text-sam-fg [overflow-wrap:anywhere]">{row.value}</dd>
        </div>
      ))}
      {step === 2 && reason !== null ? (
        <div className="grid grid-cols-[7rem_1fr] gap-2">
          <dt className="text-sam-muted">{t("admin_chat_sheet_reason_label")}</dt>
          <dd className="min-w-0 whitespace-pre-wrap text-sam-fg [overflow-wrap:anywhere]">{trimmed}</dd>
        </div>
      ) : null}
    </dl>
  );

  const footer = forbidden ? (
    <div className={OverlayUi.actionsRow}>
      <DibayOverlayButton roleTone="secondary" onClick={onClose}>
        {t("admin_chat_sheet_close")}
      </DibayOverlayButton>
    </div>
  ) : step === 1 ? (
    <div className={OverlayUi.actionsRow}>
      <DibayOverlayButton roleTone="secondary" disabled={pending} onClick={onClose}>
        {t("admin_chat_sheet_cancel")}
      </DibayOverlayButton>
      <DibayOverlayButton
        roleTone={destructive ? "destructive" : "primary"}
        disabled={!canNext}
        onClick={() => {
          setError(null);
          setStep(2);
        }}
      >
        {t("admin_chat_sheet_next")}
      </DibayOverlayButton>
    </div>
  ) : (
    <div className={OverlayUi.actionsRow}>
      <DibayOverlayButton roleTone="secondary" disabled={pending} onClick={() => setStep(1)}>
        {t("admin_chat_sheet_back")}
      </DibayOverlayButton>
      <DibayOverlayButton
        roleTone={destructive ? "destructive" : "primary"}
        disabled={!canRun}
        loading={pending}
        onClick={() => void run()}
      >
        {pending ? t("admin_chat_sheet_processing") : confirmLabel}
      </DibayOverlayButton>
    </div>
  );

  return (
    <AdminFormSheet
      title={step === 2 ? t("admin_chat_sheet_confirm_title") : title}
      subtitle={step === 2 ? title : subtitle}
      onClose={pending ? () => undefined : onClose}
      dismissible={!pending}
      footer={footer}
    >
      <div className="space-y-3" data-admin-chat-sheet-step={step}>
        {forbidden ? <AdminForbiddenState ko={language !== "en"} code={forbidden} /> : null}
        {summary}
        {step === 1 && !forbidden ? (
          <>
            {notice ? (
              <div className="rounded-ui-rect border border-amber-300 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950">
                {notice}
              </div>
            ) : null}
            {children}
            {reason !== null ? (
              <label className="block">
                <span className="sam-text-helper font-medium text-sam-fg">{t("admin_chat_sheet_reason_label")}</span>
                <textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder={reason.placeholder}
                  className={`mt-1 w-full ${OverlayUi.input}`}
                />
                <span className={`mt-1 block sam-text-xxs ${reasonOk ? "text-sam-muted" : "text-red-700"}`}>
                  {t("admin_chat_sheet_reason_min", { min: reason.minLength, count: trimmed.length })}
                </span>
              </label>
            ) : null}
          </>
        ) : null}
        {step === 2 && retypeValue && !forbidden ? (
          <label className="block">
            <span className="sam-text-helper font-medium text-red-800">
              {t("admin_chat_sheet_retype_label", { value: retypeValue })}
            </span>
            <input
              value={retype}
              onChange={(e) => setRetype(e.target.value)}
              autoComplete="off"
              className={`mt-1 w-full ${OverlayUi.input}`}
            />
          </label>
        ) : null}
        {errorText ? (
          <p role="alert" className="rounded-ui-rect border border-red-300 bg-red-50 px-3 py-2 sam-text-helper text-red-900">
            {errorText}
          </p>
        ) : null}
      </div>
    </AdminFormSheet>
  );
}
