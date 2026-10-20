"use client";

import { useEffect, useRef } from "react";
import { confirmAdminAction } from "@/lib/admin/operator-ux/admin-confirm-action";
import { adminActionLevel, type AdminActionKind } from "@/lib/admin/operator-ux/admin-action-levels";
import {
  campaignConfirmCopy,
  campaignConfirmFactLines,
  type CampaignConfirmAction,
  type CampaignConfirmFacts,
} from "@/lib/admin/notification-campaigns/campaign-action-confirm-copy";
import {
  campaignSendConfirmMatchLabel,
  campaignSendConfirmMatchText,
} from "@/lib/admin/notification-campaigns/campaign-send-typed-confirm";

/**
 * 캠페인 동작 → 동작 표 종류 (재설계 R2 · `admin-action-levels.ts`).
 * 즉시 발송·재발송 = bulk(L3, 수신 대상 수 재입력) · 예약·수정 저장·복제·보관 해제 = save(L1) ·
 * 일시정지 = hold(L1) · 재개 = resume(L1) · 예약 취소·회차 취소·발송 중지·반복 중지·보관 = disable(L1).
 */
const CAMPAIGN_ACTION_KIND: Record<CampaignConfirmAction, AdminActionKind> = {
  send: "bulk",
  resend: "bulk",
  schedule: "save",
  save_edit: "save",
  duplicate: "save",
  unarchive: "save",
  pause: "hold",
  resume: "resume",
  cancel: "disable",
  cancel_occurrence: "disable",
  stop_sending: "disable",
  stop_recurring: "disable",
  archive: "disable",
};

/**
 * Campaign mutation confirm — every send/schedule/cancel/stop/resend/archive re-shows
 * 대상 수 · 채널 · 시각 before running. 확인 경로는 `confirmAdminAction` 하나 (R2):
 * 열릴 때(action·facts 가 채워질 때) 한 번 묻고, 확인하면 `onConfirm(reason)` — L3 사유는 호출부가 API 로 보낸다.
 */
export function CampaignActionConfirmDialog({
  action,
  facts,
  lang,
  onCancel,
  onConfirm,
}: {
  action: CampaignConfirmAction | null;
  facts: CampaignConfirmFacts | null;
  lang: "ko" | "en";
  /** 예전 대상자 확인창의 진행 표시 — 확인 엔진은 확인 즉시 닫히므로 쓰지 않는다 (호출부 호환용). */
  pending?: boolean;
  /** 확인 엔진이 「취소」 문구를 정한다 (호출부 호환용). */
  cancelLabel?: string;
  onCancel: () => void;
  onConfirm: (reason: string | null) => void;
}) {
  const open = action != null && facts != null;
  const askedRef = useRef(false);
  const handlersRef = useRef({ onCancel, onConfirm });
  useEffect(() => {
    handlersRef.current = { onCancel, onConfirm };
  }, [onCancel, onConfirm]);

  useEffect(() => {
    if (!open) {
      askedRef.current = false;
      return;
    }
    if (askedRef.current || !action || !facts) return;
    askedRef.current = true;
    const ko = lang !== "en";
    const copy = campaignConfirmCopy(action, lang);
    const matchText = campaignSendConfirmMatchText(action, facts, lang);
    const matchLabel = campaignSendConfirmMatchLabel(matchText, facts, lang);
    void (async () => {
      const confirmed = await confirmAdminAction({
        level: adminActionLevel(CAMPAIGN_ACTION_KIND[action]),
        ko,
        title: copy.title,
        description: [copy.description, ...campaignConfirmFactLines(facts, lang), matchLabel]
          .filter(Boolean)
          .join("\n"),
        confirmLabel: copy.confirmLabel,
        destructive: copy.tone === "danger",
        retypeValue: matchText,
      });
      if (confirmed.ok) handlersRef.current.onConfirm(confirmed.reason);
      else handlersRef.current.onCancel();
    })();
  }, [open, action, facts, lang]);

  return null;
}
