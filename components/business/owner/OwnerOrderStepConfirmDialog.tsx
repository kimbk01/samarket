"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";
import {
  labelForOwnerTransitionFromModel,
  ownerTransitionConfirmQuestion,
} from "@/lib/stores/store-order-process-model";

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
  const { t, language } = useI18n();
  /** 질문·버튼 = 4단계 정본 (§3-2) — 버튼 이름은 사장님 카드 다음 버튼과 같다 */
  const title = ownerTransitionConfirmQuestion(nextStatus, fulfillment, t("store_owner_confirm_buyer_fallback"), language);
  const confirm = labelForOwnerTransitionFromModel(language, "", nextStatus, fulfillment);

  return (
    <DibayConfirmDialog
      open={open}
      title={title}
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
      confirmLabel={busy ? t("common_processing") : confirm}
      onCancel={() => {
        if (!busy) onCancel();
      }}
      onConfirm={onConfirm}
      confirmTone="primary"
      busy={busy}
    />
  );
}
