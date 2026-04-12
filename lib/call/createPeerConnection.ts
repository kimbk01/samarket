import { fetchMessengerIceServers } from "./ice-servers";

export type CreatePeerConnectionOptions = {
  iceServers?: RTCIceServer[];
};

/**
 * 표준 RTCPeerConnection 생성 — 직접 통화(`useCommunityMessengerCall`) 경로와 공유.
 */
export async function createMessengerPeerConnection(options?: CreatePeerConnectionOptions): Promise<RTCPeerConnection> {
  const iceServers = options?.iceServers ?? (await fetchMessengerIceServers());
  return new RTCPeerConnection({ iceServers });
}
