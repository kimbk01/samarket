"use client";

/**
 * 탐색 오픈그룹 목록 — idle 보강이 여러 경로에서 겹칠 때 fetch 단일화.
 * @see lib/community-messenger/home/use-community-messenger-home-bootstrap.ts (lite 후 discoverable 보강)
 */
import { runSingleFlight } from "@/lib/http/run-single-flight";

const FLIGHT_KEY = "community-messenger:client:open-groups:list";

export function fetchCommunityMessengerOpenGroupsClient(): Promise<Response> {
  return runSingleFlight(FLIGHT_KEY, () =>
    fetch("/api/community-messenger/open-groups", { cache: "no-store", credentials: "include" })
  );
}
