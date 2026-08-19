"use client";

import { useCallback, useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { TRADE_WRITE_FB_SECTION } from "@/lib/ui/trade-write-fb-ui";

type Props = {
  sellerName: string;
  continueChat: boolean;
  disabled: boolean;
  busy: boolean;
  blockTitle?: string;
  onSend: () => void | Promise<void>;
  onContinueChat: () => void | Promise<void>;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onPointerDown?: () => void;
};

/** 거래 상세 — FB 마켓플레이스형 인라인 메시지(카테고리 공통) */
export function TradeDetailInlineChatCard({
  sellerName,
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
  const { t, safeT, language } = useI18n();
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
  const continueLabel = t("trade_detail_chat_continue");

  const sellerLine = useMemo(() => {
    const name = sellerName.trim();
    if (!name) return label;
    if (language === "en") return `Message ${name}`;
    return `${name}님에게 메시지 보내기`;
  }, [label, language, sellerName]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (disabled || busy) return;
      if (continueChat) {
        void onContinueChat();
        return;
      }
      void onSend();
    },
    [busy, continueChat, disabled, onContinueChat, onSend]
  );

  return (
    <section data-ui5-slot="inline-chat" className={`${TRADE_WRITE_FB_SECTION} mt-3`}>
      <div className="rounded-ui-rect border border-sam-border bg-sam-surface p-3 shadow-sm">
        <p className="text-[13px] font-semibold text-sam-fg">{sellerLine}</p>
        <form className="mt-2 flex items-stretch gap-2" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="trade-detail-inline-chat-input">
            {label}
          </label>
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
            className="min-h-[44px] min-w-0 flex-1 rounded-ui-rect border border-sam-border bg-sam-app px-3 text-[15px] text-sam-fg outline-none placeholder:text-sam-meta focus:border-sam-primary disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={disabled || busy}
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            onPointerDown={onPointerDown}
            title={blockTitle}
            className="flex min-h-[44px] shrink-0 items-center justify-center rounded-ui-rect bg-sam-primary px-4 text-[15px] font-semibold text-sam-on-primary disabled:opacity-45"
          >
            {busy ? t("trade_detail_navigating") : continueChat ? continueLabel : sendLabel}
          </button>
        </form>
        {continueChat ? (
          <p className="mt-2 text-[12px] text-sam-meta">{t("trade_detail_inline_chat_existing_hint")}</p>
        ) : null}
      </div>
    </section>
  );
}
