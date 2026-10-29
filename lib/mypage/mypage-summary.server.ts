import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMyPostsServer } from "@/lib/my/load-my-posts-server";
import { filterMyProductsByListingAxis } from "@/lib/products/my-product-listing-filter";
import type { Product } from "@/lib/types/product";
import { loadFavoritePostsServer } from "@/lib/favorites/load-favorite-posts-server";
import { listPriceOffers } from "@/lib/offers/offers.service";
import { listCommunityPostsForUserResult } from "@/lib/community-feed/list-community-posts-for-user";
import { loadBuyerStoreOrderTabCounts } from "@/lib/delivery/customer/load-buyer-store-order-tab-counts";
import { loadPointFinancialSummary } from "@/lib/points/project-point-financial-history";
import { loadCustomerCouponWalletCards } from "@/lib/stores/load-customer-coupon-wallet-cards";
import { customerWalletPresentationTab } from "@/lib/stores/customer-coupon-wallet-view";
import { loadGiftWalletOverviewSummary } from "@/lib/gift-certificate/load-gift-wallet";
import { readMemberTrustSnapshotPercent } from "@/lib/trust/member-trust-read";
import { MY_PAGE_BANNERS_SELECT, myPageBannerLiveWindowFilters } from "@/lib/my/mypage-tables-select";
import type { MyPageBannerRow } from "@/lib/my/types";
import type {
  MypageSummaryField,
  MypageSummaryFields,
  MypageSummaryTrust,
} from "@/lib/mypage/mypage-summary-types";

/**
 * `GET /api/me/mypage-summary` 집계 — 최종 설계 §2.2.
 *
 * CONTRACT
 * - 각 값 = 목적지 화면이 쓰는 **같은 서버 함수**의 결과(중복 쿼리 작성 금지).
 * - 필드별 실패·시간 초과 → `unavailable`. **어떤 실패도 0 으로 바꾸지 않는다.**
 * - 부수효과 있는 호출 금지(구매 자동확정 스윕 등). 서버 캐시 없음.
 * - `"use client"` 파일에서 import 금지 (`server-only`).
 */

/** 필드별 타임아웃 — 초과 시 `unavailable` */
export const MYPAGE_SUMMARY_FIELD_TIMEOUT_MS = 1500;

type Sb = SupabaseClient<any>;

/** 테스트 주입용 — 기본값은 목적지 화면과 같은 함수 */
export type MypageSummaryDeps = {
  loadMyPosts: typeof loadMyPostsServer;
  loadFavoritePosts: typeof loadFavoritePostsServer;
  listPriceOffers: typeof listPriceOffers;
  listCommunityPosts: typeof listCommunityPostsForUserResult;
  loadStoreOrderTabCounts: typeof loadBuyerStoreOrderTabCounts;
  loadPointSummary: typeof loadPointFinancialSummary;
  loadCouponCards: typeof loadCustomerCouponWalletCards;
  loadGiftSummary: typeof loadGiftWalletOverviewSummary;
  loadTrust: (sb: Sb, userId: string) => Promise<MypageSummaryTrust>;
  loadBanner: (sb: Sb) => Promise<MyPageBannerRow | null>;
};

class FieldUnavailableError extends Error {}

function unavailable(reason: string): never {
  throw new FieldUnavailableError(reason);
}

/**
 * 매너 배터리 원값 — `/mypage/trust` 가 읽는 `/api/me/profile` 과 같은 규칙:
 * `profiles.trust_score, manner_score` + `member_trust_snapshots` 가 있으면 `trust_score` 덮어씀.
 * 클라이언트가 같은 `buildMemberTrustSurface` 로 % 를 계산한다.
 */
export async function loadMypageSummaryTrustServer(sb: Sb, userId: string): Promise<MypageSummaryTrust> {
  const { data, error } = await sb
    .from("profiles")
    .select("trust_score, manner_score")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) unavailable("profile_trust_unavailable");
  const row = data as { trust_score?: number | null; manner_score?: number | null };
  const snapshotPct = await readMemberTrustSnapshotPercent(sb, userId);
  return {
    trust_score: snapshotPct ?? (row.trust_score != null ? Number(row.trust_score) : null),
    manner_score: row.manner_score != null ? Number(row.manner_score) : null,
  };
}

/** 관리자 CMS 활성 배너 1건 — 기존 `MypageHomeCmsBanner` 클라 조회와 같은 조건(서버로 이동). */
export async function loadMypageHomeBannerServer(sb: Sb): Promise<MyPageBannerRow | null> {
  const bannerWindow = myPageBannerLiveWindowFilters(new Date().toISOString());
  const { data, error } = await sb
    .from("my_page_banners")
    .select(MY_PAGE_BANNERS_SELECT)
    .eq("is_active", true)
    .or(bannerWindow.startOr)
    .or(bannerWindow.endOr)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) unavailable("banner_unavailable");
  return (data as MyPageBannerRow | null) ?? null;
}

export const DEFAULT_MYPAGE_SUMMARY_DEPS: MypageSummaryDeps = {
  loadMyPosts: loadMyPostsServer,
  loadFavoritePosts: loadFavoritePostsServer,
  listPriceOffers,
  listCommunityPosts: listCommunityPostsForUserResult,
  loadStoreOrderTabCounts: loadBuyerStoreOrderTabCounts,
  loadPointSummary: loadPointFinancialSummary,
  loadCouponCards: loadCustomerCouponWalletCards,
  loadGiftSummary: loadGiftWalletOverviewSummary,
  loadTrust: loadMypageSummaryTrustServer,
  loadBanner: loadMypageHomeBannerServer,
};

async function settleField<T>(
  compute: () => Promise<T>,
  timeoutMs: number,
): Promise<MypageSummaryField<T>> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const value = await Promise.race<T>([
      compute(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new FieldUnavailableError("timeout")), timeoutMs);
      }),
    ]);
    return { status: "ok", value };
  } catch {
    return { status: "unavailable" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 요약 필드 계산 — `Promise.allSettled` 와 같은 효과(필드마다 독립 settle), 필드별 타임아웃.
 */
export async function loadMypageSummaryFieldsServer(
  sb: Sb,
  userId: string,
  opts: { deps?: Partial<MypageSummaryDeps>; timeoutMs?: number } = {},
): Promise<MypageSummaryFields> {
  const deps: MypageSummaryDeps = { ...DEFAULT_MYPAGE_SUMMARY_DEPS, ...opts.deps };
  const timeoutMs = opts.timeoutMs ?? MYPAGE_SUMMARY_FIELD_TIMEOUT_MS;
  const uid = userId.trim();

  const [
    salesActiveCount,
    favoritesCount,
    offersReceivedPending,
    communityPostsCount,
    storeOrdersActiveCount,
    pointsBalance,
    couponsAvailableCount,
    giftCertificatesOwned,
    trust,
    banner,
  ] = await Promise.all([
    // 판매중 탭 = `/mypage/products` `MyProductsView` 와 같은 필터
    settleField(async () => {
      const res = await deps.loadMyPosts(sb, uid);
      if (!res.ok) unavailable(res.error);
      return filterMyProductsByListingAxis(res.posts as unknown as Product[], "active").length;
    }, timeoutMs),
    // 찜 = `FavoriteProductsView` 상품 목록(전체) 길이
    settleField(async () => {
      const res = await deps.loadFavoritePosts(sb, uid);
      if (!res.ok) unavailable(res.error);
      return res.items.length;
    }, timeoutMs),
    // 가격 제안 받은 대기 = `/api/offers/received` 목록의 pending
    settleField(async () => {
      const res = await deps.listPriceOffers(sb, { userId: uid, role: "seller" });
      if (!res.ok) unavailable("offers_unavailable");
      return res.value.filter((o) => o.status === "pending").length;
    }, timeoutMs),
    // 내가 쓴 글 = `/mypage/community-posts` 와 같은 함수(게시중)
    settleField(async () => {
      const res = await deps.listCommunityPosts(uid);
      if (!res.ok) unavailable(res.error);
      return res.posts.length;
    }, timeoutMs),
    // 주문 진행중 = `/api/me/store-orders` 탭 개수
    settleField(async () => {
      const res = await deps.loadStoreOrderTabCounts(sb, uid);
      if (!res.ok) unavailable(res.error);
      return res.counts.active;
    }, timeoutMs),
    // 포인트 잔액 = `/api/me/points` summary.balance (이력은 읽지 않음)
    settleField(async () => {
      const res = await deps.loadPointSummary(sb, uid);
      if (!res.ok) unavailable(res.error);
      return res.summary.balance;
    }, timeoutMs),
    // 쿠폰 보유 = 쿠폰 화면 보유 탭(`customerWalletPresentationTab === "held"`)
    settleField(async () => {
      const res = await deps.loadCouponCards(sb, { buyerUserId: uid, tab: "all" });
      if (!res.ok) unavailable(res.error);
      return res.cards.filter((c) => customerWalletPresentationTab(c.bucket) === "held").length;
    }, timeoutMs),
    // 상품권 보유 = 상품권 화면 보유 탭과 같은 상태 집합
    settleField(async () => {
      const res = await deps.loadGiftSummary(sb, uid);
      if (!res.ok) unavailable(res.error);
      return res.summary.owned;
    }, timeoutMs),
    settleField(() => deps.loadTrust(sb, uid), timeoutMs),
    settleField(() => deps.loadBanner(sb), timeoutMs),
  ]);

  return {
    salesActiveCount,
    favoritesCount,
    offersReceivedPending,
    communityPostsCount,
    storeOrdersActiveCount,
    pointsBalance,
    couponsAvailableCount,
    giftCertificatesOwned,
    // S46 진행중 탭 구현 전 — 목적지에 해당 숫자가 없음
    adsActiveCount: { status: "hidden" },
    trust,
    banner,
  };
}
