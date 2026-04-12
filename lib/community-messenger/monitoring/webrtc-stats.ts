/**
 * RTCPeerConnection.getStats() 에서 수신 트랙 기준 손실률 추정 (%)
 * 브라우저·코덱에 따라 reports 가 다름 — 없으면 null
 */
export type MessengerWebRtcDiagnosticsSample = {
  packetLossPercent: number | null;
  /** candidate-pair currentRoundTripTime (초) → ms */
  roundTripTimeMs: number | null;
  jitterMs: number | null;
  selectedLocalCandidateType: string | null;
  selectedRemoteCandidateType: string | null;
  bytesReceived: number | null;
  bytesSent: number | null;
};

/**
 * 운영 대시보드·클라이언트 모니터링 배치용 — 브라우저별 report 차이는 null 로 흡수
 */
export async function collectMessengerWebRtcDiagnostics(
  pc: RTCPeerConnection
): Promise<MessengerWebRtcDiagnosticsSample> {
  const empty: MessengerWebRtcDiagnosticsSample = {
    packetLossPercent: null,
    roundTripTimeMs: null,
    jitterMs: null,
    selectedLocalCandidateType: null,
    selectedRemoteCandidateType: null,
    bytesReceived: null,
    bytesSent: null,
  };
  try {
    const stats = await pc.getStats();
    const candidates = new Map<string, { candidateType?: string }>();
    for (const r of stats.values()) {
      const t = (r as { type?: string }).type;
      if (t === "local-candidate" || t === "remote-candidate") {
        const id = (r as { id?: string }).id;
        const typ = (r as { candidateType?: string }).candidateType;
        if (id) candidates.set(id, { candidateType: typ });
      }
    }

    let packetLossPercent: number | null = null;
    let jitterMs: number | null = null;
    let roundTripTimeMs: number | null = null;
    let selectedLocalCandidateType: string | null = null;
    let selectedRemoteCandidateType: string | null = null;
    let bytesReceived: number | null = null;
    let bytesSent: number | null = null;

    for (const r of stats.values()) {
      const t = (r as { type?: string }).type;
      if (t === "candidate-pair") {
        const nominated = (r as { nominated?: boolean }).nominated;
        const state = String((r as { state?: string }).state ?? "");
        if (nominated && state === "succeeded") {
          const crt = (r as { currentRoundTripTime?: number }).currentRoundTripTime;
          if (typeof crt === "number" && crt > 0) {
            roundTripTimeMs = crt * 1000;
          }
          const localId = (r as { localCandidateId?: string }).localCandidateId;
          const remoteId = (r as { remoteCandidateId?: string }).remoteCandidateId;
          if (localId) {
            selectedLocalCandidateType = candidates.get(localId)?.candidateType ?? null;
          }
          if (remoteId) {
            selectedRemoteCandidateType = candidates.get(remoteId)?.candidateType ?? null;
          }
        }
      }
      if (t === "inbound-rtp" || t === "remote-inbound-rtp") {
        const packetsReceived = (r as { packetsReceived?: number }).packetsReceived;
        const packetsLost = (r as { packetsLost?: number }).packetsLost;
        if (typeof packetsReceived === "number" && packetsReceived > 0) {
          const lost = typeof packetsLost === "number" ? packetsLost : 0;
          packetLossPercent = (lost / (packetsReceived + lost)) * 100;
        }
        const jitter = (r as { jitter?: number }).jitter;
        if (typeof jitter === "number") jitterMs = jitter * 1000;
      }
      if (t === "transport") {
        const br = (r as { bytesReceived?: number }).bytesReceived;
        const bs = (r as { bytesSent?: number }).bytesSent;
        if (typeof br === "number") bytesReceived = br;
        if (typeof bs === "number") bytesSent = bs;
      }
    }

    return {
      packetLossPercent,
      roundTripTimeMs,
      jitterMs,
      selectedLocalCandidateType,
      selectedRemoteCandidateType,
      bytesReceived,
      bytesSent,
    };
  } catch {
    return empty;
  }
}

export async function estimateInboundPacketLossPercent(pc: RTCPeerConnection): Promise<number | null> {
  try {
    const stats = await pc.getStats();
    let received = 0;
    let lost = 0;
    for (const r of stats.values()) {
      const t = (r as { type?: string }).type;
      if (t === "inbound-rtp" || t === "remote-inbound-rtp") {
        const packetsReceived = (r as { packetsReceived?: number }).packetsReceived;
        const packetsLost = (r as { packetsLost?: number }).packetsLost;
        if (typeof packetsReceived === "number" && packetsReceived > 0) {
          received += packetsReceived;
          lost += typeof packetsLost === "number" ? packetsLost : 0;
        }
      }
    }
    if (received === 0) return null;
    return (lost / (received + lost)) * 100;
  } catch {
    return null;
  }
}
