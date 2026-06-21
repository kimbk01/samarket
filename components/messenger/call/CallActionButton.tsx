"use client";

import { memo } from "react";
import type { CallActionItem } from "./call-ui.types";
import {
  Headphones,
  MicOff,
  Monitor,
  PhoneOff,
  PictureInPicture2,
  Settings,
  Video,
  VideoOff,
} from "lucide-react";
import {
  IosFilledMicrophoneGlyph,
  IosFilledPhoneGlyph,
  IosFilledSpeakerWaveGlyph,
  IosFilledSpeakerXMarkGlyph,
  IosFilledVideoCameraGlyph,
  IosFilledXMarkGlyph,
} from "@/components/messenger/call/IosFilledCallControlGlyphs";

/** 앞·뒤 카메라 전환 — 허용 lucide 세트에 없어 전용 SVG 사용 */
function CameraSwitchGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M20 10a8 8 0 0 0-15.5-2M4 14a8 8 0 0 0 15.5 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m4 10-2-2 2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m20 14 2 2-2 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function diskClassForAction(item: CallActionItem, theme?: "starbucks"): string {
  const { icon, tone, active, disabled } = item;
  if (theme === "starbucks") {
    if (tone === "danger" || icon === "end" || icon === "decline") {
      return "bg-[#A9472B] text-white shadow-[0_12px_28px_rgba(88,41,26,0.28)] ring-1 ring-[#F1F8F4]/22";
    }
    if (tone === "accept" || icon === "accept") {
      return "bg-[#00754A] text-white shadow-[0_12px_28px_rgba(0,117,74,0.34)] ring-1 ring-[#D4E9E2]/35";
    }
    if (disabled) {
      return "bg-[#003D29]/58 text-white shadow-[0_12px_28px_rgba(0,61,41,0.22)] ring-1 ring-[#D4E9E2]/24 backdrop-blur-md";
    }
    if (active) {
      return "bg-[#F1F8F4] text-[#003D29] shadow-[0_12px_28px_rgba(0,61,41,0.2)] ring-1 ring-[#D4E9E2]/70";
    }
    return "bg-[#003D29]/52 text-white shadow-[0_12px_28px_rgba(0,61,41,0.24)] ring-1 ring-[#D4E9E2]/30 backdrop-blur-md";
  }
  if (tone === "danger" || icon === "end" || icon === "decline") {
    return "bg-[#FF3B30] text-white shadow-[0_12px_28px_rgba(255,59,48,0.35)]";
  }
  if (tone === "accept" || icon === "accept") {
    return "bg-[#22c55e] text-white shadow-[0_12px_28px_rgba(34,197,94,0.38)]";
  }

  if (icon === "camera" && active) return "bg-white text-slate-900 shadow-[0_12px_30px_rgba(0,0,0,0.22)]";
  if (icon === "camera" && !active) return "bg-[rgba(90,200,250,0.42)] text-white backdrop-blur-sm";

  if (icon === "camera-switch" || icon === "pip-swap" || icon === "minimize")
    return "bg-[rgba(90,200,250,0.42)] text-white backdrop-blur-sm";
  if (icon === "mic") return "bg-[rgba(90,200,250,0.42)] text-white backdrop-blur-sm";
  if (icon === "video-off") return "bg-[rgba(90,200,250,0.42)] text-white backdrop-blur-sm";
  if (icon === "speaker") return "bg-[rgba(90,200,250,0.42)] text-white backdrop-blur-sm";

  if (icon === "video") return "bg-[rgba(90,200,250,0.42)] text-white backdrop-blur-sm";

  return "bg-[rgba(90,200,250,0.42)] text-white backdrop-blur-sm";
}

function glyphClassForControl({
  theme,
  active,
  disabled,
}: {
  theme?: "starbucks";
  active?: boolean;
  disabled?: boolean;
}): string {
  if (theme === "starbucks" && active) return "text-[#003D29]";
  if (disabled) return theme === "starbucks" ? "text-white/72" : "text-white/45";
  return "text-white";
}

function CallActionGlyph({ item, theme }: { item: CallActionItem; theme?: "starbucks" }) {
  const { icon, tone, active, disabled } = item;

  const SIZE = 24;
  const controlCls = glyphClassForControl({ theme, active, disabled });

  if (tone === "danger" || icon === "end") return <IosFilledXMarkGlyph className="text-white" />;
  if (icon === "decline") return <PhoneOff size={SIZE} className="text-white" />;
  if (tone === "accept" || icon === "accept") return <IosFilledPhoneGlyph className="text-white" />;

  if (icon === "mic")
    return active ? (
      <IosFilledMicrophoneGlyph className={controlCls} />
    ) : (
      <MicOff size={SIZE} strokeWidth={2.35} className="text-white" />
    );
  /** 비활성일 때도 카메라 실루엣 유지(발신 「영상」행). */
  if (icon === "video") return <IosFilledVideoCameraGlyph className={controlCls} />;
  if (icon === "video-off") return <VideoOff size={SIZE} className="text-white" />;
  if (icon === "camera") {
    return active ? <Video size={SIZE} className={controlCls} /> : <IosFilledVideoCameraGlyph className="text-white" />;
  }

  if (icon === "speaker")
    return active ? (
      <IosFilledSpeakerWaveGlyph className={controlCls} />
    ) : (
      <IosFilledSpeakerXMarkGlyph className="text-white" />
    );

  if (icon === "camera-switch") return <CameraSwitchGlyph className={controlCls} />;
  if (icon === "pip-swap" || icon === "minimize")
    return <PictureInPicture2 size={SIZE} className={controlCls} />;
  if (icon === "retry") return <IosFilledPhoneGlyph className="text-white" />;
  if (icon === "close") return <PhoneOff size={SIZE} className="text-white" />;
  if (icon === "back") return <IosFilledPhoneGlyph className="text-white" />;
  if (icon === "message") return <Monitor size={SIZE} className="text-white" />;
  if (icon === "settings") return <Settings size={SIZE} className="text-white" />;

  return <Headphones size={SIZE} className="text-white" />;
}

export const CallActionButton = memo(function CallActionButton({
  item,
  theme,
}: {
  item: CallActionItem;
  theme?: "starbucks";
}) {
  const disk = diskClassForAction(item, theme);
  const isStarbucks = theme === "starbucks";

  return (
    <button
      type="button"
      onClick={item.onClick}
      disabled={item.disabled}
      className={`call-btn items-center text-center disabled:opacity-40 ${
        isStarbucks ? "min-w-0 flex-1 basis-0" : ""
      }`.trim()}
    >
      <span
        className={`call-btn__disk ${isStarbucks ? "h-[clamp(48px,14vw,58px)] w-[clamp(48px,14vw,58px)]" : ""} ${disk}`.trim()}
      >
        <CallActionGlyph item={item} theme={theme} />
      </span>
      <span
        className={`font-medium leading-tight ${
          isStarbucks
            ? "line-clamp-2 max-w-[clamp(3rem,18vw,4.4rem)] text-[clamp(10px,2.8vw,12px)] text-[#F1F8F4] drop-shadow-[0_1px_8px_rgba(0,61,41,0.32)]"
            : "sam-text-helper text-white/92 drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]"
        }`}
      >
        {item.label}
      </span>
    </button>
  );
});
