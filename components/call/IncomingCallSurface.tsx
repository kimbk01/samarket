"use client";

import { useI18n } from "@/components/i18n/AppLanguageProvider";
import { IncomingCallView } from "@/components/messenger/call/IncomingCallView";
import type { CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import { dispatchCallEvent } from "@/lib/call/call-events";
import type { CallContext } from "@/lib/call/call-types";

type Props = {
  ctx: CallContext;
};

export function IncomingCallSurface({ ctx }: Props) {
  const { t } = useI18n();
  const modeLabel =
    ctx.kind === "video" ? t("cm_ui_incoming_video_ringing") : t("cm_ui_incoming_voice_ringing");

  const vm: CallScreenViewModel = {
    visualTheme: "starbucks",
    mode: ctx.kind,
    direction: "incoming",
    phase: "ringing",
    peerLabel: ctx.peerLabel,
    peerAvatarUrl: ctx.peerAvatarUrl,
    statusText: modeLabel,
    subStatusText: undefined,
    mediaState: {
      micEnabled: true,
      speakerEnabled: true,
      cameraEnabled: false,
      localVideoMinimized: false,
    },
    primaryActions: [
      {
        id: "decline",
        label: t("cm_ui_reject"),
        icon: "decline",
        tone: "danger",
        onClick: () => dispatchCallEvent({ type: "CALL_REJECTED" }),
      },
      {
        id: "accept",
        label: t("cm_ui_accept"),
        icon: "accept",
        tone: "accept",
        onClick: () => dispatchCallEvent({ type: "CALL_ACCEPT_CLICK" }),
      },
    ],
  };

  return (
    <div className="fixed inset-0 z-[12000] flex flex-col bg-[#021E18]">
      <IncomingCallView vm={vm} />
    </div>
  );
}
