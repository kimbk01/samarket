"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import type { MessageKey } from "@/lib/i18n/messages";

/**
 * 다음 상태 → 확인 질문(제목)·단계 동사(확정 버튼) 키.
 * 분기는 `ownerOrderStepConfirmMessageI18n`(lib/stores/owner-order-ui-labels.ts)과 같다.
 */
export function ownerOrderStepConfirmCopyKeys(
  nextStatus: string,
  fulfillment: string
): { title: MessageKey; confirm: MessageKey } {
  const deliveryLike = fulfillment === "local_delivery" || fulfillment === "shipping";
  const keyMap: Record<string, { title: MessageKey; confirm: MessageKey }> = {
    accepted: { title: "popup_q_step_accept", confirm: "popup_btn_step_accept" },
    preparing: { title: "popup_q_step_preparing", confirm: "popup_btn_step_preparing" },
    ready_for_pickup: deliveryLike
      ? { title: "popup_q_step_packed", confirm: "popup_btn_step_packed" }
      : { title: "popup_q_step_pickup_ready", confirm: "popup_btn_step_pickup_ready" },
    delivering: { title: "popup_q_step_delivering", confirm: "popup_btn_step_delivering" },
    arrived: { title: "popup_q_step_arrived", confirm: "popup_btn_step_arrived" },
    completed: deliveryLike
      ? { title: "popup_q_step_delivered", confirm: "popup_btn_step_delivered" }
      : { title: "popup_q_step_picked_up", confirm: "popup_btn_step_picked_up" },
  };
  return keyMap[nextStatus] ?? { title: "popup_q_step_change", confirm: "popup_cta_change" };
}

/** 주문 카드·상세 스테퍼 — 단계 전환 확인 */
export function OwnerOrderStepConfirmDialog({
  open,
  busy,
  nextStatus,
  fulfillment,
  errorMessage,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  /** 확인 후 바뀔 주문 상태 (제목·버튼 문구만 결정 — 상태 계산은 호출처) */
  nextStatus: string;
  fulfillment: string;
  /** IA-23 — PATCH 실패 사유 (다이얼로그 내부 오류 띠) */
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const copy = ownerOrderStepConfirmCopyKeys(nextStatus, fulfillment);

  return (
    <DibayConfirmDialog
      open={open}
      title={t(copy.title)}
      description={
        errorMessage ? (
          <span
            role="alert"
            data-owner-step-confirm-error="1"
            className="mt-2 block rounded-[length:var(--overlay-radius-sm)] border border-[color:color-mix(in_srgb,var(--overlay-danger)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--overlay-danger)_8%,var(--overlay-surface))] px-3 py-2 text-[length:var(--overlay-body-2-size)] text-[color:var(--overlay-danger)]"
          >
            {errorMessage}
          </span>
        ) : undefined
      }
      cancelLabel={t("common_cancel")}
      confirmLabel={busy ? t("common_processing") : t(copy.confirm)}
      onCancel={() => {
        if (!busy) onCancel();
      }}
      onConfirm={onConfirm}
      confirmTone="primary"
      busy={busy}
    />
  );
}
