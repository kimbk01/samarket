import { fetchMessengerIceServers } from "./ice-servers";
import { buildMessengerRtcConfiguration, type MessengerRtcConfigurationOptions } from "./webrtc-configuration";

export type CreatePeerConnectionOptions = {
  iceServers?: RTCIceServer[];
  rtcConfiguration?: MessengerRtcConfigurationOptions;
};

/**
 * 표준 RTCPeerConnection 생성 — 통화 클라(Agora·그룹 WebRTC 등)와 공유.
 */
export async function createMessengerPeerConnection(options?: CreatePeerConnectionOptions): Promise<RTCPeerConnection> {
  const iceServers = options?.iceServers ?? (await fetchMessengerIceServers());
  return new RTCPeerConnection(buildMessengerRtcConfiguration(iceServers, options?.rtcConfiguration));
}
