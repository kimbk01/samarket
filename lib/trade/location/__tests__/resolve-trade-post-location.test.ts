/** 거래 글 위치 SSOT — 서버가 글쓴이 주소 행으로 시/군·동네 칸을 정한다(화면 값 미사용) */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const rows = vi.hoisted(() => ({ list: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/addresses/user-address-service", () => ({
  listUserAddresses: async () => rows.list,
}));

import { resolveTradePostLocationForUser } from "@/lib/trade/location/resolve-trade-post-location.server";

const master = { id: "m", isDefaultMaster: true, canonicalLguId: "1381300000", appRegionId: "quezon", appCityId: "q1" };
const other = { id: "o", isDefaultMaster: false, canonicalLguId: "1380300000", appRegionId: "manila", appCityId: "m2" };

describe("resolveTradePostLocationForUser", () => {
  it("고른 주소가 본인 주소면 그 주소", async () => {
    rows.list = [master, other];
    expect(await resolveTradePostLocationForUser({} as never, "u", "o")).toEqual({
      tradeLguId: "1380300000",
      region: "manila",
      city: "m2",
      addressId: "o",
    });
  });

  it("남의 주소 id·없는 id 면 대표 주소", async () => {
    rows.list = [master, other];
    expect((await resolveTradePostLocationForUser({} as never, "u", "someone-else"))?.addressId).toBe("m");
    expect((await resolveTradePostLocationForUser({} as never, "u", null))?.tradeLguId).toBe("1381300000");
  });

  it("시/군 LGU 없는 주소면 null (글 저장 거부)", async () => {
    rows.list = [{ ...master, canonicalLguId: null }];
    expect(await resolveTradePostLocationForUser({} as never, "u", null)).toBeNull();
  });

  it("글쓰기 API 는 화면이 보낸 시/군·동네 칸 대신 서버 값으로 덮는다", () => {
    const src = readFileSync(join(process.cwd(), "app/api/posts/create/route.ts"), "utf8");
    expect(src).toContain("resolveTradePostLocationForUser");
    expect(src).toMatch(/parsed\.tradeLguId = loc\.tradeLguId/);
  });
});
