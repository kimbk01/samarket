"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { GlobalCommunityMessengerUnreadSound } from "@/components/community-messenger/GlobalCommunityMessengerUnreadSound";
import { resolveMessagingGlobalChromeFromPath } from "@/lib/layout/messaging-global-chrome-policy";

/**
 * `community_messenger_participants` Realtime 은 경로에 따라 `MessagingGlobalChrome` 이 내려가면
 * 구독이 끊겨 하단 「메신저」뱃지·`cm.room.bump` 가 멈춘다.
 * 메인 앱 트리에서 **항상 1개**만 마운트하고, 인앱 사운드·배너 모드만 경로에 맞춘다.
 */
export function MainShellMessengerParticipantBridge({
  regionBarInLayout = true,
}: {
  regionBarInLayout?: boolean;
}) {
  const pathname = usePathname();
  const playback = useMemo(
    () =>
      resolveMessagingGlobalChromeFromPath(pathname, regionBarInLayout).policy
        .communityMessengerParticipantPlayback,
    [pathname, regionBarInLayout]
  );
  return <GlobalCommunityMessengerUnreadSound enabled playback={playback} />;
}
