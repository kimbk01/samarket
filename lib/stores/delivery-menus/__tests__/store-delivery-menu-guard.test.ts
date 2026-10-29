import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { checkStoreDeliveryMenuBeforeExpose } from "@/lib/stores/delivery-menus/store-delivery-menu-guard.server";

function sb(opts: { count: number; defaults: { category_id: string; topic_id: string | null; menu_id: string }[]; missing?: boolean }) {
  return {
    from(table: string) {
      if (table === "delivery_menu_store_overrides") {
        const q = {
          select: () => q,
          eq: () => q,
          then: (res: (v: unknown) => void) =>
            res(opts.missing ? { count: null, error: { message: 'relation "delivery_menu_store_overrides" does not exist' } } : { count: opts.count, error: null }),
        };
        return q;
      }
      return { select: async () => ({ data: opts.defaults, error: null }) };
    },
  } as never;
}

const store = { id: "s1", store_category_id: "c-rest", store_topic_id: "t-pizza" };

describe("안전장치 S3 — 노출 켜기·운영 재개 전 메뉴 확인", () => {
  it("지정 메뉴가 있으면 통과", async () => {
    expect(await checkStoreDeliveryMenuBeforeExpose(sb({ count: 2, defaults: [] }), store)).toEqual({ ok: true });
  });
  it("지정이 없어도 업종 기본 메뉴가 있으면 통과 (DB 트리거가 자동 배정)", async () => {
    expect(
      await checkStoreDeliveryMenuBeforeExpose(sb({ count: 0, defaults: [{ category_id: "c-rest", topic_id: null, menu_id: "m" }] }), store)
    ).toEqual({ ok: true });
  });
  it("지정도 기본 메뉴도 없으면 거부", async () => {
    expect(await checkStoreDeliveryMenuBeforeExpose(sb({ count: 0, defaults: [] }), store)).toEqual({
      ok: false,
      error: "delivery_menu_required",
    });
  });
  it("메뉴 표 미적용이면 검사 안 함 (복구 스위치)", async () => {
    expect(await checkStoreDeliveryMenuBeforeExpose(sb({ count: 0, defaults: [], missing: true }), store)).toEqual({ ok: true });
  });
});
