import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchCommunityMessengerHomeSilentLists,
  resetCommunityMessengerHomeSilentListsClientStateForTests,
} from "@/lib/community-messenger/cm-home-silent-lists-fetch";
import {
  clearBootstrapCache,
  getBootstrapCacheNetworkConfirmedAgeMs,
  noteBootstrapCacheNetworkConfirmedNow,
  primeBootstrapCache,
} from "@/lib/community-messenger/bootstrap-cache";
import type { CommunityMessengerBootstrap } from "@/lib/community-messenger/types";

/** 1단계 결함 D-7 W2 (2026-10-26): 목록 복귀 때 서버(라우트 메모리 캐시·replay 우회) 정합 1회. */

describe("D-7 W2 목록 복귀 정합", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetCommunityMessengerHomeSilentListsClientStateForTests();
  });

  it("serverFresh: home-sync critical 을 fresh=1 로 요청(라우트 메모리 캐시 우회)", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string) => {
        urls.push(String(u));
        return new Response(JSON.stringify({ ok: true, chats: [], groups: [] }), { status: 200 });
      })
    );
    await fetchCommunityMessengerHomeSilentLists({ tier: "critical", forceNetwork: true, serverFresh: true });
    expect(urls[0]).toBe("/api/community-messenger/home-sync?tier=critical&fresh=1");
    await fetchCommunityMessengerHomeSilentLists({ tier: "critical", forceNetwork: true });
    expect(urls[1]).toBe("/api/community-messenger/home-sync?tier=critical");
  });

  it("서버 응답이 캐시와 같아 기록이 생략돼도 확인 시각은 갱신", () => {
    clearBootstrapCache();
    noteBootstrapCacheNetworkConfirmedNow(); // 캐시 없음 → 무시
    expect(getBootstrapCacheNetworkConfirmedAgeMs()).toBeNull();
    primeBootstrapCache({ me: null, chats: [], groups: [] } as unknown as CommunityMessengerBootstrap);
    noteBootstrapCacheNetworkConfirmedNow();
    expect(getBootstrapCacheNetworkConfirmedAgeMs()).not.toBeNull();
  });

  it("복귀 memory paint 뒤 서버 확인 10초 이상이면 정합 1회 (계약)", () => {
    const src = readFileSync(join(process.cwd(), "lib/community-messenger/home/use-community-messenger-home-bootstrap.ts"), "utf8");
    const paint = src.slice(src.indexOf("if (memoryFresh) {"), src.indexOf("void refreshRef.current(false);", src.indexOf("if (memoryFresh) {")));
    expect(paint).toContain("getBootstrapCacheNetworkConfirmedAgeMs()");
    expect(paint).toContain("HOME_LIST_RETURN_RECONCILE_MIN_AGE_MS");
    expect(paint).toContain("reconcileListAfterReturnRef.current()");
    expect(src).toContain('serverFresh: true');
    expect(src).toContain('"critical_patch");\n      } catch {');
  });
});
