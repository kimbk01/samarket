import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMyPostsServer } from "@/lib/my/load-my-posts-server";
import { filterMyProductsByListingAxis } from "@/lib/products/my-product-listing-filter";
import type { Product } from "@/lib/types/product";
import { loadFavoritePostsServer } from "@/lib/favorites/load-favorite-posts-server";
import { listPriceOffers } from "@/lib/offers/offers.service";
import { listCommunityPostsForUserResult } from "@/lib/community-feed/list-community-posts-for-user";
import { loadBuyerStoreOrderTabCounts } from "@/lib/delivery/customer/load-buyer-store-order-tab-counts";
import { readUserPointBalanceResult } from "@/lib/points/user-point-ledger";
import { loadCustomerCouponWalletCards } from "@/lib/stores/load-customer-coupon-wallet-cards";
import { customerWalletPresentationTab } from "@/lib/stores/customer-coupon-wallet-view";
import { loadGiftWalletOverviewSummary } from "@/lib/gift-certificate/load-gift-wallet";
import { readMemberTrustSnapshotPercent } from "@/lib/trust/member-trust-read";
import {
  MY_PAGE_BANNERS_SELECT,
  MY_PAGE_BANNER_CUSTOMER_ORDER,
  myPageBannerLiveQuerySpec,
} from "@/lib/my/mypage-tables-select";
import type { MyPageBannerRow } from "@/lib/my/types";
import { filterMyPageBannersWithLiveDestination } from "@/lib/my/my-page-banner-destination";
import { MYPAGE_HOME_BANNER_FETCH_LIMIT } from "@/lib/mypage/mypage-home-banner-pick";
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
  /** 포인트 잔액만 (재감사 P-4 · 이전: 누적 합계용 원장 5천 줄까지 읽던 `loadPointFinancialSummary`) */
  loadPointBalance: typeof readUserPointBalanceResult;
  loadCouponCards: typeof loadCustomerCouponWalletCards;
  loadGiftSummary: typeof loadGiftWalletOverviewSummary;
  loadTrust: (sb: Sb, userId: string) => Promise<MypageSummaryTrust>;
  loadBanners: (sb: Sb) => Promise<MyPageBannerRow[]>;
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

/**
 * 관리자 CMS 노출 배너 목록(순서대로) — 기존 `MypageHomeCmsBanner` 클라 조회와 같은 조건(서버로 이동).
 * 광고 최종 점검: 1건만 받으면 고객이 닫은 뒤 다음 배너가 나오지 않았다 → 노출 조건에 맞는 배너를
 * `MYPAGE_HOME_BANNER_FETCH_LIMIT` 건까지 받고, 앱이 닫지 않은 첫 배너를 그린다(`pickMypageHomeBanner`).
 */
export async function loadMypageHomeBannersServer(sb: Sb): Promise<MyPageBannerRow[]> {
  // MB-A03 · MB-C04: 고객 노출 조건·정렬은 공용 정의 1곳(`mypage-tables-select`) — 정렬 = 어드민과 같은 priority → sort_order → 최신
  const live = myPageBannerLiveQuerySpec(new Date().toISOString());
  let q = sb
    .from("my_page_banners")
    .select(MY_PAGE_BANNERS_SELECT)
    .eq(live.activeColumn, live.activeValue)
    .or(live.startOr)
    .or(live.endOr);
  for (const o of MY_PAGE_BANNER_CUSTOMER_ORDER) {
    q = q.order(o.column, { ascending: o.ascending });
  }
  const { data, error } = await q.limit(MYPAGE_HOME_BANNER_FETCH_LIMIT);
  if (error) unavailable("banner_unavailable");
  // DS-7: 링크 없음·끝난 이벤트로 가는 배너는 보내지 않는다(누르면 반응 없는 배너 금지)
  return filterMyPageBannersWithLiveDestination(sb, Array.isArray(data) ? (data as MyPageBannerRow[]) : []);
}

export const DEFAULT_MYPAGE_SUMMARY_DEPS: MypageSummaryDeps = {
  loadMyPosts: loadMyPostsServer,
  loadFavoritePosts: loadFavoritePostsServer,
  listPriceOffers,
  listCommunityPosts: listCommunityPostsForUserResult,
  loadStoreOrderTabCounts: loadBuyerStoreOrderTabCounts,
  loadPointBalance: readUserPointBalanceResult,
  loadCouponCards: loadCustomerCouponWalletCards,
  loadGiftSummary: loadGiftWalletOverviewSummary,
  loadTrust: loadMypageSummaryTrustServer,
  loadBanners: loadMypageHomeBannersServer,
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
    banners,
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
    // 포인트 잔액 = `/api/me/points` balance 와 같은 저장값 (이력·누적 합계는 읽지 않음 · P-4)
    settleField(async () => {
      const res = await deps.loadPointBalance(sb, uid);
      if (!res.ok) unavailable(res.error);
      return res.balance;
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
    settleField(() => deps.loadBanners(sb), timeoutMs),
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
    // 첫 배너 — 이 필드만 읽던 기존 세션 스냅샷·화면과 호환
    banner: banners.status === "ok" ? { status: "ok", value: banners.value[0] ?? null } : banners,
    banners,
  };
}
