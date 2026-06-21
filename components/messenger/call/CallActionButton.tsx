"use client";

import { memo } from "react";
import type { CallActionItem } from "./call-ui.types";
import {
  Headphones,
  Mic,
  MicOff,
  Monitor,
  Phone,
  PhoneOff,
  PictureInPicture2,
  Settings,
  SwitchCamera,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { CallRipple } from "@/components/messenger/call/CallRipple";
import { triggerCallHaptic } from "@/components/messenger/call/CallHapticController";

function diskClassForAction(item: CallActionItem, theme?: "starbucks"): string {
  const { icon, tone, active, disabled } = item;
  if (theme === "starbucks") {
    if (tone === "danger" || icon === "end" || icon === "decline") {
      return "bg-[#D93025] text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)] ring-1 ring-white/18";
    }
    if (tone === "accept" || icon === "accept") {
      return "bg-[#00754A] text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)] ring-1 ring-[#D4E9E2]/35";
    }
    if (disabled) {
      return "bg-[#003D29]/58 text-white shadow-[0_12px_28px_rgba(0,61,41,0.22)] ring-1 ring-[#D4E9E2]/24 backdrop-blur-md";
    }
    if (active) {
      return "bg-[#F1F8F4] text-[#003D29] shadow-[0_12px_28px_rgba(0,61,41,0.2)] ring-1 ring-[#D4E9E2]/70";
    }
    return "bg-[#00754A] text-white shadow-[0_8px_24px_rgba(0,0,0,0.2)] ring-1 ring-[#D4E9E2]/30";
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

  if (tone === "danger" || icon === "end") return <PhoneOff size={SIZE} strokeWidth={2.35} className="text-white" />;
  if (icon === "decline") return <PhoneOff size={SIZE} className="text-white" />;
  if (tone === "accept" || icon === "accept") return <Phone size={SIZE} strokeWidth={2.35} className="text-white" />;

  if (icon === "mic")
    return active ? (
      <Mic size={SIZE} strokeWidth={2.35} className={controlCls} />
    ) : (
      <MicOff size={SIZE} strokeWidth={2.35} className="text-white" />
    );
  /** 비활성일 때도 카메라 실루엣 유지(발신 「영상」행). */
  if (icon === "video") return <Video size={SIZE} strokeWidth={2.35} className={controlCls} />;
  if (icon === "video-off") return <VideoOff size={SIZE} className="text-white" />;
  if (icon === "camera") {
    return active ? (
      <Video size={SIZE} className={controlCls} />
    ) : (
      <Video size={SIZE} strokeWidth={2.35} className="text-white" />
    );
  }

  if (icon === "speaker")
    return active ? (
      <Volume2 size={SIZE} strokeWidth={2.35} className={controlCls} />
    ) : (
      <VolumeX size={SIZE} strokeWidth={2.35} className="text-white" />
    );

  if (icon === "camera-switch") return <SwitchCamera size={SIZE} className={controlCls} />;
  if (icon === "pip-swap" || icon === "minimize")
    return <PictureInPicture2 size={SIZE} className={controlCls} />;
  if (icon === "retry") return <Phone size={SIZE} strokeWidth={2.35} className="text-white" />;
  if (icon === "close") return <X size={SIZE} strokeWidth={2.35} className="text-white" />;
  if (icon === "back") return <Phone size={SIZE} strokeWidth={2.35} className="text-white" />;
  if (icon === "message") return <Monitor size={SIZE} className="text-white" />;
  if (icon === "settings") return <Settings size={SIZE} className="text-white" />;

  return <Headphones size={SIZE} className="text-white" />;
}

export const CallActionButton = memo(function CallActionButton({
  item,
  theme,
  variant = "default",
}: {
  item: CallActionItem;
  theme?: "starbucks";
  variant?: "default" | "control" | "list";
}) {
  const disk = diskClassForAction(item, theme);
  const isStarbucks = theme === "starbucks";
  const sizeClass =
    variant === "control"
      ? "call-btn__disk--control h-[clamp(44px,11vw,56px)] w-[clamp(44px,11vw,56px)]"
      : variant === "list"
        ? "h-[42px] w-[42px]"
        : isStarbucks
          ? "h-[clamp(52px,14vw,64px)] w-[clamp(52px,14vw,64px)]"
          : "";

  const labelClass =
    variant === "control"
      ? "line-clamp-2 max-w-[clamp(2.25rem,14vw,3.25rem)] text-[clamp(9px,2.4vw,11px)] text-[#F1F8F4] drop-shadow-[0_1px_8px_rgba(0,61,41,0.32)]"
      : isStarbucks
        ? "line-clamp-2 max-w-[clamp(3rem,18vw,4.4rem)] text-[clamp(10px,2.8vw,12px)] text-[#F1F8F4] drop-shadow-[0_1px_8px_rgba(0,61,41,0.32)]"
        : "sam-text-helper text-white/92 drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]";

  return (
    <button
      type="button"
      onClick={item.onClick}
      onPointerDown={() => triggerCallHaptic("selection")}
      disabled={item.disabled}
      className={`call-btn items-center text-center disabled:opacity-40 ${
        isStarbucks ? "min-w-0 flex-1 basis-0" : ""
      } ${variant === "control" ? "call-btn--control gap-1" : ""}`.trim()}
    >
      <span
        className={`call-btn__disk ${sizeClass} ${disk}`.trim()}
      >
        <CallRipple />
        <CallActionGlyph item={item} theme={theme} />
      </span>
      <span className={`font-medium leading-tight ${labelClass}`}>
        {item.label}
      </span>
    </button>
  );
});
