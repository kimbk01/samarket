"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { useWriteCategory } from "@/contexts/WriteCategoryContext";
import { useTradeWriteSheet } from "@/contexts/TradeWriteSheetContext";
import { useInlineWriteSheetNavigationGuard } from "@/lib/navigation/use-inline-write-sheet-navigation-guard";
import { TRADE_CHAT_SURFACE } from "@/lib/chats/surfaces/trade-chat-surface";
import { useTradeHeaderTradeHistoryStack } from "@/contexts/TradeHeaderTradeHistoryStackContext";
import { prefetchTradeHubHistorySnapshots } from "@/lib/mypage/trade-history-client";

/**
 * 거래 1단 헤더 `+` — 글쓰기(시트)·거래 채팅·거래 내역 드롭다운.
 * 글쓰기는 `PhilifeHeaderComposeButton` 과 같은 **둥근 사각 +** 트리거 스타일.
 */
export function TradeHeaderComposeButton() {
  const { t } = useI18n();
  const { open: openTradeWriteSheet } = useTradeWriteSheet();
  const { guardBeforeNavigate } = useInlineWriteSheetNavigationGuard();
  const tradeHistoryStack = useTradeHeaderTradeHistoryStack();
  const writeCtx = useWriteCategory();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [domReady, setDomReady] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setDomReady(true);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    prefetchTradeHubHistorySnapshots();
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const updateMenuPos = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    updateMenuPos();
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const clickedTriggerArea = menuRef.current?.contains(target) ?? false;
      const clickedMenuPanel = menuPanelRef.current?.contains(target) ?? false;
      if (!clickedTriggerArea && !clickedMenuPanel) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", updateMenuPos);
    window.addEventListener("scroll", updateMenuPos, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", updateMenuPos);
      window.removeEventListener("scroll", updateMenuPos, true);
    };
  }, [menuOpen]);

  const openWrite = () => {
    writeCtx?.ensureLauncherCategoriesLoaded();
    if (!guardBeforeNavigate()) return;
    setMenuOpen(false);
    openTradeWriteSheet("");
  };

  const openTradeHistoryStack = () => {
    if (!guardBeforeNavigate()) return;
    setMenuOpen(false);
    tradeHistoryStack.open();
  };

  return (
    <>
      <div ref={menuRef} className="relative flex w-10 shrink-0 items-center justify-end">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-ui-rect bg-sam-surface text-sam-fg transition active:scale-[0.98] active:opacity-90"
          aria-label={t("nav_write_aria")}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >
          <PlusInSquareIcon />
        </button>
      </div>
      {menuOpen && domReady && menuPos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuPanelRef}
              className="fixed z-[120] w-[11.5rem] overflow-hidden rounded-sam-lg border border-sam-border bg-sam-surface shadow-[0_14px_30px_rgba(0,0,0,0.18)]"
              style={{ top: menuPos.top, right: menuPos.right }}
            >
              <ActionRow icon={<WriteIcon className="h-5 w-5" />} label={t("common_write")} onClick={openWrite} />
              <Link
                href={TRADE_CHAT_SURFACE.messengerListHref}
                className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left sam-text-body font-medium text-sam-fg hover:bg-sam-surface-muted"
                onClick={(e) => {
                  if (!guardBeforeNavigate()) {
                    e.preventDefault();
                    return;
                  }
                  setMenuOpen(false);
                }}
              >
                <span className="text-sam-fg">
                  <ChatIcon className="h-5 w-5" />
                </span>
                <span>{t("nav_trade_chat")}</span>
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={openTradeHistoryStack}
                className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left sam-text-body font-medium text-sam-fg hover:bg-sam-surface-muted"
              >
                <span className="text-sam-fg">
                  <HistoryIcon className="h-5 w-5" />
                </span>
                <span>{t("nav_trade_history")}</span>
              </button>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left sam-text-body font-medium text-sam-fg hover:bg-sam-surface-muted"
    >
      <span className="text-sam-fg">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function PlusInSquareIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="4" ry="4" strokeWidth={2} />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function WriteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M16.5 3.5a2.121 2.121 0 113 3L12 14l-4 1 1-4 7.5-7.5z"
      />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

function HistoryIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 8v4l3 2m6-2a9 9 0 11-2.64-6.36M12 3a9 9 0 019 9"
      />
    </svg>
  );
}
