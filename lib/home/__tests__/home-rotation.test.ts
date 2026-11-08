import { describe, expect, it } from "vitest";
import { keepSessionPick, nextBannerId, pushShownLog, rotateUnseenFirst } from "@/lib/home/home-rotation";
import { filterHomeStorePool } from "@/components/home-hub/HomeStoresSection";
import { DEFAULT_HOME_LAYOUT, cloneHomeLayout } from "@/lib/home/home-layout-contract";
import type { StoreHomeFeedItem } from "@/lib/stores/store-home-feed-types";

const id = (x: string) => x;

describe("홈 교체 규칙 (시안 v22 「고정되지 않게」)", () => {
  it("한 번도 안 나온 것 먼저, 후보 순서 유지", () => {
    expect(rotateUnseenFirst(["a", "b", "c", "d", "e"], id, ["a", "b", "c"], 3)).toEqual(["d", "e", "c"]);
    expect(rotateUnseenFirst(["a", "b"], id, [], 3)).toEqual(["a", "b"]);
  });

  it("새로고침을 거듭하면 돌아가며 모두 나온다 (후보 7 · 한 번에 3)", () => {
    const pool = ["a", "b", "c", "d", "e", "f", "g"];
    let log: string[] = [];
    const seen = new Set<string>();
    const rounds: string[][] = [];
    for (let i = 0; i < 3; i++) {
      const pick = rotateUnseenFirst(pool, id, log, 3);
      rounds.push(pick);
      pick.forEach((x) => seen.add(x));
      log = pushShownLog(log, pick);
    }
    expect(rounds[0]).toEqual(["a", "b", "c"]);
    expect(rounds[1]).toEqual(["d", "e", "f"]);
    expect(rounds[2]![0]).toBe("g");
    expect(seen.size).toBe(7);
  });

  it("가장 오래전에 나온 것이 먼저 (기록은 최근 것이 앞)", () => {
    expect(rotateUnseenFirst(["a", "b", "c"], id, ["a", "b", "c"], 2)).toEqual(["c", "b"]);
  });

  it("배너는 어드민 순서로 한 바퀴", () => {
    expect(nextBannerId(["x", "y", "z"], null)).toBe("x");
    expect(nextBannerId(["x", "y", "z"], "x")).toBe("y");
    expect(nextBannerId(["x", "y", "z"], "z")).toBe("x");
    expect(nextBannerId(["x", "y"], "gone")).toBe("x");
    expect(nextBannerId([], "x")).toBeNull();
  });

  it("같은 세션 안에서는 고른 것 그대로 — 사라진 것만 빼고 앞에서 채움", () => {
    expect(keepSessionPick(["a", "b", "c", "d"], id, ["c", "a"], 2)).toEqual(["c", "a"]);
    expect(keepSessionPick(["a", "b", "d"], id, ["c", "a"], 2)).toEqual(["a", "b"]);
  });
});

function store(p: Partial<StoreHomeFeedItem> & { id: string }): StoreHomeFeedItem {
  return {
    slug: p.id,
    nameKo: p.id,
    tagline: null,
    primarySlug: "restaurant",
    primaryNameKo: null,
    regionLabel: "",
    status: "open",
    rating: 0,
    reviewCount: 0,
    deliveryAvailable: true,
    pickupAvailable: true,
    minOrderLabel: null,
    estPrepLabel: "",
    prepMinutes: null,
    rideMinutes: null,
    etaLabel: "",
    deliveryFeeLabel: null,
    deliveryFeeStrikePhp: null,
    paymentMethodsLine: "",
    distanceKm: null,
    featuredItems: [],
    profileImageUrl: null,
    isFeatured: false,
    commerce: {} as StoreHomeFeedItem["commerce"],
    ...p,
  };
}

describe("홈 매장 후보 — 배달 탭과 같은 판정·순서", () => {
  const feed = [
    store({ id: "a" }),
    store({ id: "closed", status: "closed" }),
    store({ id: "far", distanceOutOfRange: true }),
    store({ id: "nodeliv", deliveryAvailable: false }),
    store({ id: "mart", primarySlug: "mart", completedOrderCount30d: 3 }),
  ];

  it("영업 중 · 배달 켬 · 배달 지역 안만, 피드 순서 그대로", () => {
    expect(filterHomeStorePool(feed, DEFAULT_HOME_LAYOUT.stores).map((s) => s.id)).toEqual(["a", "mart"]);
  });

  it("직접 고르기 — 고른 매장 중 주문 가능한 곳만 (지역 밖·영업 안 함은 빠짐)", () => {
    const c = cloneHomeLayout(DEFAULT_HOME_LAYOUT).stores;
    c.mode = "manual";
    c.picks = ["far", "mart", "closed"].map((storeId) => ({ storeId, menuMode: "auto" as const, productIds: [], adLabel: false }));
    expect(filterHomeStorePool(feed, c).map((s) => s.id)).toEqual(["mart"]);
  });

  it("홈 매장 후보 — 영업시간 밖이어도 배달 지역 안이면 후보 (Owner 「샘플이라도 보여야」)", () => {
    const allClosed = [store({ id: "x", status: "closed" }), store({ id: "far", status: "closed", distanceOutOfRange: true })];
    expect(filterHomeStorePool(allClosed, DEFAULT_HOME_LAYOUT.stores)).toEqual([]);
    expect(filterHomeStorePool(allClosed, DEFAULT_HOME_LAYOUT.stores, { requireOpen: false }).map((s) => s.id)).toEqual(["x"]);
  });

  it("자동 — 업종·최근 주문 조건", () => {
    const c = cloneHomeLayout(DEFAULT_HOME_LAYOUT).stores;
    c.autoCategorySlugs = ["mart"];
    expect(filterHomeStorePool(feed, c).map((s) => s.id)).toEqual(["mart"]);
    c.autoCategorySlugs = [];
    c.autoFilter = "recent_orders";
    expect(filterHomeStorePool(feed, c).map((s) => s.id)).toEqual(["mart"]);
  });
});
