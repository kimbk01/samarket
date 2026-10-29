/**
 * 묶음 4 — PATCH /api/me/stores/[storeId]
 * O-04 관리자 숨김 잠금: 잠금이면 is_visible=true → 409 admin_visibility_locked (끄기는 허용)
 * O-03 프로필·갤러리 교체: 빠진 이전 파일 중 다른 행에서 참조되지 않는 것만 Storage 삭제
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const gateResult = vi.fn();
const loadRefs = vi.fn();
const removeUrls = vi.fn();

type Row = Record<string, unknown>;
let currentRow: Row;
let lockRow: Row | null;
let lockError: { message: string } | null;
let updates: Row[];

function makeSb() {
  return {
    from(_table: string) {
      let patch: Row | null = null;
      let selected = "";
      const b = {
        select: (cols?: string) => {
          if (!patch && typeof cols === "string") selected = cols;
          return b;
        },
        eq: () => b,
        update: (p: Row) => {
          patch = { ...p };
          updates.push(patch);
          return b;
        },
        maybeSingle: async () => {
          if (patch) return { data: { ...currentRow, ...patch, id: "store-1", slug: "store-one" }, error: null };
          if (selected === "admin_visibility_locked") return { data: lockRow, error: lockError };
          return { data: currentRow, error: null };
        },
      };
      return b;
    },
  };
}

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => "owner-1" }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => makeSb() }));
vi.mock("@/lib/stores/owner-product-gate", () => ({ getStoreIfOwner: async () => gateResult() }));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: vi.fn(async () => undefined) }));
vi.mock("@/lib/audit/request-meta", () => ({ getAuditRequestMeta: () => ({ ip: null, userAgent: null }) }));
vi.mock("@/lib/admin/notifications/admin-notification-service", () => ({
  createAdminNotification: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: vi.fn(),
}));
vi.mock("@/lib/stores/after-canonical-store-location-write", () => ({ afterCanonicalStoreLocationWrite: vi.fn() }));
vi.mock("@/lib/stores/sync-store-orders-checkout-geo", () => ({
  refreshStoreOrdersCheckoutGeoAfterStoreLocationChanged: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/me/load-me-stores-for-user", () => ({ invalidateMeStoresListServerCache: vi.fn() }));
vi.mock("@/lib/stores/store-product-images-orphan-gc.server", () => ({
  loadStoreImageReferencedPaths: (...a: unknown[]) => loadRefs(...a),
}));
vi.mock("@/lib/media/canonical-image-lifecycle.server", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, removeCanonicalImagesFromPublicUrls: (...a: unknown[]) => removeUrls(...a) };
});

import { PATCH } from "@/app/api/me/stores/[storeId]/route";

const ctx = { params: Promise.resolve({ storeId: "store-1" }) };
function req(body: unknown) {
  return new Request("http://localhost/api/me/stores/store-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}
function gate(approval_status = "approved") {
  gateResult.mockReturnValue({
    ok: true,
    store: { id: "store-1", owner_user_id: "owner-1", approval_status, owner_can_edit_store_identity: false },
  });
}
const U = (name: string, storeId = "store-1") =>
  `https://x.supabase.co/storage/v1/object/public/store-product-images/${storeId}/${name}`;

describe("owner store PATCH — 묶음 4 O-04 관리자 숨김 잠금", () => {
  beforeEach(() => {
    gateResult.mockReset();
    loadRefs.mockReset();
    removeUrls.mockReset();
    updates = [];
    lockRow = { admin_visibility_locked: false };
    lockError = null;
    currentRow = { is_visible: false, profile_image_url: null, gallery_images_json: [] };
  });

  it("잠금 매장: is_visible=true → 409 admin_visibility_locked, 저장 없음", async () => {
    gate();
    lockRow = { admin_visibility_locked: true };
    const res = await PATCH(req({ is_visible: true }), ctx);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("admin_visibility_locked");
    expect(updates).toHaveLength(0);
  });

  it("잠금 매장이라도 끄기(is_visible=false)는 허용", async () => {
    gate();
    lockRow = { admin_visibility_locked: true };
    currentRow.is_visible = true;
    const res = await PATCH(req({ is_visible: false }), ctx);
    expect(res.status).toBe(200);
    expect(updates[0]).toEqual({ is_visible: false });
  });

  it("잠금 없음: is_visible=true 저장", async () => {
    gate();
    const res = await PATCH(req({ is_visible: true }), ctx);
    expect(res.status).toBe(200);
    expect(updates[0]).toEqual({ is_visible: true });
  });

  it("배포 순서 보호: 잠금 컬럼 부재 오류 = 잠금 없음", async () => {
    gate();
    lockRow = null;
    lockError = { message: 'column stores.admin_visibility_locked does not exist' };
    const res = await PATCH(req({ is_visible: true }), ctx);
    expect(res.status).toBe(200);
  });

  it("잠금 조회 실패(다른 오류) = 500, 저장 없음", async () => {
    gate();
    lockRow = null;
    lockError = { message: "timeout" };
    const res = await PATCH(req({ is_visible: true }), ctx);
    expect(res.status).toBe(500);
    expect(updates).toHaveLength(0);
  });
});

describe("owner store PATCH — 묶음 4 O-03 매장 이미지 교체 정리", () => {
  beforeEach(() => {
    gateResult.mockReset();
    loadRefs.mockReset();
    removeUrls.mockReset();
    removeUrls.mockResolvedValue({ attempted: [], removed: [], failed: [] });
    updates = [];
    lockRow = { admin_visibility_locked: false };
    lockError = null;
    currentRow = {
      is_visible: true,
      profile_image_url: U("old-profile.l1.jpg"),
      gallery_images_json: [U("g1.jpg"), U("g2.jpg"), "https://cdn.example.com/ext.jpg", U("x.jpg", "store-2")],
    };
  });

  it("교체로 빠진 파일 중 참조 없는 것만 삭제 (다른 행 참조·다른 매장·외부 URL 보존)", async () => {
    gate();
    // g2 는 상품 행이 여전히 참조 → 보존. 새 프로필은 저장 후 매장 행이 참조.
    loadRefs.mockResolvedValue({
      ok: true,
      paths: new Set(["store-1/new-profile.jpg", "store-1/g2.jpg"]),
      storeExists: true,
    });
    const res = await PATCH(
      req({ profile_image_url: U("new-profile.jpg"), gallery_images_json: [] }),
      ctx
    );
    expect(res.status).toBe(200);
    expect(loadRefs).toHaveBeenCalledTimes(1);
    expect(removeUrls).toHaveBeenCalledTimes(1);
    const urls = (removeUrls.mock.calls[0]![0] as { urls: string[] }).urls;
    expect(urls.sort()).toEqual([U("g1.jpg"), U("old-profile.l1.jpg")].sort());
  });

  it("참조 조회 실패 = 삭제하지 않음 (fail-closed), 저장은 성공", async () => {
    gate();
    loadRefs.mockResolvedValue({ ok: false });
    const res = await PATCH(req({ profile_image_url: U("new-profile.jpg") }), ctx);
    expect(res.status).toBe(200);
    expect(removeUrls).not.toHaveBeenCalled();
  });

  it("이미지 필드 변경이 없으면 참조 조회·삭제 없음", async () => {
    gate();
    const res = await PATCH(req({ is_open: false }), ctx);
    expect(res.status).toBe(200);
    expect(loadRefs).not.toHaveBeenCalled();
    expect(removeUrls).not.toHaveBeenCalled();
  });

  it("같은 이미지를 다시 보내면(빠진 파일 없음) 삭제 없음", async () => {
    gate();
    const res = await PATCH(req({ profile_image_url: U("old-profile.l1.jpg") }), ctx);
    expect(res.status).toBe(200);
    expect(loadRefs).not.toHaveBeenCalled();
    expect(removeUrls).not.toHaveBeenCalled();
  });
});
