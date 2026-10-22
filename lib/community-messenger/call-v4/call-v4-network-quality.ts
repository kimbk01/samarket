"use client";

import type { IAgoraRTCClient } from "agora-rtc-sdk-ng";
import { messengerNetworkQualityWorst } from "@/lib/community-messenger/call-provider/agora-network-quality";
import { useCallV4MediaStore } from "@/lib/community-messenger/call-v4/call-v4-media-state";
import type { CallV4ConnectionSignalTier } from "@/lib/community-messenger/call-v4/call-v4-types";

const NETWORK_QUALITY_FLUSH_MS = 480;

const detachByCallId = new Map<string, () => void>();

export function resolveCallV4ConnectionSignalTier(
  uplinkNetworkQuality: number,
  downlinkNetworkQuality: number,
): CallV4ConnectionSignalTier {
  const worst = messengerNetworkQualityWorst(uplinkNetworkQuality, downlinkNetworkQuality);
  if (worst <= 0) return "checking";
  if (worst <= 2) return "good";
  if (worst === 3) return "fair";
  return "poor";
}

export function callV4ConnectionSignalTierMessageKey(tier: CallV4ConnectionSignalTier): string {
  switch (tier) {
    case "good":
      return "cm_ui_connection_status_good";
    case "fair":
      return "cm_ui_connection_status_fair";
    case "poor":
      return "cm_ui_connection_status_poor";
    default:
      return "cm_ui_network_quality_checking";
  }
}

export function attachCallV4NetworkQualityListener(callId: string, client: IAgoraRTCClient): void {
  const sid = callId.trim();
  if (!sid) return;
  detachCallV4NetworkQualityListener(sid);

  let pending: { u: number; d: number } | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const handler = (stats: { uplinkNetworkQuality: number; downlinkNetworkQuality: number }) => {
    pending = {
      u: stats.uplinkNetworkQuality ?? 0,
      d: stats.downlinkNetworkQuality ?? 0,
    };
    if (flushTimer != null) return;
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const sample = pending;
      if (!sample) return;
      const tier = resolveCallV4ConnectionSignalTier(sample.u, sample.d);
      useCallV4MediaStore.getState().setConnectionSignalTier(tier);
    }, NETWORK_QUALITY_FLUSH_MS);
  };

  client.on("network-quality", handler);

  detachByCallId.set(sid, () => {
    client.off("network-quality", handler);
    if (flushTimer != null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    pending = null;
  });
}

export function detachCallV4NetworkQualityListener(callId: string): void {
  const sid = callId.trim();
  if (!sid) return;
  const detach = detachByCallId.get(sid);
  if (detach) {
    detach();
    detachByCallId.delete(sid);
  }
  useCallV4MediaStore.getState().setConnectionSignalTier(null);
}
