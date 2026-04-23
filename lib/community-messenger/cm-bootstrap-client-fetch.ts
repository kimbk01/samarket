"use client";

/**
 * 메신저 앱 부트스트랩 GET — 동시 호출(React Strict Mode 이중 마운트·탭 전환 레이스)을 한 번의 fetch 로 합친다.
 * @see docs/trade-lightweight-design.md — `SAMARKET_LIGHTWEIGHT_GOALS.fetchOnceOnServer` 의 클라이언트 대응(단일 비행).
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import { peekBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import {
  beginMessengerBootstrapClientPhase,
  bumpAppWidePerf,
  recordAppWidePhaseLastMs,
  recordMessengerBootstrapResponseSizeBytes,
  recordMessengerHomeBootstrapClientNetworkFetch,
  tryTrackFirstMenuListFetchStart,
  tryTrackFirstMenuListFetchSuccess,
} from "@/lib/runtime/samarket-runtime-debug";

export type CommunityMessengerClientBootstrapMode = "lite" | "full" | "fresh";

const flightKey = (mode: CommunityMessengerClientBootstrapMode) =>
  `community-messenger:client:bootstrap:${mode}`;

function readResponseSizeBytes(response: Response, requestUrl: string): number | null {
  const headerValue = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(headerValue) && headerValue > 0) return headerValue;
  if (typeof performance === "undefined" || typeof location === "undefined") return null;
  const absoluteUrl = response.url || new URL(requestUrl, location.origin).toString();
  const entries = performance.getEntriesByName(absoluteUrl) as PerformanceResourceTiming[];
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (typeof entry.encodedBodySize === "number" && entry.encodedBodySize > 0) {
      return Math.round(entry.encodedBodySize);
    }
    if (typeof entry.decodedBodySize === "number" && entry.decodedBodySize > 0) {
      return Math.round(entry.decodedBodySize);
    }
  }
  return null;
}

function captureResponseSizeBytes(response: Response, requestUrl: string): void {
  const immediate = readResponseSizeBytes(response, requestUrl);
  if (typeof immediate === "number" && Number.isFinite(immediate) && immediate > 0) {
    recordMessengerBootstrapResponseSizeBytes(immediate);
    return;
  }
  const clone = response.clone();
  queueMicrotask(() => {
    void clone
      .arrayBuffer()
      .then((buffer) => {
        recordMessengerBootstrapResponseSizeBytes(buffer.byteLength);
      })
      .catch(() => {
        /* ignore measurement failure */
      });
  });
}

export function fetchCommunityMessengerBootstrapClient(
  mode: CommunityMessengerClientBootstrapMode
): Promise<Response> {
  /**
   * 빠른 탭 왕복(거래 ↔ 커뮤니티)에서는 최근 부트스트랩이 이미 session/memory cache에 있다.
   * 이 경우 lite 네트워크를 다시 호출하면 탭 전환 체감만 느려지므로, 즉시 캐시 응답으로 단락한다.
   */
  if (mode === "lite") {
    const cached = peekBootstrapCache();
    if (cached) {
      return Promise.resolve(
        new Response(JSON.stringify({ ok: true, ...cached }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    }
  }
  const url =
    mode === "fresh"
      ? "/api/community-messenger/bootstrap?fresh=1"
      : mode === "lite"
        ? "/api/community-messenger/bootstrap?lite=1"
        : "/api/community-messenger/bootstrap";
  return runSingleFlight(flightKey(mode), async () => {
    tryTrackFirstMenuListFetchStart();
    bumpAppWidePerf("messenger_list_fetch_start");
    beginMessengerBootstrapClientPhase(mode);
    const t0 = performance.now();
    recordMessengerHomeBootstrapClientNetworkFetch(mode);
    const tNet0 = performance.now();
    const res = await fetch(url, { cache: "no-store", credentials: "include" });
    recordAppWidePhaseLastMs("messenger_bootstrap_fetch_network_ms", Math.round(performance.now() - tNet0));
    captureResponseSizeBytes(res, url);
    bumpAppWidePerf("messenger_list_fetch_success");
    const wallMs = Math.round(performance.now() - t0);
    recordAppWidePhaseLastMs("messenger_list_fetch_ms", wallMs);
    recordAppWidePhaseLastMs("messenger_bootstrap_fetch_wall_ms", wallMs);
    tryTrackFirstMenuListFetchSuccess();
    const paintT0 = t0;
    queueMicrotask(() => {
      if (typeof requestAnimationFrame !== "function") return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const paintMs = Math.round(performance.now() - paintT0);
          recordAppWidePhaseLastMs("messenger_list_to_paint_ms", paintMs);
          recordAppWidePhaseLastMs("messenger_bootstrap_to_paint_ms", paintMs);
        });
      });
    });
    return res;
  });
}
