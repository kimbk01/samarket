"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CallScreen } from "@/components/messenger/call/CallScreen";
import {
  callV3EnsureAgoraJoined,
  startCallV3CallerActivePoll,
} from "@/lib/community-messenger/call-v3/call-v3-actions";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import { startCallV3OutgoingMissedTimer } from "@/lib/community-messenger/call-v3/call-v3-missed-timeout";
import { exitCallV3ScreenAfterCleanup, registerCallV3ExitRouter } from "@/lib/community-messenger/call-v3/call-v3-route";
import { buildCallV3ScreenViewModel } from "@/lib/community-messenger/call-v3/call-v3-view-model";
import { readCallV3Identity, readCallV3Phase, useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

type CallV3ScreenProps = {
  callId: string;
};

export function CallV3Screen({ callId }: CallV3ScreenProps) {
  const router = useRouter();
  const { safeT, t } = useI18n();
  const phase = useCallV3Store((s) => s.phase);
  const identity = useCallV3Store((s) => s.identity);
  const connectedAt = useCallV3Store((s) => s.connectedAt);

  useEffect(() => {
    if (!callId) return;
    logCallV3("screen_mounted", { callId });
  }, [callId]);

  useEffect(() => {
    registerCallV3ExitRouter(router);
    return () => registerCallV3ExitRouter(null);
  }, [router]);

  useEffect(() => {
    const current = readCallV3Identity();
    const currentPhase = readCallV3Phase();
    if (currentPhase === "idle" || !current || current.callId !== callId) {
      exitCallV3ScreenAfterCleanup(router);
    }
  }, [callId, phase, identity, router]);

  useEffect(() => {
    if (identity?.direction !== "outgoing") {
      return;
    }
    if (phase !== "outgoing_ringing" && phase !== "creating") {
      return;
    }
    if (identity.callId !== callId) return;
    logCallV3("caller_poll_start", { callId, phase });
    startCallV3OutgoingMissedTimer(callId, identity.createdAt, router);
    return startCallV3CallerActivePoll(callId);
  }, [callId, identity?.callId, identity?.createdAt, identity?.direction, phase, router]);

  useEffect(() => {
    if (phase !== "joining" || identity?.callId !== callId) {
      return;
    }
    let cancelled = false;
    void (async () => {
      await callV3EnsureAgoraJoined(callId);
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [callId, identity?.callId, phase]);

  const vm = useMemo(
    () =>
      buildCallV3ScreenViewModel({
        callId,
        phase,
        identity,
        connectedAt,
        safeT: (key, options) => safeT(key as Parameters<typeof safeT>[0], options),
        t: (key, options) => t(key as Parameters<typeof t>[0], options),
        router,
      }),
    [callId, phase, identity, connectedAt, safeT, t, router]
  );

  if (!vm) {
    return null;
  }

  return (
    <div data-testid="call-v3-screen" className="flex min-h-0 min-w-0 flex-1 flex-col">
      <CallScreen vm={vm} variant="page" />
    </div>
  );
}
