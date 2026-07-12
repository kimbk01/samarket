"use client";

import { useMessengerSplitChrome } from "@/components/community-messenger/MessengerSplitChromeContext";
import { SectorHeaderBackButton } from "@/components/layout/sector-header";
import { MESSENGER_SPLIT_LIST_PANE_CLASS } from "@/lib/ui/messenger-split-pane-layout";

/**
 * 768px+ Telegram/Kakao형 — 좌측 목록 pane 너비에 뒤로·제목, 우측 끝에 검색·설정·종.
 */
export function MessengerSplitTopBar({ className = "" }: { className?: string }) {
  const ctx = useMessengerSplitChrome();
  if (!ctx) return null;
  const { titleText, showBack, backHref, headerActionsNode } = ctx.chrome;
  const title = titleText.trim();

  return (
    <header
      data-messenger-split-top-bar
      className={`sticky top-0 z-30 flex w-full min-w-0 shrink-0 border-b border-sam-border bg-[color:var(--messenger-bg,#fff)]/95 pt-[var(--safe-top)] backdrop-blur-[10px] ${className}`}
    >
      <div className="flex min-h-[length:var(--sector-header-h,52px)] w-full min-w-0 items-stretch">
        <div
          className={`flex min-w-0 shrink-0 items-center gap-0.5 border-sam-border pl-[max(0.5rem,var(--safe-left))] pr-2 min-[768px]:border-r ${MESSENGER_SPLIT_LIST_PANE_CLASS}`}
        >
          {showBack && backHref ? (
            <SectorHeaderBackButton backHref={backHref} preferHistoryBack={false} />
          ) : (
            <span className="inline-block h-10 w-10 shrink-0" aria-hidden />
          )}
          <h1 className="min-w-0 flex-1 truncate text-left text-[17px] font-bold leading-tight tracking-[-0.3px] text-sam-fg">
            {title}
          </h1>
        </div>
        <div className="min-w-0 flex-1" aria-hidden />
        <div className="flex shrink-0 items-center justify-end pr-[max(0.75rem,var(--safe-right))]">
          {headerActionsNode}
        </div>
      </div>
    </header>
  );
}
