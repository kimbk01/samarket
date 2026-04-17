"use client";

import { primeBootstrapCache } from "@/lib/community-messenger/bootstrap-cache";
import { fetchCommunityMessengerBootstrapClient } from "@/lib/community-messenger/cm-bootstrap-client-fetch";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";
import { runSingleFlight } from "@/lib/http/run-single-flight";

/**
 * 하단 탭 `router.prefetch("/community-messenger")` 직후 등 — lite 부트스트랩을 한 번 받아
 * `primeBootstrapCache` 에 넣는다. 목록 탭·방에서 뒤로가기 시 `peekBootstrapCache` 로 첫 페인트가 막히지 않게 한다.
 * `fetchCommunityMessengerBootstrapClient("lite")` 와 동일 단일 비행 키 계열로 in-flight 를 합친다.
 */
export function warmMessengerListBootstrapClient(): void {
  if (typeof window === "undefined") return;
  void runSingleFlight("community-messenger:list-bootstrap-warm", async () => {
    const res = await fetchCommunityMessengerBootstrapClient("lite");
    if (!res.ok) return;
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!json || json.ok !== true) return;
    const payload = { ...json };
    delete payload.ok;
    primeBootstrapCache(payload as CommunityMessengerBootstrap);
  });
}
