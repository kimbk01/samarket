"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { TradeChatEntryRingSpinner } from "@/components/chats/TradeChatEntryRingSpinner";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import {
  KASAMA_TRADE_CHAT_ENTRY_CREATING_OVERLAY,
  setTradeChatEntryCreatingOverlayVisible,
  type TradeChatEntryCreatingOverlayDetail,
  type TradeChatEntryCreatingOverlayPhase,
} from "@/lib/chats/trade-chat-entry-overlay-events";

const ROOM_PATH_CM = /^\/community-messenger\/rooms\/[^/]+/;
const ROOM_PATH_LEGACY = /^\/chats\/[^/]+/;

export function TradeChatEntryCreatingOverlay() {
  const { t } = useI18n();
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<TradeChatEntryCreatingOverlayPhase>("resolving");

  useEffect(() => {
    const onEvt = (e: Event) => {
      const ce = e as CustomEvent<TradeChatEntryCreatingOverlayDetail>;
      const d = ce.detail;
      const v = d?.visible === true;
      setVisible(v);
      setPhase(d?.phase === "entering" ? "entering" : "resolving");
    };
    window.addEventListener(KASAMA_TRADE_CHAT_ENTRY_CREATING_OVERLAY, onEvt);
    return () => window.removeEventListener(KASAMA_TRADE_CHAT_ENTRY_CREATING_OVERLAY, onEvt);
  }, []);

  /** 성공 시 `router.replace` 직후 상품 화면이 잠깐 비치지 않도록, 채팅방 라우트로 바뀔 때까지 오버레이 유지 */
  useEffect(() => {
    if (!visible || !pathname) return;
    if (ROOM_PATH_CM.test(pathname) || ROOM_PATH_LEGACY.test(pathname)) {
      setTradeChatEntryCreatingOverlayVisible(false);
    }
  }, [pathname, visible]);

  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => {
      setTradeChatEntryCreatingOverlayVisible(false);
    }, 30_000);
    return () => window.clearTimeout(t);
  }, [visible]);

  if (!visible) return null;

  const panelStyle = {
    paddingBottom: "max(1.5rem, var(--safe-bottom))",
    paddingTop: "max(1.5rem, var(--safe-top))",
  } as const;

  const title = phase === "entering" ? t("chats_overlay_entering_title") : t("chats_overlay_resolving_title");
  const subtitle =
    phase === "entering"
      ? t("chats_overlay_entering_subtitle")
      : t("chats_overlay_resolving_subtitle");

  return (
    <div
      className="fixed inset-0 z-[220] flex flex-col items-center justify-center bg-white/96 backdrop-blur-[2px]"
      style={panelStyle}
      role="status"
      aria-busy="true"
      aria-live="polite"
    >
      <TradeChatEntryRingSpinner />
      <p className="mt-5 sam-text-body font-medium text-sam-fg">{title}</p>
      <p className="mt-1.5 max-w-[16rem] text-center text-xs text-sam-muted">{subtitle}</p>
    </div>
  );
}
