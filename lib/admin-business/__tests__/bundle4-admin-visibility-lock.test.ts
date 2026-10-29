/**
 * 묶음 4 · O-04 — 관리자 노출 변경이 오너 재노출 잠금을 같은 UPDATE 로 건다/푼다.
 * set_store_visible(false) = 잠금 true · set_store_visible(true)·resume_store = 잠금 false.
 * 일괄 숨김(/api/admin/stores/bulk)은 같은 executeAdminStorePatchAction 을 매장마다 실행한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAdminStoreVisibilityLockPatch,
  isStoreAdminVisibilityLockColumnMissingError,
  ownerStoreVisibilityBlockedByAdminLock,
} from "@/lib/stores/store-admin-visibility-lock";

type Row = Record<string, unknown>;
let storeRow: Row;
let updates: Row[];
let updateErrors: Array<{ message: string } | null>;

function makeSb() {
  return {
    from(_table: string) {
      let patch: Row | null = null;
      const b = {
        select: () => b,
        eq: () => b,
        update: (p: Row) => {
          patch = { ...p };
          updates.push(patch);
          return b;
        },
        maybeSingle: async () => ({ data: storeRow, error: null }),
        then: (resolve: (v: unknown) => void) => {
          const err = patch ? (updateErrors.shift() ?? null) : null;
          resolve({ data: err ? null : [{ id: "s1" }], error: err });
        },
      };
      return b;
    },
  };
}

vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => makeSb() }));
/** 배민 미러링 S3 메뉴 확인은 이 표의 대상 밖 — 지정 메뉴 있음으로 둔다 (별도 테스트: store-delivery-menu-guard) */
vi.mock("@/lib/stores/delivery-menus/store-delivery-menu-guard.server", () => ({
  checkStoreDeliveryMenuBeforeExpose: async () => ({ ok: true }),
}));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/stores/store-home-feed-server-cache", () => ({ clearStoreHomeFeedServerCache: vi.fn() }));
vi.mock("@/lib/stores/store-public-cache-invalidate-server", () => ({
  invalidateStorePublicCachesForSlugOnServer: vi.fn(),
}));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: vi.fn(),
}));
vi.mock("@/lib/me/load-me-stores-for-user", () => ({ invalidateMeStoresListServerCache: vi.fn() }));
vi.mock("@/lib/admin-business/admin-store-decision", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, safeNotifyOwnerStoreDecision: vi.fn(async () => undefined) };
});

import { executeAdminStorePatchAction } from "@/lib/admin-business/execute-admin-store-patch-action.server";

const run = (body: Row) =>
  executeAdminStorePatchAction({
    id: "s1",
    body: body as never,
    actorId: "admin-9",
    requestMeta: { ip: null, userAgent: null },
  });

describe("묶음 4 O-04 — 잠금 순수 함수", () => {
  it("숨김 = 잠금 true + 시각·관리자, 노출 = 잠금 해제", () => {
    expect(buildAdminStoreVisibilityLockPatch(false, "admin-9", "2026-10-29T00:00:00.000Z")).toEqual({
      admin_visibility_locked: true,
      admin_visibility_locked_at: "2026-10-29T00:00:00.000Z",
      admin_visibility_locked_by: "admin-9",
    });
    expect(buildAdminStoreVisibilityLockPatch(true, "admin-9")).toEqual({
      admin_visibility_locked: false,
      admin_visibility_locked_at: null,
      admin_visibility_locked_by: null,
    });
  });

  it("오너는 잠금 상태에서 켜기만 막힌다", () => {
    expect(ownerStoreVisibilityBlockedByAdminLock(true, true)).toBe(true);
    expect(ownerStoreVisibilityBlockedByAdminLock(true, false)).toBe(false);
    expect(ownerStoreVisibilityBlockedByAdminLock(false, true)).toBe(false);
    expect(ownerStoreVisibilityBlockedByAdminLock(null, true)).toBe(false);
  });

  it("컬럼 부재 오류만 감지", () => {
    expect(isStoreAdminVisibilityLockColumnMissingError("column stores.admin_visibility_locked does not exist")).toBe(true);
    expect(
      isStoreAdminVisibilityLockColumnMissingError("Could not find the 'admin_visibility_locked' column of 'stores' in the schema cache")
    ).toBe(true);
    expect(isStoreAdminVisibilityLockColumnMissingError("timeout")).toBe(false);
  });
});

describe("묶음 4 O-04 — 관리자 노출 변경이 잠금을 같이 저장", () => {
  beforeEach(() => {
    updates = [];
    updateErrors = [];
    storeRow = { id: "s1", owner_user_id: "owner-1", approval_status: "approved", is_visible: true, slug: "s-one" };
  });

  it("set_store_visible(false) → is_visible false + 잠금 true", async () => {
    const res = await run({ action: "set_store_visible", enabled: false });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({
      is_visible: false,
      admin_visibility_locked: true,
      admin_visibility_locked_by: "admin-9",
    });
    expect(typeof updates[0]!.admin_visibility_locked_at).toBe("string");
  });

  it("set_store_visible(true) → is_visible true + 잠금 해제", async () => {
    storeRow.is_visible = false;
    const res = await run({ action: "set_store_visible", enabled: true, reason: "노출 재개" });
    expect(res.status).toBe(200);
    expect(updates[0]).toEqual({
      is_visible: true,
      admin_visibility_locked: false,
      admin_visibility_locked_at: null,
      admin_visibility_locked_by: null,
    });
  });

  it("resume_store(운영 재개 = 노출 복구) → 잠금 해제", async () => {
    storeRow.approval_status = "suspended";
    storeRow.is_visible = false;
    const res = await run({ action: "resume_store", reason: "운영 재개" });
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ approval_status: "approved", is_visible: true, admin_visibility_locked: false });
  });

  it("배포 순서 보호: 잠금 컬럼 부재면 노출만 저장 (기존 동작)", async () => {
    updateErrors = [{ message: "column stores.admin_visibility_locked does not exist" }];
    const res = await run({ action: "set_store_visible", enabled: false });
    expect(res.status).toBe(200);
    expect(updates).toHaveLength(2);
    expect(updates[1]).toEqual({ is_visible: false });
  });
});
