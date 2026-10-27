"use client";

import { useCallback, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type Props = {
  sellerName: string;
  continueChat: boolean;
  disabled: boolean;
  busy: boolean;
  /** 비활성 사유 — 판매완료·예약중·타인예약·채팅 불가. 있으면 입력란 대신 사유 행을 보인다 (CTA-01) */
  blockTitle?: string;
  /** 입력한 문구를 넘긴다 — 방 생성 후 첫 메시지로 1회 전송 (CTA-02) */
  onSend: (text: string) => void | Promise<void>;
  onContinueChat: () => void | Promise<void>;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onPointerDown?: () => void;
};

/** 거래 상세 — FB 마켓플레이스형 인라인 메시지(카테고리 공통) */
export function TradeDetailInlineChatCard({
  sellerName: _sellerName,
  continueChat,
  disabled,
  busy,
  blockTitle,
  onSend,
  onContinueChat,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
}: Props) {
  void _sellerName;
  const { t, safeT } = useI18n();
  const [draft, setDraft] = useState(() =>
    safeT("trade_detail_inline_chat_default", {
      fallbackKo: "안녕하세요, 아직 판매 중인가요?",
      fallbackEn: "Hi, is this still available?",
    })
  );

  const label = safeT("trade_detail_inline_chat_label", {
    fallbackKo: "판매자에게 메시지 보내기",
    fallbackEn: "Send message to seller",
  });
  const sendLabel = safeT("trade_detail_inline_chat_send", {
    fallbackKo: "보내기",
    fallbackEn: "Send",
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (disabled || busy) return;
      void onSend(draft.trim());
    },
    [busy, disabled, draft, onSend]
  );

  const blockedReason = disabled && !busy ? blockTitle?.trim() ?? "" : "";

  return (
    <div className="min-w-0 overflow-hidden rounded-ui-rect border border-sam-border bg-sam-surface p-3">
      <p className="min-w-0 truncate text-[13px] font-semibold text-sam-fg">{label}</p>
      {blockedReason ? (
        /** CTA-01: 막힌 이유가 툴팁에만 있으면 폰에서 보이지 않는다 — 입력란 자리에 사유를 보인다 */
        <p
          role="status"
          data-trade-detail-chat-blocked="true"
          className="mt-2 rounded-ui-rect bg-sam-surface-muted px-3 py-2.5 text-[14px] font-medium text-sam-fg"
        >
          {blockedReason}
        </p>
      ) : continueChat ? (
        /** 이미 대화 중 — 문구를 보내지 않고 방으로 이동하므로 「보내기」 대신 결과대로 표기 (R3-5) */
        <button
          type="button"
          disabled={busy}
          onClick={() => void onContinueChat()}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          onPointerDown={onPointerDown}
          className="mt-2 flex h-11 w-full items-center justify-center rounded-ui-rect bg-sam-primary text-[15px] font-semibold text-sam-on-primary disabled:opacity-45"
        >
          {busy ? t("trade_detail_navigating") : t("trade_detail_chat_continue")}
        </button>
      ) : (
        <form className="mt-2 min-w-0" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="trade-detail-inline-chat-input">
            {label}
          </label>
          <div className="flex min-h-[44px] min-w-0 w-full items-center overflow-hidden rounded-ui-rect border border-sam-border bg-sam-app">
            <input
              id="trade-detail-inline-chat-input"
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={disabled || busy}
              placeholder={safeT("trade_detail_inline_chat_placeholder", {
                fallbackKo: "메시지를 입력하세요",
                fallbackEn: "Write a message",
              })}
              className="h-11 min-w-0 flex-1 border-0 bg-transparent px-3 text-[15px] text-sam-fg outline-none placeholder:text-sam-meta disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={disabled || busy}
              onPointerEnter={onPointerEnter}
              onPointerLeave={onPointerLeave}
              onPointerDown={onPointerDown}
              title={blockTitle}
              className="mr-1 flex h-9 shrink-0 items-center justify-center rounded-ui-rect bg-sam-primary px-3 text-[14px] font-semibold text-sam-on-primary disabled:opacity-45"
            >
              {busy ? t("trade_detail_navigating") : sendLabel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
