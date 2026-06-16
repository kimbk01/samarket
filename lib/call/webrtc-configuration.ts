export type MessengerRtcConfigurationOptions = {
  /**
   * TURN 강제 — ICE 실패 후 재구성 시 NAT 대칭 구간에서 릴레이만 시도.
   * @default "all"
   */
  iceTransportPolicy?: RTCIceTransportPolicy;
  iceCandidatePoolSize?: number;
};

/**
 * 커뮤니티 메신저 P2P(WebRTC) 공통 RTCConfiguration.
 * STUN/TURN 은 API `/api/community-messenger/calls/ice-servers` 가 채움.
 */
export function buildMessengerRtcConfiguration(
  iceServers: RTCIceServer[],
  options?: MessengerRtcConfigurationOptions
): RTCConfiguration {
  return {
    iceServers,
    iceTransportPolicy: options?.iceTransportPolicy ?? "all",
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    /** Chromium: ICE 수집을 미리 시작해 첫 후보까지 시간 단축(환경에 따라 무시될 수 있음) */
    iceCandidatePoolSize:
      options?.iceCandidatePoolSize ??
      (typeof RTCPeerConnection !== "undefined" ? 12 : 0),
  };
}

/** 연결 후 비디오 우선순위: 프레임 유지(오디오·화면 끊김 완화) — 오디오는 기본 우선 */
export async function applyVideoSenderDegradationPreference(
  connection: RTCPeerConnection,
  preference: RTCDegradationPreference
): Promise<void> {
  const sender = connection.getSenders().find((s) => s.track?.kind === "video");
  if (!sender) return;
  const params = sender.getParameters();
  if (!params.encodings || params.encodings.length === 0) {
    params.encodings = [{}];
  }
  params.degradationPreference = preference;
  try {
    await sender.setParameters(params);
  } catch {
    /* 일부 브라우저/상태에서 미지원 */
  }
}

/** 느린 링크: 송신 비디오 비트레이트·해상도 상한 (Unified Plan) */
export async function applyVideoSenderBandwidthCap(
  connection: RTCPeerConnection,
  maxBitrate: number,
  scaleResolutionDownBy?: number
): Promise<void> {
  const sender = connection.getSenders().find((s) => s.track?.kind === "video");
  if (!sender) return;
  const params = sender.getParameters();
  const enc = params.encodings?.length ? [...params.encodings] : [{}];
  enc[0] = {
    ...enc[0],
    maxBitrate,
    ...(scaleResolutionDownBy != null ? { scaleResolutionDownBy } : {}),
  };
  params.encodings = enc;
  try {
    await sender.setParameters(params);
  } catch {
    /* ignore */
  }
}
