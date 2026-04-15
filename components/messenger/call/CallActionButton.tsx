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
  Video,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";

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

function diskClassForAction(item: CallActionItem): string {
  const { icon, tone, active } = item;
  if (tone === "danger" || icon === "end" || icon === "decline") {
    return "bg-red-500 text-white shadow-[0_12px_28px_rgba(239,68,68,0.38)]";
  }
  if (tone === "accept" || icon === "accept") {
    return "bg-[#22c55e] text-white shadow-[0_12px_28px_rgba(34,197,94,0.38)]";
  }

  if (icon === "camera" && active) return "bg-white text-slate-900 shadow-[0_12px_30px_rgba(0,0,0,0.22)]";
  if (icon === "camera" && !active) return "bg-black/38 text-white";

  if (icon === "camera-switch") return "bg-black/38 text-white";
  if (icon === "mic") return "bg-black/38 text-white";
  if (icon === "video-off") return "bg-black/38 text-white";
  if (icon === "speaker") return "bg-black/38 text-white";

  if (icon === "video") return "bg-black/38 text-white";

  return "bg-black/38 text-white";
}

function CallActionGlyph({ item }: { item: CallActionItem }) {
  const { icon, tone, active, disabled } = item;

  const SIZE = 24;

  if (tone === "danger" || icon === "end" || icon === "decline") return <PhoneOff size={SIZE} className="text-white" />;
  if (tone === "accept" || icon === "accept") return <Phone size={SIZE} className="text-white" />;

  if (icon === "mic") return active ? <Mic size={SIZE} className="text-white" /> : <MicOff size={SIZE} className="text-white" />;
  if (icon === "video") return disabled ? <VideoOff size={SIZE} className="text-white" /> : <Video size={SIZE} className="text-white" />;
  if (icon === "video-off") return <VideoOff size={SIZE} className="text-white" />;
  if (icon === "camera") {
    return active ? <Video size={SIZE} className="text-slate-900" /> : <VideoOff size={SIZE} className="text-white" />;
  }

  if (icon === "speaker") return active ? <Volume2 size={SIZE} className="text-white" /> : <VolumeX size={SIZE} className="text-white" />;

  if (icon === "camera-switch") return <CameraSwitchGlyph className="text-white" />;
  if (icon === "retry") return <Phone size={SIZE} className="text-white" />;
  if (icon === "close") return <PhoneOff size={SIZE} className="text-white" />;
  if (icon === "back") return <Phone size={SIZE} className="text-white" />;
  if (icon === "message") return <Monitor size={SIZE} className="text-white" />;

  return <Headphones size={SIZE} className="text-white" />;
}

export const CallActionButton = memo(function CallActionButton({ item }: { item: CallActionItem }) {
  const disk = diskClassForAction(item);

  return (
    <button
      type="button"
      onClick={item.onClick}
      disabled={item.disabled}
      className="call-btn items-center text-center disabled:opacity-40"
    >
      <span className={`call-btn__disk ${disk}`.trim()}>
        <CallActionGlyph item={item} />
      </span>
      <span className="text-[12px] font-medium leading-tight text-white/92 drop-shadow-[0_1px_8px_rgba(0,0,0,0.35)]">
        {item.label}
      </span>
    </button>
  );
});
