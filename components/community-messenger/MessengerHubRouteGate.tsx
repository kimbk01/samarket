"use client";

import { CommunityMessengerHome } from "@/components/community-messenger/CommunityMessengerHome";
import { useIsMessengerSplitViewport } from "@/hooks/use-is-messenger-split-viewport";

type Props = {
  initialTab?: string;
  initialSection?: string;
  initialFilter?: string;
  initialKind?: string;
};

/**
 * 768px+ — 목록은 `MessengerResponsiveShell` 의 `tabletSplitListOnly` 인스턴스만 렌더.
 * <768 — 기존 full-page hub (`CommunityMessengerHome`).
 */
export function MessengerHubRouteGate({
  initialTab,
  initialSection,
  initialFilter,
  initialKind,
}: Props) {
  const isWide = useIsMessengerSplitViewport();
  if (isWide) return null;

  return (
    <CommunityMessengerHome
      initialTab={initialTab}
      initialSection={initialSection}
      initialFilter={initialFilter}
      initialKind={initialKind}
    />
  );
}
