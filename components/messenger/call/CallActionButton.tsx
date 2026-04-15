"use client";

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

function bgClassForAction(item: CallActionItem) {
  const { icon, tone, active, disabled } = item;
  if (tone === "danger" || icon === "end" || icon === "decline") return "bg-red-500";
  if (tone === "accept" || icon === "accept") return "bg-blue-500";

  if (icon === "mic") return active ? "bg-blue-500" : "bg-blue-500";
  if (icon === "video") return disabled ? "bg-blue-500" : "bg-blue-500";
  if (icon === "camera") return active ? "bg-blue-500" : "bg-blue-500";
  if (icon === "speaker") return active ? "bg-blue-500" : "bg-blue-500";

  return "bg-blue-500";
}

function CallActionIcon({ item }: { item: CallActionItem }) {
  const { icon, tone, active, disabled } = item;

  const SIZE = 24;

  if (tone === "danger" || icon === "end" || icon === "decline") return <PhoneOff size={SIZE} />;
  if (tone === "accept" || icon === "accept") return <Phone size={SIZE} />;

  if (icon === "mic") return active ? <Mic size={SIZE} /> : <MicOff size={SIZE} />;
  if (icon === "video") return disabled ? <VideoOff size={SIZE} /> : <Video size={SIZE} />;
  if (icon === "camera") return active ? <Video size={SIZE} /> : <VideoOff size={SIZE} />;

  // speakerEnabled=false(이어폰) -> VolumeX, true -> Volume2
  if (icon === "speaker") return active ? <Volume2 size={SIZE} /> : <VolumeX size={SIZE} />;

  // 나머지 레거시 액션은 지정된 아이콘만 사용 가능 → 가장 중립적인 아이콘으로 통일
  if (icon === "camera-switch") return <Video size={SIZE} />;
  if (icon === "retry") return <Phone size={SIZE} />;
  if (icon === "close") return <PhoneOff size={SIZE} />;
  if (icon === "back") return <Phone size={SIZE} />;
  if (icon === "message") return <Monitor size={SIZE} />;

  // 화면 공유/헤드셋 등 확장 시에도 허용된 아이콘만 사용
  return active ? <Headphones size={SIZE} /> : <Headphones size={SIZE} />;
}

export function CallActionButton({ item }: { item: CallActionItem }) {
  const bgClass = bgClassForAction(item);

  return (
    <button
      type="button"
      onClick={item.onClick}
      disabled={item.disabled}
      className="call-btn items-center text-center disabled:opacity-40"
    >
      <span className={`call-btn__disk ${bgClass}`.trim()}>
        <CallActionIcon item={item} />
      </span>
      <span className="text-[12px] font-medium leading-tight text-white/92">{item.label}</span>
    </button>
  );
}
