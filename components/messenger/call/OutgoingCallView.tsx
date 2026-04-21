"use client";

import { PhoneOff, Video } from "lucide-react";
import type { CallScreenViewModel } from "./call-ui.types";
import { CallActionBar } from "./CallActionBar";
import { CallAvatar } from "./CallAvatar";

export function OutgoingCallView({ vm }: { vm: CallScreenViewModel }) {
  const isVideo = vm.mode === "video";
  const endAction = vm.primaryActions.find((item) => item.icon === "end" || item.tone === "danger") ?? null;
  const topLine = isVideo ? "영상 통화" : "음성 통화";

  return (
    <div className="relative z-[2] flex min-h-0 flex-1 flex-col overflow-hidden bg-[linear-gradient(180deg,#6b3df1_0%,#512bbb_36%,#27154a_100%)] px-5 pb-[max(22px,calc(env(safe-area-inset-bottom)+10px))] pt-[max(18px,env(safe-area-inset-top)+8px)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.14),transparent_36%),radial-gradient(circle_at_50%_92%,rgba(255,255,255,0.05),transparent_34%)]" />
      <div className="relative flex min-h-0 flex-1 flex-col items-center">
        <div className="mt-[10vh] flex items-center gap-1.5 sam-text-body font-semibold text-white/72">
          {isVideo ? <Video size={16} className="opacity-80" /> : <PhoneOff size={15} className="rotate-[135deg] opacity-70" />}
          <span>{topLine}</span>
        </div>
        <h1 className="mt-2 text-center sam-text-hero font-bold tracking-tight text-white">{vm.peerLabel}</h1>
        <p className="mt-3 sam-text-body-lg font-medium text-white/76">{vm.statusText}</p>
        <div className="mt-8">
          <CallAvatar
            label={vm.peerLabel}
            avatarUrl={vm.peerAvatarUrl}
            pulse
              placeholderTone="brand"
          />
        </div>
        {vm.subStatusText ? (
          <p className="mt-2 max-w-[300px] text-center sam-text-body-secondary leading-snug text-white/62">{vm.subStatusText}</p>
        ) : null}

        <div className="mt-auto flex w-full flex-col items-center justify-center pb-2 pt-8">
          {endAction ? (
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={endAction.onClick}
                disabled={endAction.disabled}
                className="flex h-[90px] w-[90px] items-center justify-center rounded-full bg-[#ef3b2d] text-white shadow-[0_14px_36px_rgba(239,59,45,0.4)] transition active:scale-[0.96] disabled:opacity-40"
                aria-label={endAction.label}
              >
                <PhoneOff size={38} strokeWidth={2.6} />
              </button>
              <span className="sam-text-section-title font-medium text-white/92">{endAction.label}</span>
            </div>
          ) : (
            <CallActionBar actions={vm.primaryActions} />
          )}
          {vm.secondaryActions?.length ? (
            <div className="mt-4">
              <CallActionBar actions={vm.secondaryActions} compact />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
