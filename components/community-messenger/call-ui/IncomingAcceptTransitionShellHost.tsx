"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { IncomingConnectingShell } from "@/components/community-messenger/call-ui/IncomingConnectingShell";
import {
  logIncomingConnectingShellHidden,
  logIncomingConnectingShellVisible,
} from "@/lib/community-messenger/incoming-connecting-shell-trace";
import { readIncomingConnectingShellMeta } from "@/lib/community-messenger/read-incoming-connecting-shell-meta";
import { shouldShowIncomingAcceptTransitionShell } from "@/lib/community-messenger/incoming-accept-transition-route";

/**
 * P2-A — native accept 후 `router.replace` 전 통화 목록·허브 노출 차단.
 * accept call page shell(`CommunityMessengerCallPageAcceptShellLayer`)로 handoff 후 언마운트.
 */
export function IncomingAcceptTransitionShellHost() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { t } = useI18n();
  const [routeTick, setRouteTick] = useState(0);
  const shellVisibleLoggedRef = useRef(false);

  const transition = useMemo(() => {
    void routeTick;
    return shouldShowIncomingAcceptTransitionShell(pathname, search);
  }, [pathname, search, routeTick]);

  const shellMeta = useMemo(
    () =>
      transition.sessionId
        ? readIncomingConnectingShellMeta(transition.sessionId, t("cm_ui_call_label"))
        : null,
    [transition.sessionId, t]
  );

  useEffect(() => {
    const bump = () => setRouteTick((n) => n + 1);
    window.addEventListener("dibay:call-route", bump);
    window.addEventListener("dibay:push-route", bump);
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", bump);
    return () => {
      window.removeEventListener("dibay:call-route", bump);
      window.removeEventListener("dibay:push-route", bump);
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);

  useLayoutEffect(() => {
    if (!transition.show || !transition.sessionId || shellVisibleLoggedRef.current) return;
    shellVisibleLoggedRef.current = true;
    logIncomingConnectingShellVisible({
      sessionId: transition.sessionId,
      phase: "accept_route_transition",
      pathname,
    });
  }, [transition.show, transition.sessionId, pathname]);

  const hideTransitionShell = useCallback(() => {
    if (!shellVisibleLoggedRef.current) return;
    logIncomingConnectingShellHidden({
      sessionId: transition.sessionId,
      phase: "accept_route_transition",
      reason: "handoff_to_call_page",
    });
    shellVisibleLoggedRef.current = false;
  }, [transition.sessionId]);

  useLayoutEffect(() => {
    if (transition.show) return;
    hideTransitionShell();
  }, [transition.show, hideTransitionShell]);

  if (!transition.show || !transition.sessionId || !shellMeta) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] flex min-h-0 flex-col overflow-hidden"
      data-p2-a-accept-transition-shell="1"
    >
      <IncomingConnectingShell
        callId={shellMeta.callId}
        peerLabel={shellMeta.peerLabel}
        peerAvatarUrl={shellMeta.peerAvatarUrl}
        callKind={shellMeta.callKind}
        status="connecting_media"
      />
    </div>
  );
}
