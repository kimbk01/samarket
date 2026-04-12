const DEFAULT_ICE: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

let cache: RTCIceServer[] | null = null;
let cacheExp = 0;
let inflight: Promise<RTCIceServer[]> | null = null;

function hasRelay(servers: RTCIceServer[]): boolean {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((value) => typeof value === "string" && /^turns?:/i.test(value));
  });
}

/** `/api/community-messenger/calls/ice-servers` — `useCommunityMessengerCall` 과 동일 소스 */
export async function fetchMessengerIceServers(): Promise<RTCIceServer[]> {
  if (typeof window === "undefined") return DEFAULT_ICE;
  if (cache && cacheExp > Date.now()) return cache;
  if (inflight) return inflight;
  inflight = fetch("/api/community-messenger/calls/ice-servers", { cache: "no-store" })
    .then(async (res) => {
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; iceServers?: RTCIceServer[] };
      if (!res.ok || !json.ok || !Array.isArray(json.iceServers) || json.iceServers.length === 0) {
        cache = DEFAULT_ICE;
        cacheExp = Date.now() + 10_000;
        return cache;
      }
      cache = json.iceServers;
      cacheExp = Date.now() + (hasRelay(json.iceServers) ? 5 * 60_000 : 60_000);
      return cache;
    })
    .catch(() => {
      cache = DEFAULT_ICE;
      cacheExp = Date.now() + 10_000;
      return cache;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
