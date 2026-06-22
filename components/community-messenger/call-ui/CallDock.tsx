"use client";

import { Maximize2, Mic, MicOff, PhoneOff } from "lucide-react";
import type { ReactNode } from "react";
import { SamarketUserAvatarThumb } from "@/components/profile/SamarketUserAvatarThumb";
import { useI18n } from "@/components/i18n/AppLanguageProvider";
import type { CallDockSnapshot } from "@/lib/community-messenger/call-runtime-registry";
import { useCallDockRestoreGesture } from "@/lib/community-messenger/use-call-dock-restore-gesture";
import { CallDockSplitThumb } from "@/components/community-messenger/call-ui/CallBackgroundSplitPreview";

export type CallDockProps = {
  snapshot: CallDockSnapshot;
  onExpand: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
};

export function CallDock({ snapshot, onExpand, onEnd, onToggleMute }: CallDockProps) {
  const { safeT } = useI18n();
  const { onRootTap, onExpandClick } = useCallDockRestoreGesture(onExpand);

  const statusLine = snapshot.timerText ?? snapshot.statusText;

  return (
    <div
      className="pointer-events-auto w-full"
      role="region"
      aria-label={safeT("cm_ui_call_dock_region", {
        fallbackKo: "진행 중인 통화",
        fallbackEn: "Ongoing call",
      })}
    >
      <div
        className="flex items-center gap-3 rounded-ui-rect bg-[#006241] px-3 py-2.5 shadow-[0_8px_28px_rgba(0,61,41,0.42)] ring-1 ring-[#D4E9E2]/22"
        onClick={onRootTap}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onRootTap();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={safeT("cm_ui_call_dock_restore", {
          fallbackKo: "통화 화면으로 돌아가기",
          fallbackEn: "Return to call screen",
        })}
      >
        <DockThumb snapshot={snapshot} />
        <div className="min-w-0 flex-1">
          <div className="truncate sam-text-body font-semibold text-[#F1F8F4]">{snapshot.peerLabel}</div>
          <div className="truncate sam-text-body-secondary text-[#D4E9E2]/88">{statusLine}</div>
        </div>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#003D29]/45 text-[#F1F8F4] ring-1 ring-[#D4E9E2]/18"
          aria-label={
            snapshot.micMuted
              ? safeT("cm_ui_unmute", { fallbackKo: "음소거 해제", fallbackEn: "Unmute" })
              : safeT("cm_ui_mute", { fallbackKo: "음소거", fallbackEn: "Mute" })
          }
          onClick={(event) => {
            event.stopPropagation();
            onToggleMute();
          }}
        >
          {snapshot.micMuted ? <MicOff size={17} strokeWidth={2.25} /> : <Mic size={17} strokeWidth={2.25} />}
        </button>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#C0392B] text-white shadow-sm"
          aria-label={safeT("cm_ui_end_call", { fallbackKo: "통화 종료", fallbackEn: "End call" })}
          onClick={(event) => {
            event.stopPropagation();
            onEnd();
          }}
        >
          <PhoneOff size={17} strokeWidth={2.25} />
        </button>
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#003D29]/45 text-[#F1F8F4] ring-1 ring-[#D4E9E2]/18"
          aria-label={safeT("cm_ui_call_dock_expand", {
            fallbackKo: "통화 화면 펼치기",
            fallbackEn: "Expand call screen",
          })}
          onClick={onExpandClick}
        >
          <Maximize2 size={16} strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}

function DockThumb({ snapshot }: { snapshot: CallDockSnapshot }) {
  const videoSlot = snapshot.videoThumbSlot;
  const remoteSlot = snapshot.remoteVideoThumbSlot;
  if (snapshot.isVideo && snapshot.useSplitPreview && videoSlot && remoteSlot) {
    return <CallDockSplitThumb remoteSlot={remoteSlot} localSlot={videoSlot} />;
  }
  if (snapshot.isVideo && videoSlot) {
    return (
      <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-ui-rect bg-[#003D29] ring-1 ring-[#D4E9E2]/22 [&_video]:h-full [&_video]:w-full [&_video]:object-cover">
        {videoSlot as ReactNode}
      </div>
    );
  }
  return (
    <SamarketUserAvatarThumb
      avatarUrl={snapshot.peerAvatarUrl}
      size={44}
      roundedClassName="rounded-ui-rect"
      className="shrink-0 ring-1 ring-[#D4E9E2]/22"
    />
  );
}
