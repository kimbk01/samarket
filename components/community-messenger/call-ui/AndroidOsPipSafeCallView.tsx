"use client";

import { Maximize2, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import type { CallScreenViewModel } from "@/components/messenger/call/call-ui.types";
import { CallAvatar } from "@/components/messenger/call/CallAvatar";
import { useCallTimer } from "@/components/messenger/call/useCallTimer";
import { useI18n } from "@/components/i18n/AppLanguageProvider";

type AndroidOsPipSafeCallViewProps = {
  vm: CallScreenViewModel;
};

/**
 * Android OS PiP 전용 최소 레이아웃 — video element·media track 재생성 없음.
 * header / blur / gradient / large control bar / 보조 PiP 제거.
 */
export function AndroidOsPipSafeCallView({ vm }: AndroidOsPipSafeCallViewProps) {
  const { safeT } = useI18n();
  const timer = useCallTimer({
    connectedAt: vm.connectedAt,
    endedAt: vm.endedAt,
    endedDurationSeconds: vm.endedDurationSeconds,
  });

  const endAction = vm.primaryActions.find((item) => item.icon === "end");
  const restoreAction = vm.onBack ?? vm.primaryActions.find((item) => item.icon === "back")?.onClick ?? null;

  const statusLine = timer ?? vm.statusText;
  const micMuted = !vm.mediaState.micEnabled;
  const cameraOff = !vm.mediaState.cameraEnabled;

  return (
    <div className="relative z-[2] h-full min-h-0 w-full flex-1 overflow-hidden bg-black" data-call-android-os-pip-safe>
      <div className="absolute inset-0 z-0 h-full w-full bg-black [&_video]:pointer-events-none [&_video]:h-full [&_video]:w-full [&_video]:object-cover [&_[id^=agora]]:h-full [&_[id^=agora]]:w-full">
        {vm.mainVideoSlot}
      </div>

      {!vm.showRemoteVideo ? (
        <div className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-[#003D29]">
          <CallAvatar label={vm.peerLabel} avatarUrl={vm.peerAvatarUrl} pulse={false} theme={vm.visualTheme} />
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex justify-center px-2 pb-2">
        <div
          className="pointer-events-auto flex w-full max-w-[min(100%,20rem)] items-center gap-2 rounded-ui-rect bg-black/72 px-2.5 py-2 ring-1 ring-white/10"
          style={{ opacity: 1, transform: "translateZ(0)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="truncate sam-text-body font-semibold text-white">{vm.peerLabel}</div>
            <div className="truncate sam-text-body-secondary text-white/82">{statusLine}</div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 text-white/88" aria-hidden>
            {micMuted ? <MicOff size={15} strokeWidth={2.25} /> : <Mic size={15} strokeWidth={2.25} />}
            {vm.mode === "video" ? (
              cameraOff ? <VideoOff size={15} strokeWidth={2.25} /> : <Video size={15} strokeWidth={2.25} />
            ) : null}
          </div>
          {restoreAction ? (
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/12 text-white"
              aria-label={safeT("cm_ui_call_dock_expand", {
                fallbackKo: "통화 화면 펼치기",
                fallbackEn: "Expand call screen",
              })}
              onClick={() => restoreAction()}
            >
              <Maximize2 size={15} strokeWidth={2.25} />
            </button>
          ) : null}
          {endAction ? (
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#C0392B] text-white"
              aria-label={endAction.label}
              disabled={endAction.disabled}
              onClick={() => endAction.onClick()}
            >
              <PhoneOff size={15} strokeWidth={2.25} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
