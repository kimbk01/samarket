/**
 * 5단계 S08 (L1) — 서비스 지역 변경 → 7개 진입점 판정 동일 (문서 G-2 §5-2 S08 · §5-4 3-A 게이트).
 *
 * 같은 대표 주소(회원 master) × 같은 매장 상태로 7개 진입점을 실제 코드 경로로 돌려
 *   (1) 모두 단일 판정 `evaluateDeliveryServiceArea` 를 호출하고,
 *   (2) 판정 결과(eligible·reason)가 같으며,
 *   (3) 진입점별 노출/주문 가능 결정이 같은지
 * 를 케이스 × 진입점 셀로 확인한다.
 *
 * 진입점(호출 경로):
 *  HOME      — home-feed 행 OOR 계산 조합(loadDeliveryServiceabilityRuntimeContext → evaluateStoreDeliveryServiceability → resolveListDistanceOutOfRange, route L352·L578 과 같은 호출)
 *  BROWSE    — resolveBrowseFilteredSortedStoreRows (실제 함수, saved_address 는 OOR 제외)
 *  SEARCH    — evaluateStoreDeliveryServiceability → resolveDeliverySearchStoreEligibility / isDeliverySearchStoreVisible (search-delivery 와 같은 호출)
 *  ORDER NOW — resolveDiscoveryOorWithServiceAreaAuthority (NEW 권한 홈 순위 재매핑, 실제 함수)
 *  상세      — GET /api/stores/[slug]/delivery-serviceability (실제 라우트)
 *  장바구니  — 같은 라우트 응답 → isDeliveryDistanceOrderBlocked / resolveDeliveryDistanceBlockCopyKeys (실제 클라 helper)
 *  체크아웃  — POST /api/me/store-orders (실제 라우트, 주문 RPC 는 mock)
 *
 * 케이스: C1 반경 축소 · C2 좌표 이동 1km 초과 · C3 V2 지역 교체 · C4 좌표 없는 매장 / 정책 OFF / 설정 조회 실패.
 */
import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BUYER = "buyer-s08";
const STORE = "store-s08";
const SLUG = "s08-shop";
const MEMBER = { lat: 14.5995, lng: 120.9842, lgu: "PH-LGU-A" };
/** 위도 1도 ≈ 111.2km — 회원 기준 북쪽으로 km 만큼 */
const north = (km: number) => MEMBER.lat + km / 111.2;

type StoreFx = {
  lat: number | null;
  lng: number | null;
  delivery_radius_km: number | null;
  authority: "legacy_radius" | "v2_lgu";
  selected: string[];
};

const world = vi.hoisted(() => ({
  store: null as unknown as {
    lat: number | null;
    lng: number | null;
    delivery_radius_km: number | null;
    authority: "legacy_radius" | "v2_lgu";
    selected: string[];
  },
  /** admin_settings 응답: null = 조회 오류 */
  settings: null as null | { enabled: boolean },
}));

function adminSettingsResult() {
  if (world.settings == null) return { data: null, error: { message: "connection reset" } };
  return {
    data: [
      {
        key: "delivery_distance_policy",
        value_json: { enabled: world.settings.enabled, source: "straight", overDistanceBehavior: "exclude" },
      },
      { key: "delivery_store_distance_overrides", value_json: { stores: {} } },
    ],
    error: null,
  };
}

function storeRow() {
  return {
    id: STORE,
    slug: SLUG,
    owner_user_id: "owner-s08",
    approval_status: "approved",
    is_visible: true,
    store_name: "S08",
    is_open: true,
    point_commerce_blocked: false,
    business_hours_json: null,
    pickup_available: true,
    delivery_available: true,
    lat: world.store.lat,
    lng: world.store.lng,
    delivery_radius_km: world.store.delivery_radius_km,
    delivery_service_area_authority: world.store.authority,
  };
}

const addressRow = {
  id: "addr-s08",
  place_id: null,
  formatted_address: "1 Main St, Manila",
  detail_address: "Unit 1",
  delivery_note: null,
  latitude: MEMBER.lat,
  longitude: MEMBER.lng,
  city_municipality: "Manila",
  province: "Metro Manila",
  canonical_lgu_id: MEMBER.lgu,
};

function builder(table: string) {
  const terminal = () => {
    if (table === "stores") return { data: storeRow(), error: null };
    if (table === "user_addresses") return { data: addressRow, error: null };
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
        if (prop === "in" && table === "admin_settings") return async () => adminSettingsResult();
        return () => proxy;
      },
    }
  );
  return proxy;
}
const sbClient = {
  from: (t: string) => builder(t),
  rpc: async () => ({ data: null, error: { message: "mock_rpc" } }),
} as never;

const spies = vi.hoisted(() => ({
  createOrder: vi.fn(async (..._a: unknown[]) => ({ ok: false, error: "rpc_mock_stop", httpStatus: 500 })),
}));

vi.mock("@/lib/delivery/service-area/evaluate-delivery-service-area", async (orig) => {
  const real = await orig<typeof import("@/lib/delivery/service-area/evaluate-delivery-service-area")>();
  return { ...real, evaluateDeliveryServiceArea: vi.fn(real.evaluateDeliveryServiceArea) };
});
vi.mock("@/lib/delivery/service-area/load-store-service-area-runtime-map", () => ({
  loadStoreServiceAreaRuntimeMap: async (_sb: unknown, ids: readonly string[]) =>
    new Map(ids.map((id) => [id, { authorityMode: world.store.authority, selectedLguIds: [...world.store.selected] }])),
}));
vi.mock("@/lib/delivery/service-area/store-delivery-service-areas", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  loadStoreSelectedDeliveryLguIds: async () => [...world.store.selected],
}));
vi.mock("@/lib/addresses/user-address-service", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getUserAddressDefaults: async () => ({
    master: {
      id: addressRow.id,
      userId: BUYER,
      isActive: true,
      countryCode: "PH",
      countryName: "Philippines",
      province: addressRow.province,
      cityMunicipality: addressRow.city_municipality,
      barangay: null,
      district: null,
      streetAddress: "1 Main St",
      buildingName: null,
      unitFloorRoom: null,
      landmark: null,
      latitude: MEMBER.lat,
      longitude: MEMBER.lng,
      placeId: null,
      formattedAddress: addressRow.formatted_address,
      roadAddress: null,
      detailAddress: addressRow.detail_address,
      deliveryNote: null,
      fullAddress: addressRow.formatted_address,
      neighborhoodName: null,
      appRegionId: "metro-manila",
      appCityId: "manila",
      canonicalLguId: MEMBER.lgu,
      recipientName: "B",
      phoneNumber: "09171234567",
    },
  }),
}));
vi.mock("@/lib/auth/get-route-user-id", () => ({ getRouteUserId: async () => BUYER }));
vi.mock("@/lib/auth/server-guards", () => ({ validateActiveSession: async () => ({ ok: true }) }));
vi.mock("@/lib/stores/try-supabase-stores", () => ({ tryGetSupabaseForStores: () => sbClient }));
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
  validateStoreOrderCheckout: async () => ({
    ok: true,
    lines: [],
    deliveryFeeAmount: 0,
    paymentGrandTotal: 500,
    paymentTotal: 500,
    productsById: new Map(),
  }),
}));
vi.mock("@/lib/stores/create-store-order-atomic", () => ({
  createStoreOrderAtomic: (...a: unknown[]) => spies.createOrder(...a),
}));

import { evaluateDeliveryServiceArea } from "@/lib/delivery/service-area/evaluate-delivery-service-area";
import {
  evaluateStoreDeliveryServiceability,
  loadDeliveryServiceabilityRuntimeContext,
} from "@/lib/delivery/load-delivery-serviceability-runtime";
import { resolveListDistanceOutOfRange } from "@/lib/delivery/delivery-list-oor-policy";
import { loadStoreServiceAreaRuntimeMap } from "@/lib/delivery/service-area/load-store-service-area-runtime-map";
import {
  DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED,
  __resetDeliveryDistanceSettingsForTests,
  loadDeliveryDistanceSettings,
} from "@/lib/delivery/delivery-ops-settings";
import { resolveBrowseFilteredSortedStoreRows, type StoresBrowseRequestContext } from "@/lib/stores/stores-browse-build";
import {
  isDeliverySearchStoreVisible,
  resolveDeliverySearchStoreEligibility,
} from "@/lib/delivery/search/search-delivery";
import { resolveDiscoveryOorWithServiceAreaAuthority } from "@/lib/stores/discovery/resolve-discovery-oor-with-service-area";
import { GET as serviceabilityGet } from "@/app/api/stores/[slug]/delivery-serviceability/route";
import {
  isDeliveryDistanceOrderBlocked,
  resolveDeliveryDistanceBlockCopyKeys,
  type StoreDeliveryServiceabilityClientPayload,
} from "@/lib/stores/fetch-store-delivery-serviceability-client";
import { POST as storeOrdersPost } from "@/app/api/me/store-orders/route";

const evalSpy = vi.mocked(evaluateDeliveryServiceArea);

type Surface = "HOME" | "BROWSE" | "SEARCH" | "ORDER_NOW" | "DETAIL" | "CART" | "CHECKOUT";
type Cell = {
  surface: Surface;
  /** 이 진입점이 호출한 단일 판정 결과 (호출 안 했으면 null) */
  judged: { eligible: boolean; reason: string } | null;
  /** 진입점의 주문자 결과: 노출·주문 가능 */
  orderable: boolean;
  /** 체크아웃·장바구니의 오류/문구 코드 */
  code?: string | null;
};

function lastJudgement(before: number) {
  const calls = evalSpy.mock.results.slice(before);
  if (calls.length === 0) return null;
  const r = calls[calls.length - 1].value as { eligible: boolean; reason: string };
  return { eligible: r.eligible, reason: r.reason };
}

async function runHome(): Promise<Cell> {
  const before = evalSpy.mock.results.length;
  const ctx = await loadDeliveryServiceabilityRuntimeContext(sbClient);
  const area = (await loadStoreServiceAreaRuntimeMap(sbClient, [STORE])).get(STORE);
  const s = storeRow();
  const svc = evaluateStoreDeliveryServiceability({
    ctx,
    storeId: STORE,
    storeDeliveryRadiusKm: s.delivery_radius_km,
    customerLat: MEMBER.lat,
    customerLng: MEMBER.lng,
    storeLat: s.lat,
    storeLng: s.lng,
    authorityMode: area?.authorityMode,
    selectedLguIds: area?.selectedLguIds ?? [],
    memberLguId: MEMBER.lgu,
  });
  const oor = resolveListDistanceOutOfRange({
    originSource: "saved_address",
    serviceabilityApplies: svc.applies,
    reason: svc.reason,
  });
  return { surface: "HOME", judged: lastJudgement(before), orderable: !oor };
}

async function runBrowse(): Promise<Cell> {
  const before = evalSpy.mock.results.length;
  const settings = await loadDeliveryDistanceSettings(sbClient);
  const s = storeRow();
  const ctx = {
    primary: "food",
    subRaw: "",
    wantsAllSubs: true,
    sub: "",
    district: null,
    regionQ: "",
    cityQ: "",
    uiLang: "ko",
    origin: {
      source: "saved_address",
      lat: MEMBER.lat,
      lng: MEMBER.lng,
      cacheGeoPart: "g",
      addressId: addressRow.id,
      cacheAddressPart: `addr:${addressRow.id}`,
      canonicalLguId: MEMBER.lgu,
    },
    deliveryRideTimeSource: "store",
    deliveryDistancePolicy: {
      ...settings.policy,
      enabled: DELIVERY_DISTANCE_POLICY_RUNTIME_ENABLED && settings.policy.enabled,
    },
    storeDistanceOverrides: settings.overrides,
    serviceAreaByStoreId: await loadStoreServiceAreaRuntimeMap(sbClient, [STORE]),
    sort: "distance",
    page: 1,
    limit: 20,
  } as unknown as StoresBrowseRequestContext;
  const row = {
    id: STORE,
    store_name: "S08",
    slug: SLUG,
    description: null,
    region: null,
    city: null,
    district: null,
    profile_image_url: null,
    is_open: true,
    sales_allowed: true,
    rating_avg: null,
    review_count: null,
    delivery_available: true,
    pickup_available: true,
    visit_available: false,
    reservation_available: false,
    is_featured: false,
    lat: s.lat,
    lng: s.lng,
    delivery_radius_km: s.delivery_radius_km,
    business_hours_json: null,
    business_type: null,
    store_topics: null,
  };
  const out = resolveBrowseFilteredSortedStoreRows(ctx, {} as never, [], [row]);
  return { surface: "BROWSE", judged: lastJudgement(before), orderable: out.rows.some((r) => r.id === STORE) };
}

async function runSearch(): Promise<Cell> {
  const before = evalSpy.mock.results.length;
  const svcCtx = await loadDeliveryServiceabilityRuntimeContext(sbClient);
  const area = (await loadStoreServiceAreaRuntimeMap(sbClient, [STORE])).get(STORE);
  const s = storeRow();
  const svc = evaluateStoreDeliveryServiceability({
    ctx: svcCtx,
    storeId: STORE,
    storeDeliveryRadiusKm: s.delivery_radius_km,
    customerLat: MEMBER.lat,
    customerLng: MEMBER.lng,
    storeLat: s.lat,
    storeLng: s.lng,
    authorityMode: area?.authorityMode,
    selectedLguIds: area?.selectedLguIds ?? [],
    memberLguId: MEMBER.lgu,
  });
  const eligibility = resolveDeliverySearchStoreEligibility({ originSource: "saved_address", svc });
  return {
    surface: "SEARCH",
    judged: lastJudgement(before),
    orderable: isDeliverySearchStoreVisible({ originSource: "saved_address", eligibility }),
  };
}

async function runOrderNow(): Promise<Cell> {
  const before = evalSpy.mock.results.length;
  const ctx = await loadDeliveryServiceabilityRuntimeContext(sbClient);
  const s = storeRow();
  const out = await resolveDiscoveryOorWithServiceAreaAuthority(sbClient, {
    rows: [{ id: STORE, lat: s.lat, lng: s.lng, delivery_radius_km: s.delivery_radius_km, delivery_available: true, is_open: true }],
    originLat: MEMBER.lat,
    originLng: MEMBER.lng,
    originSource: "saved_address",
    memberLguId: MEMBER.lgu,
    // home-feed route L226 / browse snapshot L324 와 같은 식
    distanceAxisEnabled: ctx.policy.enabled,
    shadowOutOfRangeById: new Map([[STORE, false]]),
  });
  return { surface: "ORDER_NOW", judged: lastJudgement(before), orderable: out.outOfRangeById.get(STORE) !== true };
}

async function fetchDetail(): Promise<{ judged: Cell["judged"]; payload: StoreDeliveryServiceabilityClientPayload }> {
  const before = evalSpy.mock.results.length;
  const res = await serviceabilityGet(new Request(`https://x.test/api/stores/${SLUG}/delivery-serviceability`), {
    params: Promise.resolve({ slug: SLUG }),
  });
  const payload = (await res.json()) as StoreDeliveryServiceabilityClientPayload;
  return { judged: lastJudgement(before), payload };
}

async function runDetail(): Promise<Cell> {
  const { judged, payload } = await fetchDetail();
  const p = payload as unknown as { eligible: boolean; reason: string };
  expect({ eligible: p.eligible, reason: p.reason }).toEqual(judged);
  return { surface: "DETAIL", judged, orderable: p.eligible === true };
}

async function runCart(): Promise<Cell> {
  const { judged, payload } = await fetchDetail();
  const blocked = isDeliveryDistanceOrderBlocked(payload, { viewerIsGuest: false });
  return {
    surface: "CART",
    judged,
    orderable: !blocked,
    code: blocked ? resolveDeliveryDistanceBlockCopyKeys((payload as { reason?: string }).reason).bodyKey : null,
  };
}

async function runCheckout(): Promise<Cell> {
  const before = evalSpy.mock.results.length;
  spies.createOrder.mockClear();
  const res = await storeOrdersPost(
    new Request("https://x.test/api/me/store-orders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        store_id: STORE,
        items: [{ product_id: "p1", qty: 1 }],
        fulfillment_type: "local_delivery",
        payment_method: "cod",
        buyer_phone: "09171234567",
      }),
    }) as unknown as NextRequest
  );
  const j = (await res.json()) as { error?: string };
  const reachedRpc = spies.createOrder.mock.calls.length > 0;
  return {
    surface: "CHECKOUT",
    judged: lastJudgement(before),
    orderable: reachedRpc,
    code: reachedRpc ? null : (j.error ?? `http_${res.status}`),
  };
}

async function runAll(): Promise<Cell[]> {
  const cells: Cell[] = [];
  for (const run of [runHome, runBrowse, runSearch, runOrderNow, runDetail, runCart, runCheckout]) {
    __resetDeliveryDistanceSettingsForTests();
    cells.push(await run());
  }
  return cells;
}

function setStore(s: StoreFx) {
  world.store = s;
}

/** 28셀 기록 (매트릭스 문서용 — 테스트 출력) */
const matrix: Array<{ caseId: string; cells: Cell[] }> = [];

function expectSameJudgement(cells: Cell[], expected: { eligible: boolean; reason: string; orderable: boolean }) {
  for (const c of cells) {
    expect(c.judged, `${c.surface} judged`).toEqual({ eligible: expected.eligible, reason: expected.reason });
    expect(c.orderable, `${c.surface} orderable`).toBe(expected.orderable);
  }
}

beforeEach(() => {
  __resetDeliveryDistanceSettingsForTests();
  world.settings = { enabled: true };
  // v4 W1 API-13 — 주문 생성 레이트리밋(사용자당 분당 10회)은 같은 테스트 사용자로 체크아웃을 반복하는
  // 매트릭스 판정과 무관하므로 케이스마다 인메모리 버킷을 비운다.
  globalThis.__samarketApiRateLimitStore?.clear();
});

afterAll(() => {
  console.info(
    "[S08 matrix]\n" +
      matrix
        .map(
          (m) =>
            `${m.caseId}: ` +
            m.cells
              .map((c) => `${c.surface}=${c.judged ? `${c.judged.eligible}/${c.judged.reason}` : "-"}→${c.orderable ? "O" : "X"}${c.code ? `(${c.code})` : ""}`)
              .join(" | ")
        )
        .join("\n")
  );
});

describe("S08 L1 — 7 진입점 × 4 케이스 같은 판정 (단일 evaluateDeliveryServiceArea)", () => {
  it("C1 반경 축소: 10km→3km, 매장 5km — 변경 전 7곳 eligible, 변경 후 7곳 out_of_range·주문 불가", async () => {
    setStore({ lat: north(5), lng: MEMBER.lng, delivery_radius_km: 10, authority: "legacy_radius", selected: [] });
    const before = await runAll();
    expectSameJudgement(before, { eligible: true, reason: "eligible", orderable: true });

    setStore({ lat: north(5), lng: MEMBER.lng, delivery_radius_km: 3, authority: "legacy_radius", selected: [] });
    const after = await runAll();
    expectSameJudgement(after, { eligible: false, reason: "out_of_range", orderable: false });
    expect(after.find((c) => c.surface === "CHECKOUT")?.code).toBe("delivery_out_of_range");
    expect(after.find((c) => c.surface === "CART")?.code).toBe("store_cart_delivery_unavailable_body");
    matrix.push({ caseId: "C1", cells: after });
  });

  it("C2 좌표 이동 1km 초과: 0.9km → 12km(반경 10) — 7곳 동시에 eligible → out_of_range", async () => {
    setStore({ lat: north(0.9), lng: MEMBER.lng, delivery_radius_km: 10, authority: "legacy_radius", selected: [] });
    expectSameJudgement(await runAll(), { eligible: true, reason: "eligible", orderable: true });
    setStore({ lat: north(12), lng: MEMBER.lng, delivery_radius_km: 10, authority: "legacy_radius", selected: [] });
    const after = await runAll();
    expectSameJudgement(after, { eligible: false, reason: "out_of_range", orderable: false });
    matrix.push({ caseId: "C2", cells: after });
  });

  it("C3 V2 지역 교체: 선택 [A] → [B] (회원 LGU A) — selected_lgu → unselected_lgu, 거리 무관", async () => {
    // 매장은 회원과 30km — V2 에서는 거리가 판정을 바꾸지 않는다.
    setStore({ lat: north(30), lng: MEMBER.lng, delivery_radius_km: 3, authority: "v2_lgu", selected: [MEMBER.lgu] });
    expectSameJudgement(await runAll(), { eligible: true, reason: "selected_lgu", orderable: true });
    setStore({ lat: north(30), lng: MEMBER.lng, delivery_radius_km: 3, authority: "v2_lgu", selected: ["PH-LGU-B"] });
    const after = await runAll();
    expectSameJudgement(after, { eligible: false, reason: "unselected_lgu", orderable: false });
    expect(after.find((c) => c.surface === "CHECKOUT")?.code).toBe("delivery_out_of_range");
    matrix.push({ caseId: "C3", cells: after });
  });

  describe("C4 좌표 없는 매장 · 정책 OFF · 설정 조회 실패 (fail-closed, LOC-003)", () => {
    // 설정 조회 실패 케이스의 로더 console.error 는 의도된 출력 — 테스트 로그에서만 숨긴다.
    let quiet: ReturnType<typeof vi.spyOn> | null = null;
    beforeEach(() => {
      quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
      quiet?.mockRestore();
    });
    it("C4a 좌표 없는 매장(정책 ON) — 7곳 missing_store_coords·주문 불가", async () => {
      setStore({ lat: null, lng: null, delivery_radius_km: 10, authority: "legacy_radius", selected: [] });
      const cells = await runAll();
      expectSameJudgement(cells, { eligible: false, reason: "missing_store_coords", orderable: false });
      expect(cells.find((c) => c.surface === "CHECKOUT")?.code).toBe("delivery_store_coords_required");
      expect(cells.find((c) => c.surface === "CART")?.code).toBe("store_err_delivery_store_coords_required");
      matrix.push({ caseId: "C4a", cells });
    });

    it("C4b 정책 OFF + 좌표 없는 매장 — 판정 6곳 missing_store_coords, ORDER NOW 순위 재매핑은 판정 생략(축 OFF)·HOME 행 플래그가 선반 결정", async () => {
      world.settings = { enabled: false };
      setStore({ lat: null, lng: null, delivery_radius_km: 10, authority: "legacy_radius", selected: [] });
      const cells = await runAll();
      const judgedCells = cells.filter((c) => c.surface !== "ORDER_NOW");
      expectSameJudgement(judgedCells, { eligible: false, reason: "missing_store_coords", orderable: false });
      // ORDER NOW: 정책 OFF 이면 distanceAxisEnabled=false → 순위용 OOR 재매핑은 evaluator 를 부르지 않는다.
      // 선반 멤버십은 home-feed 행 distanceOutOfRange(=HOME 셀, 위 판정 OOR) + isNormalListEligible 로 결정된다.
      const orderNow = cells.find((c) => c.surface === "ORDER_NOW")!;
      expect(orderNow.judged).toBeNull();
      expect(cells.find((c) => c.surface === "HOME")!.orderable).toBe(false);
      matrix.push({ caseId: "C4b", cells });
    });

    it("C4c 정책 OFF + 좌표 있는 매장 — 7곳 eligible(policy_off)·주문 가능 (현행 보존)", async () => {
      world.settings = { enabled: false };
      setStore({ lat: north(50), lng: MEMBER.lng, delivery_radius_km: 3, authority: "legacy_radius", selected: [] });
      const cells = await runAll();
      const judgedCells = cells.filter((c) => c.surface !== "ORDER_NOW");
      expectSameJudgement(judgedCells, { eligible: true, reason: "policy_off", orderable: true });
      expect(cells.find((c) => c.surface === "ORDER_NOW")!.orderable).toBe(true);
      matrix.push({ caseId: "C4c", cells });
    });

    it("C4d 설정 조회 실패 + 좌표 없는 매장 — 목록·상세·장바구니 missing_store_coords, 체크아웃 503 delivery_policy_unavailable (주문 0)", async () => {
      world.settings = null;
      setStore({ lat: null, lng: null, delivery_radius_km: 10, authority: "legacy_radius", selected: [] });
      const cells = await runAll();
      const checkout = cells.find((c) => c.surface === "CHECKOUT")!;
      expectSameJudgement(
        cells.filter((c) => c.surface !== "CHECKOUT"),
        { eligible: false, reason: "missing_store_coords", orderable: false }
      );
      expect(checkout).toMatchObject({ judged: null, orderable: false, code: "delivery_policy_unavailable" });
      matrix.push({ caseId: "C4d", cells });
    });

    it("C4e 설정 조회 실패 + 좌표 있는 매장 — 목록·상세는 정책 ON(fail-closed) 반경 판정, 체크아웃 503 (LOC-003 §3(b) 설계: 정책 OFF 대체 0)", async () => {
      world.settings = null;
      setStore({ lat: north(50), lng: MEMBER.lng, delivery_radius_km: 3, authority: "legacy_radius", selected: [] });
      const cells = await runAll();
      for (const c of cells.filter((x) => x.surface !== "CHECKOUT")) {
        // 조회 실패가 정책 OFF(policy_off → 반경 무시 주문 가능)로 바뀌지 않는다.
        expect(c.judged, c.surface).toEqual({ eligible: false, reason: "out_of_range" });
        expect(c.orderable, c.surface).toBe(false);
      }
      expect(cells.find((c) => c.surface === "CHECKOUT")).toMatchObject({
        judged: null,
        orderable: false,
        code: "delivery_policy_unavailable",
      });
      matrix.push({ caseId: "C4e", cells });
    });
  });
});

describe("S08 L1 — 판정 단일화 배선 (7 진입점 소스가 같은 evaluator·같은 입력)", () => {
  it("home-feed·search 는 evaluateStoreDeliveryServiceability(V2 필드 포함), browse·checkout 은 evaluateDeliveryServiceArea, 상세는 evaluateStoreDeliveryServiceArea", async () => {
    const { readFileSync } = await import("node:fs");
    const read = (p: string) => readFileSync(`${process.cwd()}/${p}`, "utf8");
    const home = read("app/api/stores/home-feed/route.ts");
    const search = read("lib/delivery/search/search-delivery.ts");
    const browse = read("lib/stores/stores-browse-build.ts");
    const checkout = read("app/api/me/store-orders/route.ts");
    const detail = read("app/api/stores/[slug]/delivery-serviceability/route.ts");
    for (const src of [home, search]) {
      expect(src).toContain("evaluateStoreDeliveryServiceability({");
      expect(src).toMatch(/selectedLguIds: (areaSlice|area)\?\.selectedLguIds \?\? \[\]/);
    }
    expect(home).toContain("memberLguId: origin.canonicalLguId");
    expect(browse).toContain("evaluateDeliveryServiceArea({");
    expect(checkout).toContain("evaluateDeliveryServiceArea({");
    expect(detail).toContain("evaluateStoreDeliveryServiceArea({");
  });
});
