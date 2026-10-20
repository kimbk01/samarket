import { describe, expect, it } from "vitest";
import { enrichPlatformPopupOwnerRequestsForAdmin } from "@/lib/platform-popup/enrich-admin-request-presentation";
import type { PlatformPopupOwnerRequestRow } from "@/lib/platform-popup/owner-request-types";

/** 운영 stores 에는 store_name 만 있다 — 없는 열(name)을 조회하면 PostgREST 오류 (실측 결함: 매장 이름 항상 빈 값) */
function fakeSb(opts: { storesError?: string } = {}) {
  const selects: Record<string, string> = {};
  return {
    selects,
    from(table: string) {
      return {
        select(cols: string) {
          selects[table] = cols;
          return {
            in: async () => {
              if (table === "stores") {
                if (opts.storesError) return { data: null, error: { message: opts.storesError } };
                if (/\bname\b/.test(cols.replace("store_name", ""))) {
                  return { data: null, error: { message: 'column stores.name does not exist' } };
                }
                return { data: [{ id: "s1", store_name: "나의 오른손딸방" }], error: null };
              }
              return { data: [{ id: "u1", username: "owner1", nickname: "사장님" }], error: null };
            },
          };
        },
      };
    },
  };
}

const item = { id: "r1", storeId: "s1", ownerUserId: "u1" } as unknown as PlatformPopupOwnerRequestRow;

describe("관리자 팝업 신청 — 매장 이름 (stores.store_name)", () => {
  it("실제 열만 조회하고 매장 이름·사장님 표시를 채운다", async () => {
    const sb = fakeSb();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [row] = await enrichPlatformPopupOwnerRequestsForAdmin(sb as any, [item]);
    expect(sb.selects.stores).toBe("id, store_name");
    expect(row.storeName).toBe("나의 오른손딸방");
    expect(row.ownerLabel).toBe("사장님");
    expect(row.ownerUsername).toBe("owner1");
  });

  it("조회 오류는 빈 이름으로 덮지 않고 올린다", async () => {
    const sb = fakeSb({ storesError: "boom" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(enrichPlatformPopupOwnerRequestsForAdmin(sb as any, [item])).rejects.toThrow("popup_request_stores:boom");
  });
});
