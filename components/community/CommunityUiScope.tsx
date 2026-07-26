import type { ReactNode } from "react";
import { COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { CM_PAGE_CLASS } from "@/lib/community/community-ui-classes";

/**
 * Canonical Community UI token scope — attachment 2 (rounded cards + page bg).
 *
 * CONTRACT: `--cm-*` tokens live under `[data-community-ui]` only
 * (`lib/community/community-design-tokens.css`). Feed cards use
 * `CM_FEED_CARD_CLASS` → `rounded-[var(--cm-radius-card)]`.
 *
 * DO NOT: put this only on `/philife/layout` — Cold Boot `/` and tab-enter
 * pending panels must share the same scope or cards paint sharp (attachment 1).
 * DO NOT: cold/warm alternate scopes or hydration class swaps for card chrome.
 */
export const COMMUNITY_RENDERER_ID = "canonical-v1" as const;

export function CommunityUiScope({ children }: { children: ReactNode }) {
  return (
    <div
      className="sam-domain-shell flex min-h-0 min-w-0 flex-1 flex-col"
      data-community-ui
      data-community-renderer={COMMUNITY_RENDERER_ID}
      data-dibay-first-html-shell="1"
      data-app-shell="canonical-v1"
    >
      <div
        className={`mx-auto flex min-h-0 w-full max-w-[66rem] min-w-0 flex-1 flex-col ${CM_PAGE_CLASS} ${COMMUNITY_FONT_CLASS}`}
      >
        {children}
      </div>
    </div>
  );
}
