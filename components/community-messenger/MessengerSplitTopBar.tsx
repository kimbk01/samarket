"use client";

import { usePathname } from "next/navigation";
import { useMessengerSplitChrome } from "@/components/community-messenger/MessengerSplitChromeContext";
import { SectorHeaderBackButton } from "@/components/layout/sector-header";
import { MESSENGER_SPLIT_LIST_PANE_CLASS } from "@/lib/ui/messenger-split-pane-layout";
import { getDibayDomainChromeElementProps } from "@/lib/ui/dibay-domain-chrome";
import { parseCommunityMessengerRoomIdFromPathname } from "@/lib/community-messenger/messenger-room-pathname";

/**
 * 768px+ Telegram/Kakao형 — 좌측 목록 pane 너비에 뒤로·제목.
 *
 * Room route ownership (DOM, not CSS hide):
 * - List column: this bar overlays list pane only (`list-column-only`)
 * - Room pane: `CommunityMessengerRoomPhase2Header` is the sole room header (safe-top owned there)
 * - Trailing home search/settings cluster is not painted over the room pane
 */
export function MessengerSplitTopBar({ className = "" }: { className?: string }) {
  const ctx = useMessengerSplitChrome();
  const pathname = usePathname();
  const domainChrome = getDibayDomainChromeElementProps(pathname);
  const roomId = parseCommunityMessengerRoomIdFromPathname(pathname);
  const roomPaneActive = Boolean(roomId);
  if (!ctx) return null;
  const { titleText, showBack, backHref, headerActionsNode } = ctx.chrome;
  const title = titleText.trim();

  if (roomPaneActive) {
    return (
      <header
        data-messenger-split-top-bar
        data-messenger-split-top-bar-mode="list-column-only"
        data-dibay-domain={domainChrome["data-dibay-domain"]}
        style={domainChrome.style}
        className={`pointer-events-none relative z-30 h-0 w-full shrink-0 ${className}`}
      >
        <div
          className={`pointer-events-auto absolute left-0 top-0 z-30 flex min-h-[calc(var(--sector-header-h,52px)+var(--safe-top))] min-w-0 shrink-0 items-end gap-0.5 border-b border-r border-[color:var(--dibay-domain-divider,var(--sam-border))] bg-[color:var(--dibay-domain-surface,var(--messenger-bg,#fff))]/95 pb-0 pl-[max(0.5rem,var(--safe-left))] pr-2 pt-[var(--safe-top)] backdrop-blur-[10px] ${MESSENGER_SPLIT_LIST_PANE_CLASS}`}
        >
          <div className="flex min-h-[length:var(--sector-header-h,52px)] w-full min-w-0 items-center gap-0.5">
            {showBack && backHref ? (
              <SectorHeaderBackButton backHref={backHref} preferHistoryBack={false} />
            ) : (
              <span className="inline-block h-10 w-10 shrink-0" aria-hidden />
            )}
            <h1 className="min-w-0 flex-1 truncate text-left text-[17px] font-bold leading-tight tracking-[-0.3px] text-[color:var(--sector-header-title-color,#243832)]">
              {title}
            </h1>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header
      data-messenger-split-top-bar
      data-messenger-split-top-bar-mode="full"
      data-dibay-domain={domainChrome["data-dibay-domain"]}
      style={domainChrome.style}
      className={`sticky top-0 z-30 flex w-full min-w-0 shrink-0 border-b border-[color:var(--dibay-domain-divider,var(--sam-border))] bg-[color:var(--dibay-domain-surface,var(--messenger-bg,#fff))]/95 pt-[var(--safe-top)] backdrop-blur-[10px] ${className}`}
    >
      <div className="flex min-h-[length:var(--sector-header-h,52px)] w-full min-w-0 items-stretch">
        <div
          className={`flex min-w-0 shrink-0 items-center gap-0.5 border-[color:var(--dibay-domain-divider,var(--sam-border))] pl-[max(0.5rem,var(--safe-left))] pr-2 min-[768px]:border-r ${MESSENGER_SPLIT_LIST_PANE_CLASS}`}
        >
          {showBack && backHref ? (
            <SectorHeaderBackButton backHref={backHref} preferHistoryBack={false} />
          ) : (
            <span className="inline-block h-10 w-10 shrink-0" aria-hidden />
          )}
          <h1 className="min-w-0 flex-1 truncate text-left text-[17px] font-bold leading-tight tracking-[-0.3px] text-[color:var(--sector-header-title-color,#243832)]">
            {title}
          </h1>
        </div>
        <div className="min-w-0 flex-1" aria-hidden />
        <div className="flex shrink-0 items-center justify-end gap-[length:var(--sector-header-icon-cluster-gap,8px)] pr-[max(0.75rem,var(--safe-right))]">
          {headerActionsNode}
        </div>
      </div>
    </header>
  );
}
