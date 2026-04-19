"use client";

/**
 * 메신저 앱 부트스트랩 GET — 동시 호출(React Strict Mode 이중 마운트·탭 전환 레이스)을 한 번의 fetch 로 합친다.
 * @see docs/trade-lightweight-design.md — `SAMARKET_LIGHTWEIGHT_GOALS.fetchOnceOnServer` 의 클라이언트 대응(단일 비행).
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";
import {
  bumpAppWidePerf,
  recordAppWidePhaseLastMs,
  recordMessengerHomeBootstrapClientNetworkFetch,
  tryTrackFirstMenuListFetchStart,
  tryTrackFirstMenuListFetchSuccess,
} from "@/lib/runtime/samarket-runtime-debug";

export type CommunityMessengerClientBootstrapMode = "lite" | "full" | "fresh";

const flightKey = (mode: CommunityMessengerClientBootstrapMode) =>
  `community-messenger:client:bootstrap:${mode}`;

export function fetchCommunityMessengerBootstrapClient(
  mode: CommunityMessengerClientBootstrapMode
): Promise<Response> {
  const url =
    mode === "fresh"
      ? "/api/community-messenger/bootstrap?fresh=1"
      : mode === "lite"
        ? "/api/community-messenger/bootstrap?lite=1"
        : "/api/community-messenger/bootstrap";
  return runSingleFlight(flightKey(mode), async () => {
    tryTrackFirstMenuListFetchStart();
    bumpAppWidePerf("messenger_list_fetch_start");
    const t0 = performance.now();
    recordMessengerHomeBootstrapClientNetworkFetch(mode);
    const tNet0 = performance.now();
    const res = await fetch(url, { cache: "no-store", credentials: "include" });
    recordAppWidePhaseLastMs("messenger_bootstrap_fetch_network_ms", Math.round(performance.now() - tNet0));
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
