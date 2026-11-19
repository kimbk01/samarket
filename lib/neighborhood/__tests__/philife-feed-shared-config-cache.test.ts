/**
 * 2026-11-20 — 동네 피드 고정값 3개 인스턴스 공유 캐시.
 * 공유 캐시가 성공하면 DB 를 다시 읽지 않고, 실패하면 지금처럼 직접 읽는다. 동네 「없음」은 다시 읽지 않는다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateTag = vi.fn();
/** 테스트에서는 캐시 없이 함수를 그대로 부른다(공유 캐시 동작은 Next 가 책임) */
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
  revalidateTag: (...a: unknown[]) => revalidateTag(...a),
}));

const sharedFrom = vi.fn();
const sharedRpc = vi.fn();
vi.mock("@/lib/chat/supabase-server", () => ({
  getSupabaseServer: () => ({ from: sharedFrom, rpc: sharedRpc }),
}));

import {
  clearCommunityImportPrincipalCache,
  loadCommunityImportPrincipalUserId,
} from "@/lib/community/community-import-principal";
import { clearPhilifeDefaultSectionTopicsCache } from "@/lib/neighborhood/philife-neighborhood-topics";
import { PHILIFE_FEED_TOPICS_CACHE_TAG } from "@/lib/neighborhood/philife-feed-shared-config-cache.server";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

function principalQuery(result: { data: unknown; error: unknown }) {
  return { select: () => ({ limit: () => ({ maybeSingle: async () => result }) }) };
}

beforeEach(() => {
  sharedFrom.mockReset();
  sharedRpc.mockReset();
  revalidateTag.mockReset();
  clearCommunityImportPrincipalCache();
});

describe("가져오기 계정 id", () => {
  it("공유 캐시 경로 성공 → 호출부 클라이언트는 쓰지 않는다", async () => {
    sharedFrom.mockReturnValue(principalQuery({ data: { user_id: " u-1 " }, error: null }));
    const callerFrom = vi.fn();
    expect(await loadCommunityImportPrincipalUserId({ from: callerFrom } as never)).toBe("u-1");
    expect(callerFrom).not.toHaveBeenCalled();
    // 같은 인스턴스 두 번째는 메모리
    expect(await loadCommunityImportPrincipalUserId({ from: callerFrom } as never)).toBe("u-1");
    expect(sharedFrom).toHaveBeenCalledTimes(1);
  });

  it("공유 캐시 경로 실패 → 지금처럼 호출부 클라이언트로 직접", async () => {
    sharedFrom.mockReturnValue(principalQuery({ data: null, error: { message: "boom" } }));
    const callerFrom = vi.fn(() => principalQuery({ data: { user_id: "u-2" }, error: null }));
    expect(await loadCommunityImportPrincipalUserId({ from: callerFrom } as never)).toBe("u-2");
    expect(callerFrom).toHaveBeenCalledTimes(1);
  });
});

describe("주제 목록 — 관리자 저장 시 모든 인스턴스 캐시 만료", () => {
  it("clearPhilifeDefaultSectionTopicsCache 가 공유 캐시 태그를 즉시 만료", () => {
    clearPhilifeDefaultSectionTopicsCache();
    expect(revalidateTag).toHaveBeenCalledWith(PHILIFE_FEED_TOPICS_CACHE_TAG, { expire: 0 });
  });

  it("주제 RPC 는 공유 캐시를 먼저 쓰고, 실패면 직접 조회", () => {
    const src = read("lib/neighborhood/philife-neighborhood-topics.ts");
    const shared = src.indexOf("await loadPhilifeFeedTopicsRpcRootShared()");
    const direct = src.indexOf('sb.rpc("philife_list_default_section_topics_for_feed")');
    expect(shared).toBeGreaterThan(0);
    expect(direct).toBeGreaterThan(shared);
  });
});

describe("동네 id", () => {
  it("읽기 전용 조회: 「없음」은 캐시하지 않고 다시 조회하지도 않는다", () => {
    const src = read("lib/neighborhood/ensure-location.ts");
    expect(src).toContain('if (!r.locationId) throw new Error("location_not_found")');
    expect(src).toContain('if (e instanceof Error && e.message === "location_not_found") return null;');
  });

  it("시/군 묶음: 동네 표 전체를 공유 캐시로 읽고, 실패면 직접", () => {
    const src = read("lib/neighborhood/lgu-location.server.ts");
    const shared = src.indexOf("await loadNeighborhoodLocationRowsShared()");
    const direct = src.indexOf('await sb.from("locations").select("id, city, name")');
    expect(shared).toBeGreaterThan(0);
    expect(direct).toBeGreaterThan(shared);
  });
});
