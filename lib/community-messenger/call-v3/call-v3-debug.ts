import { isDibayCallV3SafeLaneEnabled } from "@/lib/community-messenger/call-v3/call-v3-flag";

const TAG = "[DIBAY_CALL_V3]";

export function logCallV3(step: string, payload?: Record<string, unknown>): void {
  if (payload && Object.keys(payload).length > 0) {
    console.info(TAG, step, payload);
    return;
  }
  console.info(TAG, step);
}

export type CallV3ButtonLocation = "room_header" | "room_dot_menu" | "call_logs_redial" | "call_peer_detail";

export function logCallV3ButtonRender(input: {
  location: CallV3ButtonLocation;
  roomId?: string | null;
  peerId?: string | null;
  visible: boolean;
  disabled: boolean;
  reason?: string | null;
}): void {
  console.info(TAG, "call_button_render", {
    location: input.location,
    roomId: input.roomId?.trim() || undefined,
    peerId: input.peerId?.trim() || undefined,
    visible: input.visible,
    disabled: input.disabled,
    reason: input.reason ?? null,
    flagEnabled: isDibayCallV3SafeLaneEnabled(),
  });
}

export function logCallV3ButtonClick(input: {
  location: CallV3ButtonLocation;
  roomId?: string | null;
  peerId?: string | null;
  mediaType: "audio" | "video";
}): void {
  console.info(TAG, "call_button_click", {
    location: input.location,
    roomId: input.roomId?.trim() || undefined,
    peerId: input.peerId?.trim() || undefined,
    mediaType: input.mediaType,
    flagEnabled: isDibayCallV3SafeLaneEnabled(),
  });
}

export function logCallV3LaunchEntry(input: {
  roomId?: string | null;
  peerId?: string | null;
  mediaType: "audio" | "video";
}): void {
  console.info(TAG, "launch_entry", {
    roomId: input.roomId?.trim() || undefined,
    peerId: input.peerId?.trim() || undefined,
    mediaType: input.mediaType,
    flagEnabled: isDibayCallV3SafeLaneEnabled(),
  });
}
