"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OutgoingCallView } from "@/components/messenger/call/OutgoingCallView";
import { VoiceCallView } from "@/components/messenger/call/VoiceCallView";
import { ConnectedVideoView } from "@/components/messenger/call/ConnectedVideoView";
import { EndedCallView } from "@/components/messenger/call/EndedCallView";
import type { CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import { DibayCallControls } from "@/components/call-v3/DibayCallControls";
import { DibayVideoPip } from "@/components/call-v3/DibayVideoPip";
import {
  dispatchCallV3Event,
  handleCallV3AcceptDeepLink,
  refreshCallV3SessionAuthoritative,
} from "@/lib/call-v3/call-v3-events";
import {
  callV3AgoraCreateVideoPreview,
  callV3BindLocalVideo,
  callV3BindRemoteVideo,
} from "@/lib/call-v3/call-v3-agora";
import { subscribeCallV3Context, useCallV3Store } from "@/lib/call-v3/call-v3-store";
import { navigateBackFromCallV3, rememberCallV3ReturnPath } from "@/lib/call-v3/call-v3-navigation";
import { startOutgoingCallUnified } from "@/lib/call-v3/call-v3-outgoing-entry";
import { logCallV3 } from "@/lib/call-v3/call-v3-log";
import { isCallV3TerminalState, type CallV3Context } from "@/lib/call-v3/call-v3-types";
import {
  isMessengerCallClientFailureReason,
  messengerCallFailureEndedDetail,
  messengerCallTerminalFailureHeadline,
} from "@/lib/community-messenger/messenger-call-join-failure-reason";
import { showMessengerSnackbar } from "@/lib/community-messenger/stores/messenger-snackbar-store";
import type { MessageKey } from "@/lib/i18n/messages";

type Props = {
  sessionId: string;
};

function resolveTerminalStatusText(
  ctx: CallV3Context,
  t: (key: MessageKey) => string
): { statusText: string; subStatusText?: string } {
  const endedReason = ctx.dbSession?.endedReason ?? null;
  const failureHeadline = messengerCallTerminalFailureHeadline({
    status: ctx.dbSession?.status ?? ctx.state,
    endedReason,
    callKind: ctx.kind,
    joined: ctx.localJoined && ctx.remoteJoined,
  });

  if (failureHeadline) {
    const detail =
      endedReason && isMessengerCallClientFailureReason(endedReason)
        ? messengerCallFailureEndedDetail(endedReason, ctx.kind)
        : undefined;
    return { statusText: failureHeadline, subStatusText: detail };
  }

  if (ctx.state === "missed") {
    return { statusText: t("cm_ui_missed_call") };
  }
  if (ctx.state === "rejected") {
    return {
      statusText:
        ctx.role === "caller" ? t("cm_ui_peer_declined_call") : t("cm_ui_call_status_declined"),
    };
  }
  return { statusText: t("cm_ui_call_ended") };
}

function canShowCallV3TerminalRedial(ctx: CallV3Context): boolean {
  if (ctx.role !== "caller") return false;
  if (ctx.state === "rejected") return false;
  if (!ctx.roomId?.trim() || !ctx.peerUserId?.trim()) return false;
  const endedReason = ctx.dbSession?.endedReason ?? null;
  if (endedReason === "failed_insecure_context") return false;
  return true;
}

export function DibayCallScreen({ sessionId }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctx = useSyncExternalStore(
    subscribeCallV3Context,
    () => useCallV3Store.getState().ctx,
    () => useCallV3Store.getState().ctx
  );
  const localPreviewRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLDivElement>(null);
  const previewStartedRef = useRef(false);
  const redialingRef = useRef(false);
  const [redialing, setRedialing] = useState(false);
  const [redialError, setRedialError] = useState<string | null>(null);

  useEffect(() => {
    useCallV3Store.getState().setRouter(router);
    rememberCallV3ReturnPath();
  }, [router]);

  useEffect(() => {
    previewStartedRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (searchParams.get("action") === "accept") {
      handleCallV3AcceptDeepLink(sessionId);
    }
    void refreshCallV3SessionAuthoritative(sessionId);
  }, [sessionId, searchParams]);

  useEffect(() => {
    if (ctx.kind !== "video" || ctx.role !== "caller" || ctx.state !== "outgoing") return;
    if (previewStartedRef.current) return;
    previewStartedRef.current = true;
    void (async () => {
      const track = await callV3AgoraCreateVideoPreview();
      const el = localPreviewRef.current;
      if (track && el) {
        try {
          track.play(el);
        } catch {
          /* */
        }
      }
    })();
  }, [ctx.kind, ctx.role, ctx.state, sessionId]);

  useEffect(() => {
    if (ctx.state === "active" && ctx.kind === "video") {
      callV3BindRemoteVideo(remoteVideoRef.current);
      callV3BindLocalVideo(localPreviewRef.current);
    }
  }, [ctx.state, ctx.kind]);

  const handleTerminalClose = useCallback(() => {
    const roomId = ctx.roomId;
    dispatchCallV3Event({ type: "CALL_CLEANUP_DONE" });
    navigateBackFromCallV3(router, roomId);
  }, [ctx.roomId, router]);

  const handleRedial = useCallback(() => {
    const roomId = ctx.roomId?.trim();
    const peerUserId = ctx.peerUserId?.trim();
    if (!roomId || !peerUserId || redialingRef.current) return;

    logCallV3("redial_click", {
      previousSessionId: sessionId,
      roomId,
      peerUserId,
      callKind: ctx.kind,
    });

    redialingRef.current = true;
    setRedialing(true);
    setRedialError(null);

    void (async () => {
      try {
        const result = await startOutgoingCallUnified({
          roomId,
          peerUserId,
          peerLabel: ctx.peerLabel,
          peerAvatarUrl: ctx.peerAvatarUrl,
          kind: ctx.kind,
          router,
        });
        if (!result.ok) {
          const message = result.userMessage ?? t("cm_ui_network_error_could_not_start_call");
          logCallV3("redial_failed", { previousSessionId: sessionId, roomId, message });
          setRedialError(message);
          showMessengerSnackbar(message, { variant: "error" });
        }
      } catch {
        const message = t("cm_ui_network_error_could_not_start_call");
        logCallV3("redial_failed", { previousSessionId: sessionId, roomId, message });
        setRedialError(message);
        showMessengerSnackbar(message, { variant: "error" });
      } finally {
        redialingRef.current = false;
        setRedialing(false);
      }
    })();
  }, [ctx.kind, ctx.peerAvatarUrl, ctx.peerLabel, ctx.peerUserId, ctx.roomId, router, sessionId, t]);

  const shellClass =
    "fixed inset-0 z-[11000] flex flex-col bg-[radial-gradient(circle_at_50%_0%,rgba(212,233,226,0.20),transparent_34%),linear-gradient(180deg,#101827_0%,#064332_52%,#021E18_100%)]";

  const endAction = {
    id: "end",
    label: t("cm_ui_end_call"),
    icon: "end" as const,
    tone: "danger" as const,
    onClick: () => dispatchCallV3Event({ type: "CALL_END_CLICK" }),
  };

  const defaultMedia = {
    micEnabled: true,
    speakerEnabled: true,
    cameraEnabled: ctx.kind === "video",
    localVideoMinimized: false,
  };

  if (ctx.state === "outgoing" || ctx.state === "connecting") {
    const statusText =
      ctx.state === "connecting"
        ? t("cm_ui_connecting")
        : ctx.kind === "video"
          ? t("cm_ui_outgoing_video_dialing")
          : t("cm_ui_outgoing_voice_dialing");
    const vm: CallScreenViewModel = {
      visualTheme: "starbucks",
      mode: ctx.kind,
      direction: "outgoing",
      phase: ctx.state === "connecting" ? "connecting" : "ringing",
      peerLabel: ctx.peerLabel,
      peerAvatarUrl: ctx.peerAvatarUrl,
      statusText,
      subStatusText:
        ctx.kind === "video" && ctx.role === "caller" ? t("cm_ui_connecting") : undefined,
      mediaState: defaultMedia,
      primaryActions: [endAction],
    };

    if (ctx.kind === "video" && ctx.role === "caller" && ctx.state === "outgoing") {
      return (
        <div className={shellClass}>
          <div ref={localPreviewRef} className="absolute inset-0 z-0 bg-black" />
          <div className="relative z-10 flex flex-1 flex-col">
            <OutgoingCallView vm={vm} />
          </div>
        </div>
      );
    }

    return (
      <div className={shellClass}>
        <OutgoingCallView vm={vm} />
      </div>
    );
  }

  if (ctx.state === "active") {
    if (ctx.kind === "video") {
      const vm: CallScreenViewModel = {
        visualTheme: "starbucks",
        mode: "video",
        direction: ctx.role === "caller" ? "outgoing" : "incoming",
        phase: "connected",
        peerLabel: ctx.peerLabel,
        peerAvatarUrl: ctx.peerAvatarUrl,
        statusText: t("cm_ui_connecting"),
        mediaState: { ...defaultMedia, cameraEnabled: true },
        primaryActions: [endAction],
      };
      return (
        <div className={shellClass}>
          <div ref={remoteVideoRef} className="absolute inset-0 z-0 bg-black" />
          <DibayVideoPip />
          <div className="relative z-10 flex flex-1 flex-col">
            <ConnectedVideoView vm={vm} />
          </div>
        </div>
      );
    }

    const vm: CallScreenViewModel = {
      visualTheme: "starbucks",
      mode: "voice",
      direction: ctx.role === "caller" ? "outgoing" : "incoming",
      phase: "connected",
      peerLabel: ctx.peerLabel,
      peerAvatarUrl: ctx.peerAvatarUrl,
      statusText: t("cm_ui_connecting"),
      mediaState: defaultMedia,
      primaryActions: [endAction],
      connectedAt: Date.now(),
    };

    return (
      <div className={shellClass}>
        <VoiceCallView vm={vm} />
      </div>
    );
  }

  if (ctx.state === "ending") {
    return (
      <div className={`${shellClass} items-center justify-center`}>
        <p className="text-[#F1F8F4] sam-text-body-lg">{t("cm_ui_connecting")}</p>
      </div>
    );
  }

  if (isCallV3TerminalState(ctx.state)) {
    const { statusText, subStatusText } = resolveTerminalStatusText(ctx, t);
    const showRedial = canShowCallV3TerminalRedial(ctx);
    const primaryActions: CallScreenViewModel["primaryActions"] = [];

    if (showRedial) {
      primaryActions.push({
        id: "retry-call",
        label: t("cm_ui_redial"),
        icon: "retry",
        onClick: handleRedial,
        disabled: redialing,
      });
    }

    const vm: CallScreenViewModel = {
      visualTheme: "starbucks",
      mode: ctx.kind,
      direction: ctx.role === "caller" ? "outgoing" : "incoming",
      phase: "ended",
      peerLabel: ctx.peerLabel,
      peerAvatarUrl: ctx.peerAvatarUrl,
      statusText,
      subStatusText: redialError ?? subStatusText,
      mediaState: defaultMedia,
      primaryActions,
      secondaryActions: [
        {
          id: "close-terminal",
          label: t("common_close"),
          icon: "close",
          onClick: handleTerminalClose,
        },
      ],
      endedAt: Date.now(),
    };

    return (
      <div className={shellClass}>
        <EndedCallView vm={vm} />
      </div>
    );
  }

  return (
    <div className={`${shellClass} items-center justify-center`}>
      <p className="text-[#F1F8F4] sam-text-body-lg">{t("cm_ui_connecting")}</p>
      <div className="mt-8">
        <DibayCallControls variant="outgoing" />
      </div>
    </div>
  );
}
