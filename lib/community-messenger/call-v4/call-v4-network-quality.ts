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

/**
 * V-8 — 「연결 상태가 좋지 않습니다」 경고 히스테리시스 (설계 C-UI 3 · 네이티브 V-4/V-5 와 같은 기준).
 * - 품질 0(측정 전)은 무시한다(좋음으로 세지 않음).
 * - 나쁨 샘플: 품질 4·5 또는 손실 > 15% 또는 RTT > 600ms → 2회 연속이면 표시.
 * - 좋음 샘플: 품질 1~3 이고 손실·RTT 기준 이내 → 3회 연속이면 해제.
 * - 품질 6(끊김) 또는 재연결 중 → 즉시 표시.
 */
export const CALL_V4_LINK_POOR_SHOW_STREAK = 2;
export const CALL_V4_LINK_POOR_CLEAR_STREAK = 3;
export const CALL_V4_LINK_POOR_LOSS_PCT = 15;
export const CALL_V4_LINK_POOR_RTT_MS = 600;

export type CallV4LinkQualitySample = {
  /** Agora 0~6 — 상·하향 중 나쁜 쪽 */
  quality: number;
  /** 수신 손실률(%) */
  lossPct?: number | null;
  rttMs?: number | null;
  reconnecting?: boolean;
};

export type CallV4LinkQualityEvaluator = {
  push: (sample: CallV4LinkQualitySample) => boolean;
  readonly poor: boolean;
  reset: () => void;
};

export function createCallV4LinkQualityEvaluator(): CallV4LinkQualityEvaluator {
  let poor = false;
  let badStreak = 0;
  let goodStreak = 0;
  return {
    get poor() {
      return poor;
    },
    reset() {
      poor = false;
      badStreak = 0;
      goodStreak = 0;
    },
    push(sample) {
      const quality = Number.isFinite(sample.quality) ? Math.floor(sample.quality) : 0;
      if (sample.reconnecting === true || quality >= 6) {
        poor = true;
        badStreak = CALL_V4_LINK_POOR_SHOW_STREAK;
        goodStreak = 0;
        return poor;
      }
      if (quality <= 0) return poor;
      const loss = typeof sample.lossPct === "number" && Number.isFinite(sample.lossPct) ? sample.lossPct : 0;
      const rtt = typeof sample.rttMs === "number" && Number.isFinite(sample.rttMs) ? sample.rttMs : 0;
      const bad = quality >= 4 || loss > CALL_V4_LINK_POOR_LOSS_PCT || rtt > CALL_V4_LINK_POOR_RTT_MS;
      if (bad) {
        badStreak += 1;
        goodStreak = 0;
        if (badStreak >= CALL_V4_LINK_POOR_SHOW_STREAK) poor = true;
      } else {
        goodStreak += 1;
        badStreak = 0;
        if (goodStreak >= CALL_V4_LINK_POOR_CLEAR_STREAK) poor = false;
      }
      return poor;
    },
  };
}

type AgoraStatsReader = {
  getRTCStats?: () => { RTT?: number } | null | undefined;
  getRemoteAudioStats?: () => Record<string, { packetLossRate?: number } | undefined> | null | undefined;
  getRemoteVideoStats?: () => Record<string, { packetLossRate?: number } | undefined> | null | undefined;
};

/** Agora Web 통계 → RTT·최대 수신 손실률(%) — 지원하지 않으면 null */
export function readCallV4AgoraLinkStats(client: AgoraStatsReader): { rttMs: number | null; lossPct: number | null } {
  let rttMs: number | null = null;
  let lossPct: number | null = null;
  try {
    const rtt = client.getRTCStats?.()?.RTT;
    if (typeof rtt === "number" && Number.isFinite(rtt)) rttMs = rtt;
  } catch {
    /* noop */
  }
  const readLoss = (map: Record<string, { packetLossRate?: number } | undefined> | null | undefined) => {
    if (!map) return;
    for (const entry of Object.values(map)) {
      const v = entry?.packetLossRate;
      if (typeof v === "number" && Number.isFinite(v)) lossPct = Math.max(lossPct ?? 0, v);
    }
  };
  try {
    readLoss(client.getRemoteAudioStats?.());
    readLoss(client.getRemoteVideoStats?.());
  } catch {
    /* noop */
  }
  return { rttMs, lossPct };
}

export function attachCallV4NetworkQualityListener(callId: string, client: IAgoraRTCClient): void {
  const sid = callId.trim();
  if (!sid) return;
  detachCallV4NetworkQualityListener(sid);

  let pending: { u: number; d: number } | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnecting = false;
  const evaluator = createCallV4LinkQualityEvaluator();

  const applyLinkPoor = (poor: boolean) => {
    const store = useCallV4MediaStore.getState();
    if (store.linkPoorWarning !== poor) store.setLinkPoorWarning(poor);
  };

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
      const link = readCallV4AgoraLinkStats(client as unknown as AgoraStatsReader);
      applyLinkPoor(
        evaluator.push({
          quality: messengerNetworkQualityWorst(sample.u, sample.d),
          lossPct: link.lossPct,
          rttMs: link.rttMs,
          reconnecting,
        }),
      );
    }, NETWORK_QUALITY_FLUSH_MS);
  };

  /** 재연결 중 → 즉시 경고, 연결 복구 후에는 품질 샘플 3회 연속 좋음으로만 해제 */
  const connectionHandler = (curState: string) => {
    reconnecting = curState === "RECONNECTING";
    if (reconnecting) applyLinkPoor(evaluator.push({ quality: 0, reconnecting: true }));
  };

  client.on("network-quality", handler);
  client.on("connection-state-change", connectionHandler);

  detachByCallId.set(sid, () => {
    client.off("network-quality", handler);
    client.off("connection-state-change", connectionHandler);
    if (flushTimer != null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    pending = null;
    evaluator.reset();
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
  useCallV4MediaStore.getState().setLinkPoorWarning(false);
}
