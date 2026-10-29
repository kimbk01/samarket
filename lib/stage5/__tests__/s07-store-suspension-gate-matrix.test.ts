/**
 * 5단계 S07 (L1) — 매장 정지·승인(관리자) → 오너 접근·주문자 노출.
 * 문서 G-2 §5-2 S07 · §5-4 「3-C 쿠폰 → S07(정지 시 쿠폰 쓰기 403)」 「3-D 광고 → S07(배너)」.
 *
 * 1) 게이트 매트릭스: approval_status × 오너 운영 쓰기 라우트(실제 핸들러) — 정지 403 `store_suspended`,
 *    미승인 403 `store_not_approved`, 차단 시 쓰기·RPC 0건. 매장 정보·배달 지역 편집은 온보딩 허용 규칙.
 * 2) 진행 주문·주문 채팅 라우트는 운영 쓰기 게이트를 쓰지 않는다 (D-16 — 정지 매장도 진행 주문 처리).
 * 3) 주문자: 정지 매장 직접 URL 결제 거부(`store_unavailable`, 주문 RPC 미호출).
 * 4) 오너 탈퇴(ACC-03): 판매 중지 + 비노출, 회원 정지(suspend)는 노출 유지.
 * 5) 관리자 PATCH 전이표(승인·정지·해제): 비허용 전이 409, 사유 필수, 감사 1행, 오너 알림 1, 공용 캐시 세대 bump.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "owner-s07";
const STORE = "store-s07";

type Op = { table: string; kind: string; payload?: unknown };
const world = vi.hoisted(() => ({
  approval: "approved" as string,
  visible: true,
  ops: [] as Array<{ table: string; kind: string; payload?: unknown }>,
  rpcs: [] as string[],
}));
const spies = vi.hoisted(() => ({
  audit: vi.fn(async (..._a: unknown[]) => undefined),
  notifyOwner: vi.fn(async (..._a: unknown[]) => true),
  bump: vi.fn((..._a: unknown[]) => undefined),
  createOrder: vi.fn(async (..._a: unknown[]) => ({ ok: false, error: "should_not_be_called", httpStatus: 500 })),
  validateCheckout: vi.fn(async (..._a: unknown[]) => ({ ok: false, error: "validate_mock", httpStatus: 400 })),
}));

function builder(table: string) {
  const op: Op = { table, kind: "select" };
  world.ops.push(op);
  const terminal = () => {
    if (table === "stores" && op.kind === "update") return { data: [{ id: STORE }], error: null };
    if (table === "stores") {
      return {
        data: {
          id: STORE,
          owner_user_id: OWNER,
          approval_status: world.approval,
          owner_can_edit_store_identity: false,
          slug: "s07",
          store_name: "S07",
          lat: 14.6,
          lng: 121.0,
          is_visible: world.visible,
        },
        error: null,
      };
    }
    return { data: null, error: null };
  };
  const proxy: Record<string, unknown> = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") {
          return (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
            Promise.resolve(terminal()).then(res, rej);
        }
        if (prop === "maybeSingle" || prop === "single") return async () => terminal();
        if (prop === "insert" || prop === "update" || prop === "upsert" || prop === "delete") {
          return (payload?: unknown) => {
            op.kind = prop;
            op.payload = payload;
            return proxy;
          };
        }
        return () => proxy;
      },
    }
  );
  return proxy;
}

const sb = vi.hoisted(() => ({ current: null as unknown }));
function makeSb() {
  return {
    from: (t: string) => builder(t),
    rpc: async (name: string) => {
      world.rpcs.push(name);
      return { data: null, error: { message: "mock_rpc" } };
    },
    storage: {
      from: () => ({
        upload: async () => ({ data: null, error: { message: "mock_storage" } }),
        remove: async () => ({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: "https://x.test/a.png" } }),
      }),
    },
  };
}

vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => OWNER }));
vi.mock("@/lib/auth/server-guards", () => ({ validateActiveSession: async () => ({ ok: true }) }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => sb.current }));
/** 배민 미러링 S3 메뉴 확인은 이 표의 대상 밖 — 지정 메뉴 있음으로 둔다 (별도 테스트: store-delivery-menu-guard) */
vi.mock("@/lib/stores/delivery-menus/store-delivery-menu-guard.server", () => ({
  checkStoreDeliveryMenuBeforeExpose: async () => ({ ok: true }),
}));
vi.mock("@/lib/supabase/try-supabase-server", () => ({ tryCreateSupabaseServiceClient: () => sb.current }));
vi.mock("@/lib/stores/owner-store-ownership-cache", () => ({
  getCachedStoreIfOwner: async () => ({
    ok: true,
    store: { id: STORE, owner_user_id: OWNER, approval_status: world.approval, owner_can_edit_store_identity: false },
  }),
}));
vi.mock("@/lib/stores/store-public-shared-cache-generation", () => ({
  bumpStorePublicSharedCacheGeneration: (...a: unknown[]) => spies.bump(...a),
}));
vi.mock("@/lib/stores/revalidate-store-consumer-paths", () => ({ revalidateStoreConsumerPathsBySlug: vi.fn() }));
// 관리자 PATCH · ACC-03 · 체크아웃 라우트용
vi.mock("@/lib/admin/require-admin-permission", () => ({
  requireAdminPermission: async () => ({ ok: true, actor: { userId: "admin-s07" }, sb: sb.current }),
}));
vi.mock("@/lib/audit/append-audit-log", () => ({ appendAuditLog: (...a: unknown[]) => spies.audit(...a) }));
vi.mock("@/lib/audit/request-meta", () => ({ getAuditRequestMeta: () => ({ ip: null, userAgent: null }) }));
vi.mock("@/lib/admin-business/admin-store-decision", async () => {
  const rules = await vi.importActual<Record<string, unknown>>("@/lib/admin-business/admin-store-decision-rules");
  return { ...rules, safeNotifyOwnerStoreDecision: (...a: unknown[]) => spies.notifyOwner(...a) };
});
vi.mock("@/lib/stores/store-home-feed-server-cache", () => ({ clearStoreHomeFeedServerCache: vi.fn() }));
vi.mock("@/lib/stores/store-public-cache-invalidate-server", () => ({ invalidateStorePublicCachesForSlugOnServer: vi.fn() }));
vi.mock("@/lib/me/load-me-stores-for-user", () => ({ invalidateMeStoresListServerCache: vi.fn() }));
vi.mock("@/lib/auth/member-account-state", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  isProductWriteDeniedMemberAccount: () => false,
}));
vi.mock("@/lib/auth/require-signup-complete-api", () => ({ requireSignupCompleteForUser: async () => ({ ok: true }) }));
vi.mock("@/lib/profile/require-profile-completion.server", () => ({
  requireProfileFieldsForAction: async () => ({ ok: true }),
}));
vi.mock("@/lib/stores/validate-store-order-checkout", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  validateStoreOrderCheckout: (...a: unknown[]) => spies.validateCheckout(...a),
}));
vi.mock("@/lib/stores/create-store-order-atomic", () => ({
  createStoreOrderAtomic: (...a: unknown[]) => spies.createOrder(...a),
}));

import { POST as bannersPost } from "@/app/api/me/stores/[storeId]/banners/route";
import { PATCH as bannerPatch, DELETE as bannerDelete } from "@/app/api/me/stores/[storeId]/banners/[bannerId]/route";
import { POST as businessCashPost } from "@/app/api/me/stores/[storeId]/business-cash/route";
import { POST as deliveryAdsPost } from "@/app/api/me/stores/[storeId]/delivery-ads/route";
import {
  PATCH as deliveryAdPatch,
  DELETE as deliveryAdDelete,
} from "@/app/api/me/stores/[storeId]/delivery-ads/[campaignId]/route";
import { POST as deliveryAdActionsPost } from "@/app/api/me/stores/[storeId]/delivery-ads/[campaignId]/actions/route";
import { POST as deliveryAdMessagesPost } from "@/app/api/me/stores/[storeId]/delivery-ads/[campaignId]/messages/route";
import { POST as deliveryAdBannerPost } from "@/app/api/me/stores/[storeId]/delivery-ads/banner/route";
import { POST as deliveryAdUploadPost } from "@/app/api/me/stores/[storeId]/delivery-ads/upload-banner-image/route";
import { POST as withdrawalsPost } from "@/app/api/me/stores/[storeId]/finance/withdrawals/route";
import { POST as giftApplicationsPost } from "@/app/api/me/stores/[storeId]/gift-certificates/applications/route";
import { PATCH as inquiryPatch } from "@/app/api/me/stores/[storeId]/inquiries/[inquiryId]/route";
import { POST as noticesPost } from "@/app/api/me/stores/[storeId]/notices/route";
import { PATCH as noticePatch, DELETE as noticeDelete } from "@/app/api/me/stores/[storeId]/notices/[noticeId]/route";
import { PATCH as reviewReplyPatch } from "@/app/api/me/stores/[storeId]/reviews/[reviewId]/reply/route";
import { POST as partnerPost } from "@/app/api/me/delivery-ads/partner/route";
import { PUT as serviceAreasPut } from "@/app/api/me/stores/[storeId]/delivery-service-areas/route";
import { PATCH as adminStorePatch } from "@/app/api/admin/stores/[id]/route";
import { POST as storeOrdersPost } from "@/app/api/me/store-orders/route";
import { suspendOwnerStoreSalesOnMemberSanction } from "@/lib/admin-business/suspend-owner-store-sales-on-member-sanction";

type RouteParams = {
  storeId: string;
  bannerId: string;
  campaignId: string;
  inquiryId: string;
  noticeId: string;
  reviewId: string;
};
type Handler = (req: NextRequest, ctx: { params: Promise<RouteParams> }) => Promise<Response>;

const params: RouteParams = {
  storeId: STORE,
  bannerId: "b1",
  campaignId: "c1",
  inquiryId: "i1",
  noticeId: "n1",
  reviewId: "r1",
};

function req(method: string, body?: unknown): NextRequest {
  return new NextRequest(`https://x.test/api/me/stores/${STORE}/s07`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** 운영 쓰기 — 승인 매장만 (1-B IA-03 · DEF-71). */
const OPERATIONAL: Array<[string, Handler, string, unknown]> = [
  ["banners POST", bannersPost as Handler, "POST", { image_url: "https://x.test/a.png" }],
  ["banners/[id] PATCH", bannerPatch as Handler, "PATCH", { is_active: false }],
  ["banners/[id] DELETE", bannerDelete as Handler, "DELETE", undefined],
  ["business-cash POST topup", businessCashPost as Handler, "POST", { op: "topup_request", amountMinor: 100, idempotencyKey: "k" }],
  ["delivery-ads POST", deliveryAdsPost as Handler, "POST", { productKind: "store_sponsored" }],
  ["delivery-ads/[id] PATCH", deliveryAdPatch as Handler, "PATCH", { productKind: "store_sponsored" }],
  ["delivery-ads/[id] DELETE", deliveryAdDelete as Handler, "DELETE", undefined],
  ["delivery-ads/[id]/actions POST submit", deliveryAdActionsPost as Handler, "POST", { action: "submit", productKind: "store_sponsored" }],
  ["delivery-ads/[id]/messages POST", deliveryAdMessagesPost as Handler, "POST", { body: "hello" }],
  ["delivery-ads/banner POST", deliveryAdBannerPost as Handler, "POST", { title: "t" }],
  ["delivery-ads/upload-banner-image POST", deliveryAdUploadPost as Handler, "POST", undefined],
  ["finance/withdrawals POST", withdrawalsPost as Handler, "POST", { amount: 100, idempotencyKey: "k" }],
  ["gift-certificates/applications POST", giftApplicationsPost as Handler, "POST", { title: "g" }],
  ["inquiries/[id] PATCH", inquiryPatch as Handler, "PATCH", { answer: "a" }],
  ["notices POST", noticesPost as Handler, "POST", { title: "t", body: "b", placement: "store_top" }],
  ["notices/[id] PATCH", noticePatch as Handler, "PATCH", { title: "t" }],
  ["notices/[id] DELETE", noticeDelete as Handler, "DELETE", undefined],
  ["reviews/[id]/reply PATCH", reviewReplyPatch as Handler, "PATCH", { reply: "thanks" }],
  ["delivery-ads/partner POST apply", partnerPost as Handler, "POST", { op: "apply", storeId: STORE }],
];

const WRITE_KINDS = new Set(["insert", "update", "upsert", "delete"]);
const writes = () => world.ops.filter((o) => WRITE_KINDS.has(o.kind));

async function call(h: Handler, method: string, body: unknown) {
  const res = await h(req(method, body), { params: Promise.resolve(params) });
  let json: Record<string, unknown> = {};
  try {
    json = (await res.json()) as Record<string, unknown>;
  } catch {
    /* non-json */
  }
  return { status: res.status, error: json.error };
}

beforeEach(() => {
  world.ops.length = 0;
  world.rpcs.length = 0;
  world.visible = true;
  sb.current = makeSb();
  vi.clearAllMocks();
});

describe("S07 L1 — approval_status × 오너 운영 쓰기 라우트 게이트 매트릭스", () => {
  const BLOCKED: Array<[string, string]> = [
    ["suspended", "store_suspended"],
    ["pending", "store_not_approved"],
    ["under_review", "store_not_approved"],
    ["revision_requested", "store_not_approved"],
    ["rejected", "store_not_approved"],
  ];

  for (const [name, h, method, body] of OPERATIONAL) {
    it.each(BLOCKED)(`${name}: %s → 403 %s, 쓰기·RPC 0건`, async (status, code) => {
      world.approval = status;
      const r = await call(h, method, body);
      expect(r).toEqual({ status: 403, error: code });
      expect(writes()).toEqual([]);
      expect(world.rpcs).toEqual([]);
    });

    it(`${name}: approved → 매장 상태 게이트 통과 (store_* 거부 없음)`, async () => {
      world.approval = "approved";
      let r: { status: number; error: unknown } | null = null;
      try {
        r = await call(h, method, body);
      } catch {
        // mock DB 이후 단계의 예외 — 게이트는 이미 통과했다 (stores 조회 이후).
      }
      if (r) expect(["store_suspended", "store_not_approved"]).not.toContain(r.error);
      expect(world.ops.some((o) => o.table === "stores")).toBe(true);
    });
  }
  // 쿠폰 캠페인 POST·PATCH 정지 403 은 기존 라우트 테스트가 증명 (매트릭스 J 문서 참조):
  //  owner-create-funding-route.contract.test.ts CASE 6 · owner-coupon-transition-route.test.ts「suspended store → 403 gate」.
});

describe("S07 L1 — 매장 정보·배달 지역 편집은 온보딩 허용, 정지·반려 차단 (ownerStoreProfileWriteBlock)", () => {
  const body = { selectedLguIds: ["lgu-a"], expectedAreasVersion: null };
  it.each([
    ["suspended", 403, "store_suspended"],
    ["rejected", 403, "store_not_approved"],
  ])("delivery-service-areas PUT: %s → %s %s, 교체 RPC 미호출", async (status, code, error) => {
    world.approval = status;
    const r = await call(serviceAreasPut as Handler, "PUT", body);
    expect(r).toEqual({ status: code, error });
    expect(world.rpcs).toEqual([]);
    expect(writes()).toEqual([]);
  });

  it.each(["approved", "pending", "under_review", "revision_requested"])(
    "delivery-service-areas PUT: %s → 게이트 통과",
    async (status) => {
      world.approval = status;
      const r = await call(serviceAreasPut as Handler, "PUT", body);
      expect(["store_suspended", "store_not_approved"]).not.toContain(r.error);
    }
  );
});

describe("S07 L1 — 정지 매장 진행 주문·주문 채팅 라우트는 운영 쓰기 게이트 미사용 (D-16)", () => {
  function listRoutes(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name === "__tests__") continue;
        out.push(...listRoutes(p));
      } else if (name === "route.ts") out.push(p);
    }
    return out;
  }

  it("app/api/me/stores/[storeId]/orders/** 는 getStoreIfOwnerForOperationalWrite·ownerStoreOperationalWriteBlock 을 쓰지 않는다", () => {
    const routes = listRoutes(join(process.cwd(), "app/api/me/stores/[storeId]/orders"));
    expect(routes.length).toBeGreaterThan(3);
    for (const p of routes) {
      const src = readFileSync(p, "utf8");
      expect(src, p).not.toMatch(/getStoreIfOwnerForOperationalWrite|ownerStoreOperationalWriteBlock/);
    }
  });
});

describe("S07 L1 — 관리자 PATCH /api/admin/stores/[id] 전이표 (승인·정지·해제)", () => {
  async function adminPatch(action: string, reason?: string) {
    const res = await adminStorePatch(
      new Request(`https://x.test/api/admin/stores/${STORE}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...(reason ? { reason } : {}) }),
      }) as never,
      { params: Promise.resolve({ id: STORE }) }
    );
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }
  const storeUpdates = () => world.ops.filter((o) => o.table === "stores" && o.kind === "update");

  it("정지: approved → suspended + 비노출, 사유 필수, 감사 1·오너 알림 1·공용 캐시 bump", async () => {
    world.approval = "approved";
    expect((await adminPatch("suspend_store")).status).toBe(400);
    expect(storeUpdates()).toHaveLength(0);
    const r = await adminPatch("suspend_store", "policy violation");
    expect(r).toEqual({ status: 200, json: { ok: true } });
    expect(storeUpdates()).toHaveLength(1);
    expect(storeUpdates()[0].payload).toMatchObject({
      approval_status: "suspended",
      is_visible: false,
      suspended_reason: "policy violation",
    });
    expect(spies.audit).toHaveBeenCalledTimes(1);
    expect(spies.audit.mock.calls[0][1]).toMatchObject({ action: "store.suspend_store", target_id: STORE });
    expect(spies.notifyOwner).toHaveBeenCalledTimes(1);
    expect(spies.notifyOwner.mock.calls[0][1]).toMatchObject({ action: "suspend_store", ownerUserId: OWNER });
    expect(spies.bump).toHaveBeenCalledWith("admin_store.suspend_store");
  });

  it("정지 해제: suspended → approved + 노출 복구 (DEF-12)", async () => {
    world.approval = "suspended";
    const r = await adminPatch("resume_store");
    expect(r.status).toBe(200);
    expect(storeUpdates()[0].payload).toMatchObject({ approval_status: "approved", suspended_reason: null, is_visible: true });
    expect(spies.audit).toHaveBeenCalledTimes(1);
  });

  it("승인: under_review → approved (노출은 오너가 켠다), 사유 필수", async () => {
    world.approval = "under_review";
    expect((await adminPatch("approve_store")).status).toBe(400);
    const r = await adminPatch("approve_store", "docs ok");
    expect(r.status).toBe(200);
    expect(storeUpdates()[0].payload).toMatchObject({ approval_status: "approved", is_visible: false, suspended_reason: null });
  });

  it.each([
    ["suspend_store", "pending"],
    ["suspend_store", "suspended"],
    ["resume_store", "approved"],
    ["approve_store", "suspended"],
  ])("비허용 전이 %s from %s → 409 invalid_store_transition, 쓰기 0", async (action, from) => {
    world.approval = from;
    const r = await adminPatch(action, "reason text");
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("invalid_store_transition");
    expect(storeUpdates()).toHaveLength(0);
    expect(spies.audit).not.toHaveBeenCalled();
  });
});

describe("S07 L1 — 주문자: 정지·미승인 매장 직접 URL 결제 거부", () => {
  function orderReq() {
    return new Request("https://x.test/api/me/store-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ store_id: STORE, items: [{ product_id: "p1", qty: 1 }], payment_method: "cash" }),
    }) as unknown as NextRequest;
  }

  it.each(["suspended", "pending", "rejected"])("%s → 400 store_unavailable, 주문 검증·RPC 미호출", async (status) => {
    world.approval = status;
    const res = await storeOrdersPost(orderReq());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "store_unavailable" });
    expect(spies.validateCheckout).not.toHaveBeenCalled();
    expect(spies.createOrder).not.toHaveBeenCalled();
  });

  it("탈퇴 사장 매장(ACC-03: approved 이지만 is_visible=false) → 400 store_unavailable, 주문 RPC 미호출", async () => {
    world.approval = "approved";
    world.visible = false;
    const res = await storeOrdersPost(orderReq());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, error: "store_unavailable" });
    expect(spies.createOrder).not.toHaveBeenCalled();
  });

  it("approved + 노출 → 매장 게이트 통과 (다음 단계 검증으로 진행)", async () => {
    world.approval = "approved";
    const res = await storeOrdersPost(orderReq());
    expect(((await res.json()) as { error?: string }).error).not.toBe("store_unavailable");
    expect(spies.validateCheckout).toHaveBeenCalledTimes(1);
  });
});

describe("S07 L1 — 오너 탈퇴(ACC-03): 판매 중지 + 비노출 / 회원 정지는 노출 유지", () => {
  function sanctionSb() {
    const ops: Array<{ table: string; kind: string; payload?: unknown }> = [];
    const chain = (table: string) => {
      const op: { table: string; kind: string; payload?: unknown } = { table, kind: "select" };
      ops.push(op);
      const result = () =>
        table === "stores" && op.kind === "select"
          ? { data: [{ id: STORE, store_name: "S07", owner_user_id: OWNER }], error: null }
          : { data: null, error: null };
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        select: () => c,
        eq: () => c,
        in: () => c,
        update: (p: unknown) => {
          op.kind = "update";
          op.payload = p;
          return c;
        },
        upsert: (p: unknown) => {
          op.kind = "upsert";
          op.payload = p;
          return c;
        },
        maybeSingle: async () =>
          table === "store_sales_permissions"
            ? { data: { allowed_to_sell: true, sales_status: "approved" }, error: null }
            : result(),
        then: (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res),
      });
      return c;
    };
    return { ops, client: { from: chain } as never };
  }

  it("withdraw → stores.is_visible=false + 판매 권한 suspended upsert + 감사 + 오너 알림", async () => {
    const { ops, client } = sanctionSb();
    const out = await suspendOwnerStoreSalesOnMemberSanction(client, {
      userId: OWNER,
      actorId: "admin-s07",
      sanction: "withdraw",
      reason: "account deleted",
    });
    expect(out).toEqual([{ storeId: STORE, storeName: "S07", changed: true }]);
    expect(ops.find((o) => o.table === "stores" && o.kind === "update")?.payload).toEqual({ is_visible: false });
    expect(ops.find((o) => o.table === "store_sales_permissions" && o.kind === "upsert")?.payload).toMatchObject({
      store_id: STORE,
      allowed_to_sell: false,
      sales_status: "suspended",
    });
    expect(spies.audit).toHaveBeenCalledTimes(1);
    expect(spies.notifyOwner).toHaveBeenCalledTimes(1);
  });

  it("suspend(회원 정지) → 판매만 중지, 노출 플래그는 건드리지 않음", async () => {
    const { ops, client } = sanctionSb();
    await suspendOwnerStoreSalesOnMemberSanction(client, { userId: OWNER, actorId: "a", sanction: "suspend", reason: "r" });
    expect(ops.some((o) => o.table === "stores" && o.kind === "update")).toBe(false);
    expect(ops.some((o) => o.table === "store_sales_permissions" && o.kind === "upsert")).toBe(true);
  });

  it("관리자 회원 삭제 라우트가 withdraw 제재를 호출한다", () => {
    const src = readFileSync(join(process.cwd(), "app/api/admin/users/[id]/delete/route.ts"), "utf8");
    expect(src).toMatch(/suspendOwnerStoreSalesOnMemberSanction\(sb, \{[\s\S]*?sanction: "withdraw"/);
  });
});
