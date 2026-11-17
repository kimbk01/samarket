"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { DibayBottomSheet } from "@/components/ui/dibay-overlay";

type Props = {
  /** 거래 = 「이 채팅방에서 나갈까요?」 그대로 · 주문 = 「채팅방을 나갈까요?」 (시안 10-3) */
  title: string;
  /** 주문 = `cm_ui_leave_confirm_delivery` · 거래 = 없음(기존 확인 문구 그대로) */
  description?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * 거래·주문 채팅 목록 「나가기」 확인 — 채팅 시안 4판 「10-3」 (아래에서 올라오는 시트).
 * 제목 18/700 · 설명 15 회색 · 버튼 2개 나란히(높이 50 · 모서리 12): 「취소」 회색 채움 · 「나가기」 빨강 채움 흰 16/700.
 * 앱 공용 `MobileConfirmBottomSheet`(31개 화면이 쓰는 가운데 확인창)는 바꾸지 않고 메신저 거래·주문 목록 전용으로 둔다.
 * 버튼으로만 닫는다(기존 `interactionMode="blocking"` 과 같은 동작).
 */
export function MessengerPillarLeaveConfirmSheet({ title, description, busy = false, onCancel, onConfirm }: Props) {
  const { t } = useI18n();
  return (
    <DibayBottomSheet
      open
      onClose={onCancel}
      dismissible={false}
      zIndexClass="z-[70]"
      ariaLabel={t("cm_ui_leave_confirm_aria")}
    >
      <div data-cm-pillar-sheet="leave-confirm" data-cm-pillar-leave-confirm="">
        <h2 className="m-0 pb-2 pt-1 text-[18px] font-bold leading-[1.35]" style={{ color: "var(--cm-chat-fg)" }}>
          {title}
        </h2>
        {description ? (
          <p className="m-0 mb-[18px] text-[15px] leading-[1.5]" style={{ color: "var(--cm-chat-sub)" }}>
            {description}
          </p>
        ) : (
          <div className="h-2.5" aria-hidden />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            className="h-[50px] flex-1 rounded-[12px] text-[16px] font-semibold"
            style={{ background: "var(--cm-chat-band)", color: "var(--cm-chat-fg)" }}
            onClick={onCancel}
            data-cm-pillar-leave-cancel=""
          >
            {t("common_cancel")}
          </button>
          <button
            type="button"
            className="h-[50px] flex-1 rounded-[12px] text-[16px] font-bold text-white disabled:opacity-60"
            style={{ background: "var(--cm-chat-danger)" }}
            disabled={busy}
            onClick={onConfirm}
            data-cm-pillar-leave-confirm-button=""
          >
            {t("popup_cta_leave")}
          </button>
        </div>
      </div>
    </DibayBottomSheet>
  );
}
