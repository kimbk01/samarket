"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { OutgoingCallView } from "@/components/messenger/call/OutgoingCallView";
import { VoiceCallView } from "@/components/messenger/call/VoiceCallView";
import { ConnectedVideoView } from "@/components/messenger/call/ConnectedVideoView";
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
import { rememberCallV3ReturnPath } from "@/lib/call-v3/call-v3-navigation";

type Props = {
  sessionId: string;
};

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

  useEffect(() => {
    useCallV3Store.getState().setRouter(router);
    rememberCallV3ReturnPath();
  }, [router]);

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
  }, [ctx.kind, ctx.role, ctx.state]);

  useEffect(() => {
    if (ctx.state === "active" && ctx.kind === "video") {
      callV3BindRemoteVideo(remoteVideoRef.current);
      callV3BindLocalVideo(localPreviewRef.current);
    }
  }, [ctx.state, ctx.kind]);

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

  if (ctx.state === "ending" || ctx.state === "ended") {
    return (
      <div className={`${shellClass} items-center justify-center`}>
        <p className="text-[#F1F8F4] sam-text-body-lg">{t("cm_ui_connecting")}</p>
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
