"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { CallV3Controls } from "@/components/community-messenger/call-v3/CallV3Controls";
import {
  callV3EnsureAgoraJoined,
  startCallV3CallerActivePoll,
} from "@/lib/community-messenger/call-v3/call-v3-actions";
import { logCallV3 } from "@/lib/community-messenger/call-v3/call-v3-debug";
import { exitCallV3ScreenAfterCleanup, registerCallV3ExitRouter } from "@/lib/community-messenger/call-v3/call-v3-route";
import { readCallV3Identity, readCallV3Phase, useCallV3Store } from "@/lib/community-messenger/call-v3/call-v3-store";

type CallV3ScreenProps = {
  callId: string;
};

export function CallV3Screen({ callId }: CallV3ScreenProps) {
  const router = useRouter();
  const { safeT } = useI18n();
  const phase = useCallV3Store((s) => s.phase);
  const identity = useCallV3Store((s) => s.identity);

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
    return startCallV3CallerActivePoll(callId);
  }, [callId, identity?.callId, identity?.direction, phase]);

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

  const isOutgoing = identity?.direction === "outgoing";
  const isIncoming = identity?.direction === "incoming";

  const statusLabel =
    phase === "connected"
      ? safeT("cm_ui_call_active_voice", {
          fallbackKo: "통화 중",
          fallbackEn: "On a call",
        })
      : phase === "ending"
        ? safeT("cm_ui_ending_call", {
            fallbackKo: "종료 중",
            fallbackEn: "Ending…",
          })
        : isOutgoing
          ? phase === "outgoing_ringing"
            ? safeT("cm_ui_call_status_outgoing_dialing", {
                fallbackKo: "발신 중",
                fallbackEn: "Calling",
              })
            : safeT("cm_ui_connecting", {
                fallbackKo: "연결 중",
                fallbackEn: "Connecting",
              })
          : safeT("cm_ui_connecting", {
              fallbackKo: "연결 중",
              fallbackEn: "Connecting",
            });

  const title = isOutgoing
    ? identity?.mediaType === "video"
      ? safeT("cm_ui_call_log_video_outgoing", {
          fallbackKo: "영상 통화 발신",
          fallbackEn: "Outgoing video call",
        })
      : safeT("cm_ui_call_log_voice_outgoing", {
          fallbackKo: "음성 통화 발신",
          fallbackEn: "Outgoing voice call",
        })
    : identity?.mediaType === "video"
      ? safeT("cm_ui_call_log_video_incoming", {
          fallbackKo: "영상 통화 수신",
          fallbackEn: "Incoming video call",
        })
      : safeT("cm_ui_call_log_voice_incoming", {
          fallbackKo: "음성 통화 수신",
          fallbackEn: "Incoming voice call",
        });

  const showControls = phase === "connected" || (isOutgoing && (phase === "outgoing_ringing" || phase === "creating"));

  return (
    <div
      data-testid="call-v3-screen"
      className="flex min-h-[100dvh] flex-col bg-sam-app text-sam-fg"
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-lg font-semibold">{title}</p>
        <p className="text-sm text-sam-muted">{statusLabel}</p>
        {phase === "joining" ? (
          <p className="text-xs text-sam-muted">
            {safeT("cm_ui_connection_connecting", {
              fallbackKo: "연결 중…",
              fallbackEn: "Connecting…",
            })}
          </p>
        ) : null}
      </div>
      {showControls ? <CallV3Controls callId={callId} router={router} /> : null}
    </div>
  );
}
