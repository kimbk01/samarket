"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import { communityMessengerCallInviteChannelName } from "@/lib/community-messenger/call-invite-realtime-broadcast";

export const CM_VIDEO_UPGRADE_REQUEST = "cm_video_upgrade_request";
export const CM_VIDEO_UPGRADE_RESPONSE = "cm_video_upgrade_response";

export type VideoUpgradeBroadcastPayload = {
  sessionId: string;
  fromUserId: string;
  accepted?: boolean;
};

async function publishToUser(
  recipientUserId: string,
  event: string,
  payload: VideoUpgradeBroadcastPayload
): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) throw new Error("supabase_unavailable");
  const name = communityMessengerCallInviteChannelName(recipientUserId);
  const ch = sb.channel(name, { config: { broadcast: { ack: false } } });
  await new Promise<void>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error("upgrade_broadcast_timeout")), 1_800);
    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        window.clearTimeout(t);
        resolve();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        window.clearTimeout(t);
        reject(new Error(status));
      }
    });
  });
  await ch.send({ type: "broadcast", event, payload });
  void sb.removeChannel(ch);
}

export async function publishVideoUpgradeRequest(
  recipientUserId: string,
  payload: VideoUpgradeBroadcastPayload
): Promise<boolean> {
  try {
    await publishToUser(recipientUserId, CM_VIDEO_UPGRADE_REQUEST, payload);
    return true;
  } catch {
    return false;
  }
}

export async function publishVideoUpgradeResponse(
  recipientUserId: string,
  payload: VideoUpgradeBroadcastPayload & { accepted: boolean }
): Promise<boolean> {
  try {
    await publishToUser(recipientUserId, CM_VIDEO_UPGRADE_RESPONSE, payload);
    return true;
  } catch {
    return false;
  }
}

export function subscribeVideoUpgradeBroadcast(
  userId: string,
  onEvent: (event: string, payload: VideoUpgradeBroadcastPayload) => void
): () => void {
  const sb = getSupabaseClient();
  if (!sb || !userId.trim()) return () => {};
  const name = communityMessengerCallInviteChannelName(userId);
  const ch = sb.channel(name, { config: { broadcast: { self: false } } });
  ch.on("broadcast", { event: CM_VIDEO_UPGRADE_REQUEST }, (msg) => {
    const p = msg.payload as VideoUpgradeBroadcastPayload;
    if (p?.sessionId) onEvent(CM_VIDEO_UPGRADE_REQUEST, p);
  });
  ch.on("broadcast", { event: CM_VIDEO_UPGRADE_RESPONSE }, (msg) => {
    const p = msg.payload as VideoUpgradeBroadcastPayload;
    if (p?.sessionId) onEvent(CM_VIDEO_UPGRADE_RESPONSE, p);
  });
  ch.subscribe();
  return () => {
    void sb.removeChannel(ch);
  };
}
