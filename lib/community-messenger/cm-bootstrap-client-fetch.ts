"use client";

/**
 * 메신저 앱 부트스트랩 GET — 동시 호출(React Strict Mode 이중 마운트·탭 전환 레이스)을 한 번의 fetch 로 합친다.
 * @see docs/trade-lightweight-design.md — `SAMARKET_LIGHTWEIGHT_GOALS.fetchOnceOnServer` 의 클라이언트 대응(단일 비행).
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

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
  return runSingleFlight(flightKey(mode), () =>
    fetch(url, { cache: "no-store", credentials: "include" })
  );
}
