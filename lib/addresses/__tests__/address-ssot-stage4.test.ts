/**
 * 주소 SSOT 4단계 (Owner 2026-11-09 「다음으로 이어 가라」) — M3·L1·매장 생성·커뮤니티 글쓰기 회귀 고정.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { lguLocationRowId, resolveCommunityLocationIdsForLgu } from "@/lib/neighborhood/lgu-location.server";
import { resolveNeighborhoodLocationId } from "@/lib/neighborhood/ensure-location";
import { computeStoreLocationColumns } from "@/lib/stores/store-location-columns.server";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** select 만 허용 — upsert/insert/update 를 부르면 실패 */
function readOnlySb(rows: Record<string, unknown>[] = []) {
  const writes = vi.fn();
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    ilike: self,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (res: (v: unknown) => unknown) => res({ data: rows, error: null }),
    upsert: (...a: unknown[]) => {
      writes(...a);
      return Promise.resolve({ error: null });
    },
    insert: (...a: unknown[]) => {
      writes(...a);
      return Promise.resolve({ error: null });
    },
  });
  return { sb: { from: () => chain } as never, writes };
}

describe("M3 — 커뮤니티 피드 조회는 DB 에 쓰지 않는다", () => {
  it("LGU 피드: 행을 만들지 않고 계산한 id 를 쓴다", async () => {
    const { sb, writes } = readOnlySb();
    const ids = await resolveCommunityLocationIdsForLgu(sb, "1381300000");
    expect(writes).not.toHaveBeenCalled();
    expect(ids).toContain(lguLocationRowId("1381300000"));
  });
  it("예전 키 피드: readOnly 면 없는 행을 만들지 않는다", async () => {
    const { sb, writes } = readOnlySb();
    const r = await resolveNeighborhoodLocationId(sb, "manila:m5:", { city: "Manila", name: "Quiapo" }, { readOnly: true });
    expect(writes).not.toHaveBeenCalled();
    expect(r.locationId).toBeNull();
  });
  it("피드 라우트는 조회 전용 함수만 쓴다", () => {
    const src = read("app/api/community/neighborhood-feed/route.ts");
    expect(src).toContain("findNeighborhoodLocationIdReadOnly");
    expect(src).not.toMatch(/\bensureLocationId\(/);
  });
});

describe("커뮤니티 글쓰기 — 동네는 서버가 시/군 LGU 로 정한다", () => {
  const src = read("app/api/community/neighborhood-posts/route.ts");
  it("예전 키는 LGU 로 변환, 확정 안 되면 invalid_key", () => {
    expect(src).toContain("legacyLocationRowToLguId(regionPart, cityPart)");
    expect(src).toContain('failure: "invalid_key"');
    expect(src).not.toContain("resolveNeighborhoodLocationId(sb, locationKey");
  });
  it("lgu 키도 공식 시/군인지 확인", () => {
    expect(src).toContain("lguPublicName(lguFromKey) ? lguFromKey : null");
  });
});

describe("L1 — 일괄 지역 변경은 끝난 글을 바꾸지 않는다", () => {
  const src = read("app/api/me/posts/bulk-region/route.ts");
  it("완료·숨김·취소 제외 후 id 로만 갱신", () => {
    expect(src).toContain('new Set(["completed", "hidden", "cancelled"])');
    expect(src).toContain('.in("id", targetIds.slice(i, i + 200))');
  });
});

describe("매장 새로 만들기 — 위치 칸을 같은 저장에서 결정", () => {
  it("POST /api/me/stores(신청 입력 공용 검사)가 computeStoreLocationColumns 를 쓴다", () => {
    expect(read("app/api/me/stores/route.ts")).toContain("parseStoreApplicationInput");
    expect(read("lib/stores/store-application-input.server.ts")).toContain("...computeStoreLocationColumns({");
  });
  it("Google 형식 매장 주소 → LGU·바랑가이", () => {
    const c = computeStoreLocationColumns({
      region: "Metro Manila",
      city: "Quezon City",
      district: "Sct. Tuason Street",
      address_line1: "Sct. Tuason Street",
      formatted_address: "Ra Cafe, 24k mansion, Sct. Tuason Street, Diliman, Quezon City, Metro Manila, Philippines",
    });
    expect(c.canonical_lgu_id).toBe("1381300000");
  });
});
