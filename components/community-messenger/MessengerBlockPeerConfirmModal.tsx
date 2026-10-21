"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayConfirmDialog } from "@/components/ui/dibay-overlay";

type Props = {
  open: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  /** 수신 통화 배너 등 상위 레이어 위에 띄울 때만 지정 (기본 = 다이얼로그 레이어) */
  zIndexClass?: string;
};

/** F-7 — 메신저 차단 확인창 단일 컴포넌트 (프로필·방 메뉴·방 안·수신 배너·친구 목록 공통) */
export function MessengerBlockPeerConfirmModal({ open, busy = false, onCancel, onConfirm, zIndexClass }: Props) {
  const { t } = useI18n();

  return (
    <DibayConfirmDialog
      open={open}
      title={t("cm_social_block_confirm_title")}
      description={t("cm_social_block_confirm_body")}
      cancelLabel={t("cm_social_dismiss")}
      confirmLabel={t("cm_social_block")}
      onCancel={onCancel}
      onConfirm={onConfirm}
      confirmTone="destructive"
      busy={busy}
      zIndexClass={zIndexClass}
    />
  );
}
