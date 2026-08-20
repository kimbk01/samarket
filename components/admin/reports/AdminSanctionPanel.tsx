"use client";

import Link from "next/link";
import { useState } from "react";
import type { ReportActionType } from "@/lib/types/daangn";
import {
  applyReportActionDaangn,
  looksLikeProfileUserId,
  TRADE_REPORT_ACCOUNT_ACTIONS_MCC_ONLY,
  TRADE_REPORT_CONTENT_ACTIONS,
  TRADE_REPORT_LEDGER_ACTIONS,
} from "@/lib/admin-reports/applyReportActionDaangn";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { MessageKey } from "@/lib/i18n/messages";

const CONTENT_OPTIONS: { type: ReportActionType; labelKey: MessageKey }[] = [
  { type: "reject", labelKey: "admin_report_action_reject" },
  { type: "product_hide", labelKey: "admin_report_action_product_hide" },
];

const LEDGER_OPTIONS: { type: ReportActionType; labelKey: MessageKey }[] = [
  { type: "warn", labelKey: "admin_report_action_warn" },
  { type: "chat_ban", labelKey: "admin_report_action_chat_ban" },
];

interface AdminSanctionPanelProps {
  reportId: string;
  targetUserId: string;
  targetLabel?: string;
  /** Raw report target_type — chat rows must not run ledger/account CTAs. */
  targetType?: string;
  onActionSuccess?: () => void;
}

/**
 * Trade report resolve panel.
 * Content writer = applyReportActionDaangn.
 * Account enforce = MCC only (link).
 * warn/chat_ban = sanctions ledger only (non-enforcing).
 */
export function AdminSanctionPanel({
  reportId,
  targetUserId,
  targetLabel,
  targetType,
  onActionSuccess,
}: AdminSanctionPanelProps) {
  const { t, safeT } = useI18n();
  const [loading, setLoading] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const tt = (targetType ?? "").toLowerCase();
  const isChatTarget = tt === "chat" || tt === "chat_room" || tt === "chat_message";
  const mccUserId = looksLikeProfileUserId(targetUserId) ? targetUserId.trim() : "";

  const handleAction = async (actionType: ReportActionType) => {
    setError(null);
    if (TRADE_REPORT_ACCOUNT_ACTIONS_MCC_ONLY.has(actionType)) {
      setError(
        safeT("admin_report_action_mcc_only", {
          fallbackKo: "계정 제재는 MCC에서만 실행됩니다.",
          fallbackEn: "Account sanctions run only in MCC.",
        })
      );
      return;
    }
    if (TRADE_REPORT_LEDGER_ACTIONS.has(actionType) && isChatTarget) {
      setError(
        safeT("admin_report_action_chat_no_ledger", {
          fallbackKo: "채팅 신고에는 회원 원장 제재를 넣을 수 없습니다.",
          fallbackEn: "Chat reports cannot write member ledger sanctions.",
        })
      );
      return;
    }
    if (
      TRADE_REPORT_LEDGER_ACTIONS.has(actionType) &&
      !looksLikeProfileUserId(targetUserId) &&
      !TRADE_REPORT_CONTENT_ACTIONS.has(actionType)
    ) {
      // Still allow writer to resolve author from product/comment when targetUserId empty.
    }
    setLoading(actionType);
    const res = await applyReportActionDaangn(reportId, actionType, targetUserId, {
      actionNote: note.trim() || null,
    });
    setLoading(null);
    if (res.ok) {
      onActionSuccess?.();
    } else {
      setError(res.error);
    }
  };

  return (
    <div data-testid="admin-trade-report-sanction-panel" data-admin-domain="trade">
      <div
        className="mb-3 rounded-ui-rect border border-amber-200 bg-amber-50 px-3 py-2 sam-text-helper text-amber-950"
        data-testid="admin-report-authority-banner"
      >
        {safeT("admin_report_authority_banner", {
          fallbackKo:
            "콘텐츠 조치(기각/숨김)=Trade reports writer · 계정 정지·차단=MCC만 집행 · 경고/채팅제한=sanctions 원장(비집행).",
          fallbackEn:
            "Content (reject/hide)=Trade reports writer · Account suspend/ban=MCC only · Warn/chat_ban=sanctions ledger (non-enforcing).",
        })}
      </div>
      {error && <p className="mb-2 sam-text-body-secondary text-red-600">{error}</p>}
      {targetLabel && (
        <p className="mb-3 sam-text-body text-sam-muted">
          {t("admin_report_sanction_target_label")}: <strong>{targetLabel}</strong> (
          {mccUserId || targetUserId || "—"})
        </p>
      )}
      <div className="mb-3">
        <label className="block sam-text-helper font-medium text-sam-muted">
          {t("admin_report_sanction_note_label")}
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("admin_report_sanction_note_placeholder")}
          className="mt-1 w-full rounded border border-sam-border px-3 py-2 sam-text-body-secondary"
          rows={2}
        />
      </div>

      <p className="mb-1 sam-text-helper font-medium text-sam-fg">
        {safeT("admin_report_content_actions_label", {
          fallbackKo: "콘텐츠 조치",
          fallbackEn: "Content actions",
        })}
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {CONTENT_OPTIONS.map(({ type, labelKey }) => (
          <button
            key={type}
            type="button"
            disabled={loading !== null}
            onClick={() => void handleAction(type)}
            className="rounded border border-sam-border bg-sam-surface px-3 py-2 sam-text-body-secondary font-medium text-sam-fg hover:bg-sam-app disabled:opacity-50"
          >
            {loading === type ? t("admin_report_sanction_processing") : t(labelKey)}
          </button>
        ))}
      </div>

      <p className="mb-1 sam-text-helper font-medium text-sam-fg">
        {safeT("admin_report_ledger_actions_label", {
          fallbackKo: "원장 기록 (비집행)",
          fallbackEn: "Ledger notes (non-enforcing)",
        })}
      </p>
      <div className="mb-4 flex flex-wrap gap-2">
        {LEDGER_OPTIONS.map(({ type, labelKey }) => (
          <button
            key={type}
            type="button"
            disabled={loading !== null || isChatTarget}
            onClick={() => void handleAction(type)}
            title={
              isChatTarget
                ? safeT("admin_report_action_chat_no_ledger", {
                    fallbackKo: "채팅 신고에는 회원 원장 제재를 넣을 수 없습니다.",
                    fallbackEn: "Chat reports cannot write member ledger sanctions.",
                  })
                : undefined
            }
            className="rounded border border-amber-200 bg-amber-50 px-3 py-2 sam-text-body-secondary font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            {loading === type ? t("admin_report_sanction_processing") : t(labelKey)}
          </button>
        ))}
      </div>

      <p className="mb-1 sam-text-helper font-medium text-sam-fg">
        {safeT("admin_report_account_actions_label", {
          fallbackKo: "계정 제재 (MCC)",
          fallbackEn: "Account sanctions (MCC)",
        })}
      </p>
      <div className="flex flex-wrap gap-2">
        {mccUserId ? (
          <Link
            href={`/admin/users/${encodeURIComponent(mccUserId)}`}
            className="rounded border border-red-200 bg-red-50 px-3 py-2 sam-text-body-secondary font-medium text-red-700 hover:bg-red-100"
            data-testid="admin-report-mcc-sanction-link"
            prefetch={false}
          >
            {safeT("admin_report_open_mcc_sanction", {
              fallbackKo: "MCC에서 계정 제재 열기",
              fallbackEn: "Open account sanction in MCC",
            })}
          </Link>
        ) : (
          <p className="sam-text-body-secondary text-sam-muted">
            {safeT("admin_report_mcc_target_missing", {
              fallbackKo: "계정 제재용 회원 ID가 없습니다. 대상 회원/게시글을 확인하세요.",
              fallbackEn: "No member id for MCC sanction. Check the target user/listing.",
            })}
          </p>
        )}
      </div>
    </div>
  );
}
