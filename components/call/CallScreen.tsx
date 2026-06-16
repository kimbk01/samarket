"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OutgoingCallView } from "@/components/messenger/call/OutgoingCallView";
import { VoiceCallView } from "@/components/messenger/call/VoiceCallView";
import { ConnectedVideoView } from "@/components/messenger/call/ConnectedVideoView";
import { EndedCallView } from "@/components/messenger/call/EndedCallView";
import type { CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import { CallControls } from "@/components/call/CallControls";
import { VideoPip } from "@/components/call/VideoPip";
import {
  dispatchCallEvent,
  handleCallAcceptDeepLink,
  refreshCallSessionAuthoritative,
} from "@/lib/call/call-events";
import {
  callAgoraCreateVideoPreview,
  callBindLocalVideo,
  callBindRemoteVideo,
} from "@/lib/call/call-agora";
import { subscribeCallContext, useCallStore } from "@/lib/call/call-store";
import { navigateBackFromCall, rememberCallReturnPath, startFreshOutgoingCall } from "@/lib/call/call-navigation";
import { logCall } from "@/lib/call/call-log";
import { isCallTerminalState, type CallContext } from "@/lib/call/call-types";
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
  ctx: CallContext,
  t: (key: MessageKey) => string
): { statusText: string; subStatusText?: string } {
  const endedReason = ctx.dbSession?.endedReason ?? null;
  const failureHeadline = messengerCallTerminalFailureHeadline({
    status: ctx.dbSession?.status ?? ctx.state,
    endedReason,
    callKind: ctx.kind,
    joined: ctx.localJoined && ctx.remoteJoined,
  });

  if (failureHeadline || ctx.state === "failed") {
    const detail =
      endedReason && isMessengerCallClientFailureReason(endedReason)
        ? messengerCallFailureEndedDetail(endedReason, ctx.kind)
        : ctx.state === "failed"
          ? t("cm_ui_network_error_could_not_start_call")
          : undefined;
    return { statusText: failureHeadline ?? t("cm_ui_network_error_could_not_start_call"), subStatusText: detail };
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

function canShowTerminalRedial(ctx: CallContext): boolean {
  if (ctx.role !== "caller") return false;
  if (ctx.state === "rejected" || ctx.state === "failed") return false;
  if (!ctx.roomId?.trim() || !ctx.peerUserId?.trim()) return false;
  const endedReason = ctx.dbSession?.endedReason ?? null;
  if (endedReason === "failed_insecure_context") return false;
  return true;
}

export function CallScreen({ sessionId }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const ctx = useSyncExternalStore(
    subscribeCallContext,
    () => useCallStore.getState().ctx,
    () => useCallStore.getState().ctx
  );
  const localPreviewRef = useRef<HTMLDivElement>(null);
  const remoteVideoRef = useRef<HTMLDivElement>(null);
  const previewStartedRef = useRef(false);
  const redialingRef = useRef(false);
  const [redialing, setRedialing] = useState(false);
  const [redialError, setRedialError] = useState<string | null>(null);

  useEffect(() => {
    logCall("runtime", "page_mounted", { screen: "CallScreen", sessionId });
    useCallStore.getState().setRouter(router);
    rememberCallReturnPath();
  }, [router, sessionId]);

  useEffect(() => {
    previewStartedRef.current = false;
  }, [sessionId]);

  useEffect(() => {
    if (searchParams.get("action") === "accept") {
      handleCallAcceptDeepLink(sessionId);
    }
    void refreshCallSessionAuthoritative(sessionId);
  }, [sessionId, searchParams]);

  useEffect(() => {
    const live =
      ctx.sessionId === sessionId &&
      (ctx.state === "outgoing" || ctx.state === "connecting" || ctx.state === "accepting");
    if (!live) return;
    void refreshCallSessionAuthoritative(sessionId);
    const pollId = window.setInterval(() => {
      void refreshCallSessionAuthoritative(sessionId);
    }, 2_000);
    return () => window.clearInterval(pollId);
  }, [ctx.sessionId, ctx.state, sessionId]);

  useEffect(() => {
    if (ctx.kind !== "video" || ctx.role !== "caller" || ctx.state !== "outgoing") return;
    if (previewStartedRef.current) return;
    previewStartedRef.current = true;
    void (async () => {
      const track = await callAgoraCreateVideoPreview();
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
      callBindRemoteVideo(remoteVideoRef.current);
      callBindLocalVideo(localPreviewRef.current);
    }
  }, [ctx.state, ctx.kind]);

  const handleTerminalClose = useCallback(() => {
    const roomId = ctx.roomId;
    dispatchCallEvent({ type: "CALL_CLEANUP_DONE" });
    navigateBackFromCall(router, roomId);
  }, [ctx.roomId, router]);

  const handleRedial = useCallback(() => {
    const roomId = ctx.roomId?.trim();
    const peerUserId = ctx.peerUserId?.trim();
    if (!roomId || !peerUserId || redialingRef.current) return;

    logCall("runtime", "redial_click", {
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
        const result = await startFreshOutgoingCall({
          roomId,
          peerUserId,
          peerLabel: ctx.peerLabel,
          peerAvatarUrl: ctx.peerAvatarUrl,
          callKind: ctx.kind,
          router,
        });
        if (!result.ok) {
          const message = result.userMessage ?? t("cm_ui_network_error_could_not_start_call");
          logCall("runtime", "redial_failed", { previousSessionId: sessionId, roomId, message });
          setRedialError(message);
          showMessengerSnackbar(message, { variant: "error" });
        }
      } catch {
        const message = t("cm_ui_network_error_could_not_start_call");
        logCall("runtime", "redial_failed", { previousSessionId: sessionId, roomId, message });
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
    onClick: () => dispatchCallEvent({ type: "CALL_END_CLICK" }),
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
          <VideoPip />
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

  if (isCallTerminalState(ctx.state)) {
    const { statusText, subStatusText } = resolveTerminalStatusText(ctx, t);
    const showRedial = canShowTerminalRedial(ctx);
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
        <CallControls variant="outgoing" />
      </div>
    </div>
  );
}
