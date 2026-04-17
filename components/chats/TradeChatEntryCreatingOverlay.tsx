"use client";

import { useEffect, useState } from "react";
import { TradeChatEntryRingSpinner } from "@/components/chats/TradeChatEntryRingSpinner";
import {
  KASAMA_TRADE_CHAT_ENTRY_CREATING_OVERLAY,
  type TradeChatEntryCreatingOverlayDetail,
} from "@/lib/chats/trade-chat-entry-overlay-events";

export function TradeChatEntryCreatingOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onEvt = (e: Event) => {
      const ce = e as CustomEvent<TradeChatEntryCreatingOverlayDetail>;
      setVisible(ce.detail?.visible === true);
    };
    window.addEventListener(KASAMA_TRADE_CHAT_ENTRY_CREATING_OVERLAY, onEvt);
    return () => window.removeEventListener(KASAMA_TRADE_CHAT_ENTRY_CREATING_OVERLAY, onEvt);
  }, []);

  if (!visible) return null;

  const panelStyle = {
    paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))",
    paddingTop: "max(1.5rem, env(safe-area-inset-top))",
  } as const;

  return (
    <div
      className="fixed inset-0 z-[220] flex flex-col items-center justify-center bg-white/96 backdrop-blur-[2px]"
      style={panelStyle}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <TradeChatEntryRingSpinner />
      <p className="mt-5 text-[15px] font-medium text-sam-fg">거래 채팅 방 생성중</p>
      <p className="mt-1.5 max-w-[16rem] text-center text-xs text-sam-muted">연결되는 동안 잠시만 기다려 주세요.</p>
    </div>
  );
}
