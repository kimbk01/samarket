"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CommunityMessengerCallClient } from "@/components/community-messenger/CommunityMessengerCallClient";
import { IncomingConnectingShell } from "@/components/community-messenger/call-ui/IncomingConnectingShell";
import {
  logIncomingConnectingShellHidden,
  logIncomingConnectingShellVisible,
} from "@/lib/community-messenger/incoming-connecting-shell-trace";
import { readIncomingConnectingShellMeta } from "@/lib/community-messenger/read-incoming-connecting-shell-meta";
import {
  navigateBackFromCommunityMessengerCall,
} from "@/lib/community-messenger/call-session-navigation-seed";

type Props = {
  sessionId: string;
  isAcceptRoute: boolean;
};

/** P2-A — accept route에서 CallClient 로드 전 연결 중 shell */
export function CommunityMessengerCallPageAcceptShellLayer({ sessionId, isAcceptRoute }: Props) {
  const router = useRouter();
  const { t } = useI18n();
  const [shellVisible, setShellVisible] = useState(isAcceptRoute);
  const shellVisibleLoggedRef = useRef(false);

  const shellMeta = useMemo(
    () => readIncomingConnectingShellMeta(sessionId, t("cm_ui_call_label")),
    [sessionId, t]
  );

  useLayoutEffect(() => {
    if (!isAcceptRoute || shellVisibleLoggedRef.current) return;
    shellVisibleLoggedRef.current = true;
    logIncomingConnectingShellVisible({
      sessionId,
      phase: "call_page",
      callKind: shellMeta.callKind,
      peerLabel: shellMeta.peerLabel,
    });
  }, [isAcceptRoute, sessionId, shellMeta.callKind, shellMeta.peerLabel]);

  const hideShell = useCallback(() => {
    setShellVisible((prev) => {
      if (!prev) return prev;
      logIncomingConnectingShellHidden({ sessionId, phase: "call_page" });
      return false;
    });
  }, [sessionId]);

  const handleDismissFailed = useCallback(() => {
    navigateBackFromCommunityMessengerCall(router, null);
  }, [router]);

  if (!isAcceptRoute) {
    return (
      <CommunityMessengerCallClient
        key={sessionId}
        sessionId={sessionId}
        initialSession={null}
      />
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <CommunityMessengerCallClient
        key={sessionId}
        sessionId={sessionId}
        initialSession={null}
        onCallScreenPainted={hideShell}
      />
      {shellVisible ? (
        <IncomingConnectingShell
          callId={shellMeta.callId}
          peerLabel={shellMeta.peerLabel}
          peerAvatarUrl={shellMeta.peerAvatarUrl}
          callKind={shellMeta.callKind}
          status="connecting_media"
          onDismiss={handleDismissFailed}
        />
      ) : null}
    </div>
  );
}
