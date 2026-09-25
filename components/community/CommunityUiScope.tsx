"use client";

import { createContext, useContext, type ReactNode } from "react";
import { COMMUNITY_FONT_CLASS } from "@/lib/philife/philife-flat-ui-classes";
import { CM_PAGE_CLASS } from "@/lib/community/community-ui-classes";
import { PhilifeFeedClientEntry } from "@/components/community/PhilifeFeedClientEntry";
import { useDibayCommunityPresentation } from "@/lib/device/use-dibay-community-presentation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

/**
 * Canonical Community UI token scope + FD5 presentation authority.
 *
 * CONTRACT: `--cm-*` tokens live under `[data-community-ui]` only.
 * Presentation is SINGLE | STACKED | DUAL from LayoutMode — CSS does not choose Device.
 *
 * Nested scopes passthrough so `/philife` layout + HomeSurface do not double-compose.
 */
export const COMMUNITY_RENDERER_ID = "canonical-v1" as const;

type CommunityPresentationContextValue = {
  dualComposed: boolean;
};

const CommunityPresentationContext = createContext<CommunityPresentationContextValue | null>(null);

export function useCommunityPresentationContext(): CommunityPresentationContextValue {
  return useContext(CommunityPresentationContext) ?? { dualComposed: false };
}

function CommunityDualEmptyDetail() {
  const { safeT } = useI18n();
  return (
    <div
      className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-[length:var(--cm-font-body)] text-[var(--cm-text-muted)]"
      data-dibay-community-empty-detail
    >
      {safeT("community_dual_select_post", {
        fallbackKo: "글을 선택하세요",
        fallbackEn: "Select a post",
      })}
    </div>
  );
}

function CommunityUiScopeRoot({ children }: { children: ReactNode }) {
  const authority = useDibayCommunityPresentation();
  const showHubFeed = authority.surface === "hub" || authority.composed;
  const showChildren = authority.surface !== "hub";

  return (
    <CommunityPresentationContext.Provider value={{ dualComposed: authority.composed }}>
      <div
        className="sam-domain-shell flex min-h-0 min-w-0 flex-1 flex-col"
        data-community-ui
        data-community-renderer={COMMUNITY_RENDERER_ID}
        data-dibay-first-html-shell="1"
        data-app-shell="canonical-v1"
        data-dibay-community-presentation={authority.presentation}
        data-dibay-community-surface={authority.surface}
        data-dibay-community-composed={authority.composed ? "dual" : "single"}
        data-dibay-community-layout-mode={authority.layoutMode}
      >
        <div
          className={`mx-auto flex min-h-0 w-full max-w-[66rem] min-w-0 flex-1 flex-col ${CM_PAGE_CLASS} ${COMMUNITY_FONT_CLASS}`}
        >
          <div className={authority.composed ? "dibay-community-dual-frame" : "flex min-h-0 min-w-0 flex-1 flex-col"}>
            {showHubFeed ? (
              <div
                className={authority.composed ? "dibay-community-pane-list" : "min-h-0 min-w-0 flex-1"}
                data-dibay-community-pane={authority.composed ? "list" : undefined}
              >
                <PhilifeFeedClientEntry />
              </div>
            ) : null}
            {authority.composed ? (
              <div className="dibay-community-pane-detail" data-dibay-community-pane="detail">
                {authority.surface === "detail" ? children : <CommunityDualEmptyDetail />}
              </div>
            ) : showChildren ? (
              children
            ) : null}
          </div>
        </div>
      </div>
    </CommunityPresentationContext.Provider>
  );
}

export function CommunityUiScope({ children }: { children?: ReactNode }) {
  const parent = useContext(CommunityPresentationContext);
  if (parent) return <>{children}</>;
  return <CommunityUiScopeRoot>{children}</CommunityUiScopeRoot>;
}
