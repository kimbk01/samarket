/**
 * 광고 시스템 인메모리 샘플 데이터 (개발 환경용)
 *
 * 실서비스에서는 Supabase DB 쿼리로 교체한다.
 * 구조는 mock-point-ledger.ts / dev-sample-data.ts 패턴을 따른다.
 */

import type {
  AdProduct,
  PostAd,
  AdFeedPost,
  AdPaymentRequest,
  AdminPostAdRow,
  AdApplyStatus,
  AdLog,
} from "./types";
import { appendPointLedger, getUserPointBalance } from "@/lib/points/mock-point-ledger";

/* ─── 샘플 ID 상수 ─────────────────────────────────────────────────── */
export const SAMPLE_AD_USER_ID = "me";
export const SAMPLE_AD_USER_NICK = "KASAMA";
export const SAMPLE_AD_POST_ID_1 = "ad-post-00000000-0001";
export const SAMPLE_AD_POST_ID_2 = "ad-post-00000000-0002";

/* ─── 광고 상품 목록 (DB 기준 샘플) ─────────────────────────────────── */
const AD_PRODUCTS: AdProduct[] = [
  {
    id: "adp-00000000-0001",
    name: "플라이프 상단고정 3일",
    description: "커뮤니티 피드 상단에 3일간 고정 노출됩니다.",
    boardKey: "plife",
    adType: "top_fixed",
    durationDays: 3,
    pointCost: 10000,
    priorityDefault: 100,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "adp-00000000-0002",
    name: "플라이프 상단고정 7일",
    description: "커뮤니티 피드 상단에 7일간 고정 노출됩니다.",
    boardKey: "plife",
    adType: "top_fixed",
    durationDays: 7,
    pointCost: 20000,
    priorityDefault: 100,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "adp-00000000-0003",
    name: "플라이프 중간삽입 5일",
    description: "커뮤니티 피드 중간에 5일간 삽입 노출됩니다.",
    boardKey: "plife",
    adType: "mid_insert",
    durationDays: 5,
    pointCost: 12000,
    priorityDefault: 200,
    isActive: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

/* ─── 전역 인메모리 상태 ─────────────────────────────────────────────── */
interface AdDevGlobal {
  products: AdProduct[];
  postAds: PostAd[];
  paymentRequests: AdPaymentRequest[];
  adLogs: AdLog[];
  seeded: boolean;
}

function getAdDevGlobal(): AdDevGlobal {
  const scope = globalThis as typeof globalThis & {
    __samarketAdDevState?: AdDevGlobal;
  };
  if (!scope.__samarketAdDevState) {
    scope.__samarketAdDevState = {
      products: AD_PRODUCTS.map((p) => ({ ...p })),
      postAds: [],
      paymentRequests: [],
      adLogs: [],
      seeded: false,
    };
    seedSampleAds(scope.__samarketAdDevState);
    scope.__samarketAdDevState.seeded = true;
  }
  if (!scope.__samarketAdDevState.seeded) {
    seedSampleAds(scope.__samarketAdDevState);
    scope.__samarketAdDevState.seeded = true;
  }
  return scope.__samarketAdDevState;
}

function seedSampleAds(state: AdDevGlobal): void {
  const now = new Date();
  const startAt = new Date(now.getTime() - 1000 * 60 * 60).toISOString(); // 1시간 전 시작
  const endAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 3).toISOString(); // 3일 후 만료

  // 샘플 active 광고 — 어드민 목록·승인 플로우 테스트용. `getActiveAdFeedPosts` 에서 시드 postId 는 피드에 노출하지 않음.
  state.postAds.push({
    id: "pa-00000000-0001",
    postId: SAMPLE_AD_POST_ID_1,
    userId: SAMPLE_AD_USER_ID,
    adProductId: "adp-00000000-0001",
    adProductName: "플라이프 상단고정 3일",
    boardKey: "plife",
    adType: "top_fixed",
    applyStatus: "active",
    paymentMethod: "points",
    pointCost: 10000,
    paidAmount: 10000,
    startAt,
    endAt,
    priority: 100,
    isActive: true,
    adminNote: null,
    approvedBy: "admin",
    approvedAt: startAt,
    rejectedBy: null,
    rejectedAt: null,
    createdAt: new Date(now.getTime() - 1000 * 60 * 60 * 2).toISOString(),
    updatedAt: startAt,
    postTitle: "[광고] 한국마트 주말 할인전",
    userNickname: SAMPLE_AD_USER_NICK,
  });

  // 광고 로그 삽입
  state.adLogs.push({
    id: "al-00000000-0001",
    postAdId: "pa-00000000-0001",
    actorId: "admin",
    logType: "approved",
    payload: { note: "샘플 광고 자동 승인" },
    createdAt: startAt,
  });
}

/* ─── 광고 상품 조회 ─────────────────────────────────────────────────── */
export function getAdProducts(boardKey?: string | null): AdProduct[] {
  const state = getAdDevGlobal();
  return state.products.filter(
    (p) => p.isActive && (!boardKey || p.boardKey === boardKey || p.boardKey === null)
  );
}

export function getAdProductById(id: string): AdProduct | null {
  const state = getAdDevGlobal();
  return state.products.find((p) => p.id === id) ?? null;
}

export function getAllAdProductsForAdmin(): AdProduct[] {
  return getAdDevGlobal().products.map((p) => ({ ...p }));
}

export function upsertAdProduct(product: AdProduct): void {
  const state = getAdDevGlobal();
  const idx = state.products.findIndex((p) => p.id === product.id);
  if (idx >= 0) {
    state.products[idx] = { ...product, updatedAt: new Date().toISOString() };
  } else {
    state.products.push({ ...product });
  }
}

/* ─── 활성 광고 피드용 조회 ──────────────────────────────────────────── */
/** 인메모리 시드용 가짜 게시글 ID — 피드 상단에는 노출하지 않음(어드민 승인·실데이터만 노출) */
function isSeededMockAdPostId(postId: string): boolean {
  return postId === SAMPLE_AD_POST_ID_1 || postId === SAMPLE_AD_POST_ID_2;
}

export function getActiveAdFeedPosts(boardKey: string): AdFeedPost[] {
  const state = getAdDevGlobal();
  const now = Date.now();
  const activeAds = state.postAds.filter(
    (ad) =>
      ad.isActive &&
      ad.applyStatus === "active" &&
      ad.boardKey === boardKey &&
      ad.adType === "top_fixed" &&
      ad.startAt !== null &&
      ad.endAt !== null &&
      Date.parse(ad.startAt) <= now &&
      Date.parse(ad.endAt) >= now &&
      !isSeededMockAdPostId(ad.postId)
  );

  return activeAds
    .sort((a, b) => a.priority - b.priority)
    .map((ad) => {
      // 게시글 메타는 샘플 광고 데이터에서 가져옴
      const isHanMart = ad.postId === SAMPLE_AD_POST_ID_1;
      return {
        adId: ad.id,
        postId: ad.postId,
        postTitle: isHanMart ? "[광고] 한국마트 주말 할인전" : ad.postTitle ?? "[광고]",
        postSummary: isHanMart
          ? "이번 주말 한국마트 전품목 할인 행사! 삼겹살, 라면, 김치 할인 진행 중입니다."
          : "",
        postImages: [],
        locationLabel: "Quezon City · Diliman",
        boardKey: ad.boardKey,
        adType: ad.adType,
        priority: ad.priority,
        startAt: ad.startAt!,
        endAt: ad.endAt!,
        advertiserName: ad.userNickname ?? "광고주",
      };
    });
}

/* ─── 광고 신청 ──────────────────────────────────────────────────────── */
export interface ApplyAdOptions {
  postId: string;
  postTitle: string;
  userId: string;
  userNickname: string;
  adProductId: string;
  paymentMethod: "points" | "bank_transfer" | "manual";
  depositorName?: string;
  memo?: string;
}

export function applyForAd(options: ApplyAdOptions): {
  ok: boolean;
  adId?: string;
  error?: string;
  pointShortfall?: number;
} {
  const state = getAdDevGlobal();
  const product = getAdProductById(options.adProductId);
  if (!product) return { ok: false, error: "ad_product_not_found" };
  if (!product.isActive) return { ok: false, error: "ad_product_inactive" };

  // 이미 active 광고 있는지 확인
  const existing = state.postAds.find(
    (a) =>
      a.postId === options.postId &&
      (a.applyStatus === "active" || a.applyStatus === "pending_review" || a.applyStatus === "approved")
  );
  if (existing) return { ok: false, error: "already_has_active_ad" };

  // 포인트 방식이면 잔액 확인
  if (options.paymentMethod === "points") {
    const balance = getUserPointBalance(options.userId);
    if (balance < product.pointCost) {
      return { ok: false, error: "insufficient_points", pointShortfall: product.pointCost - balance };
    }
    // 원장 기록 시 잔액 차감 (appendPointLedger 내부)
    appendPointLedger(
      options.userId,
      options.userNickname,
      "ad_purchase",
      product.pointCost,
      "ad_application",
      `pa-pending-${Date.now()}`,
      `${product.name} 광고 구매`,
      "user"
    );
  }

  const now = new Date();
  const adId = `pa-${Date.now()}`;
  const newAd: PostAd = {
    id: adId,
    postId: options.postId,
    userId: options.userId,
    adProductId: product.id,
    adProductName: product.name,
    boardKey: product.boardKey ?? "plife",
    adType: product.adType,
    applyStatus: options.paymentMethod === "points" ? "pending_review" : "pending_payment",
    paymentMethod: options.paymentMethod,
    pointCost: product.pointCost,
    paidAmount: options.paymentMethod === "points" ? product.pointCost : 0,
    startAt: null,
    endAt: null,
    priority: product.priorityDefault,
    isActive: false,
    adminNote: null,
    approvedBy: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedAt: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    postTitle: options.postTitle,
    userNickname: options.userNickname,
  };

  if (options.paymentMethod === "bank_transfer") {
    const reqId = `apr-${Date.now()}`;
    state.paymentRequests.push({
      id: reqId,
      postAdId: adId,
      userId: options.userId,
      paymentMethod: "bank_transfer",
      depositorName: options.depositorName ?? "",
      requestedAmount: product.pointCost / 10, // 1P = 0.1PHP 예시
      memo: options.memo ?? "",
      paymentStatus: "pending",
      confirmedBy: null,
      confirmedAt: null,
      adminNote: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      postAdSummary: `${product.name} | ${options.postTitle}`,
      userNickname: options.userNickname,
    });
  }

  state.postAds.push(newAd);
  state.adLogs.push({
    id: `al-${Date.now()}`,
    postAdId: adId,
    actorId: options.userId,
    logType: "applied",
    payload: { product: product.name, method: options.paymentMethod },
    createdAt: now.toISOString(),
  });

  return { ok: true, adId };
}

/* ─── 관리자: 광고 목록 ──────────────────────────────────────────────── */
export function getPostAdsForAdmin(): AdminPostAdRow[] {
  const state = getAdDevGlobal();
  return state.postAds
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((ad) => ({
      id: ad.id,
      postId: ad.postId,
      postTitle: ad.postTitle ?? "(제목 없음)",
      userId: ad.userId,
      userNickname: ad.userNickname ?? ad.userId,
      boardKey: ad.boardKey,
      adProductName: ad.adProductName ?? "-",
      adType: ad.adType,
      applyStatus: ad.applyStatus,
      paymentMethod: ad.paymentMethod,
      pointCost: ad.pointCost,
      startAt: ad.startAt,
      endAt: ad.endAt,
      adminNote: ad.adminNote,
      createdAt: ad.createdAt,
    }));
}

/** 관리자: 광고 승인 */
export function approvePostAd(
  adId: string,
  adminId: string,
  note?: string
): { ok: boolean; error?: string } {
  const state = getAdDevGlobal();
  const ad = state.postAds.find((a) => a.id === adId);
  if (!ad) return { ok: false, error: "not_found" };
  if (ad.applyStatus === "active" || ad.applyStatus === "approved")
    return { ok: false, error: "already_approved" };

  const product = getAdProductById(ad.adProductId);
  const durationMs = (product?.durationDays ?? 3) * 24 * 60 * 60 * 1000;
  const now = new Date();
  ad.applyStatus = "active";
  ad.isActive = true;
  ad.startAt = now.toISOString();
  ad.endAt = new Date(now.getTime() + durationMs).toISOString();
  ad.approvedBy = adminId;
  ad.approvedAt = now.toISOString();
  if (note) ad.adminNote = note;
  ad.updatedAt = now.toISOString();

  state.adLogs.push({
    id: `al-${Date.now()}`,
    postAdId: adId,
    actorId: adminId,
    logType: "approved",
    payload: { note: note ?? "" },
    createdAt: now.toISOString(),
  });

  return { ok: true };
}

/** 관리자: 광고 반려 */
export function rejectPostAd(
  adId: string,
  adminId: string,
  note: string
): { ok: boolean; error?: string } {
  const state = getAdDevGlobal();
  const ad = state.postAds.find((a) => a.id === adId);
  if (!ad) return { ok: false, error: "not_found" };

  // 포인트 방식이면 환불 (원장 기록 시 잔액 가산)
  if (ad.paymentMethod === "points" && ad.pointCost > 0 && ad.paidAmount > 0) {
    appendPointLedger(
      ad.userId,
      ad.userNickname ?? ad.userId,
      "ad_refund",
      ad.pointCost,
      "ad_application",
      adId,
      `${ad.adProductName ?? "광고"} 반려 환불`,
      "admin"
    );
    ad.paidAmount = 0;
  }

  ad.applyStatus = "rejected";
  ad.isActive = false;
  ad.rejectedBy = adminId;
  ad.rejectedAt = new Date().toISOString();
  ad.adminNote = note;
  ad.updatedAt = new Date().toISOString();

  state.adLogs.push({
    id: `al-${Date.now()}`,
    postAdId: adId,
    actorId: adminId,
    logType: "rejected",
    payload: { note },
    createdAt: new Date().toISOString(),
  });

  return { ok: true };
}

/** 관리자: 노트 저장 / 취소 / 만료 처리 */
export function updatePostAdStatus(
  adId: string,
  adminId: string,
  updates: { status?: AdApplyStatus; adminNote?: string; priority?: number; endAt?: string }
): { ok: boolean; error?: string } {
  const state = getAdDevGlobal();
  const ad = state.postAds.find((a) => a.id === adId);
  if (!ad) return { ok: false, error: "not_found" };
  if (updates.status) ad.applyStatus = updates.status;
  if (updates.adminNote !== undefined) ad.adminNote = updates.adminNote;
  if (updates.priority !== undefined) ad.priority = updates.priority;
  if (updates.endAt !== undefined) ad.endAt = updates.endAt;
  ad.isActive = ad.applyStatus === "active";
  ad.updatedAt = new Date().toISOString();
  state.adLogs.push({
    id: `al-${Date.now()}`,
    postAdId: adId,
    actorId: adminId,
    logType: "updated",
    payload: updates,
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}

/* ─── 사용자: 내 광고 내역 ───────────────────────────────────────────── */
export function getMyPostAds(userId: string): PostAd[] {
  const state = getAdDevGlobal();
  return state.postAds
    .filter((a) => a.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((a) => ({ ...a }));
}

/** 승인 전 단계만 취소 가능 — `/api/me/post-ads/.../cancel` 인메모리 폴백 */
export function cancelMyPostAd(userId: string, adId: string): { ok: boolean; error?: string } {
  const state = getAdDevGlobal();
  const ad = state.postAds.find((a) => a.id === adId && a.userId === userId);
  if (!ad) return { ok: false, error: "not_found" };
  if (!["draft", "pending_payment", "pending_review"].includes(ad.applyStatus)) {
    return { ok: false, error: "not_cancellable" };
  }
  ad.applyStatus = "cancelled";
  ad.isActive = false;
  ad.updatedAt = new Date().toISOString();
  state.adLogs.push({
    id: `al-${Date.now()}`,
    postAdId: adId,
    actorId: userId,
    logType: "cancelled",
    payload: { by: "user" },
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}

/* ─── 입금 요청 관리 ─────────────────────────────────────────────────── */
export function getPaymentRequestsForAdmin(): AdPaymentRequest[] {
  return getAdDevGlobal().paymentRequests.map((r) => ({ ...r }));
}

export function confirmPaymentRequest(
  reqId: string,
  adminId: string,
  note?: string
): { ok: boolean; error?: string } {
  const state = getAdDevGlobal();
  const req = state.paymentRequests.find((r) => r.id === reqId);
  if (!req) return { ok: false, error: "not_found" };
  req.paymentStatus = "confirmed";
  req.confirmedBy = adminId;
  req.confirmedAt = new Date().toISOString();
  if (note) req.adminNote = note;
  req.updatedAt = new Date().toISOString();

  // 연결된 광고도 pending_review 로 전환
  const ad = state.postAds.find((a) => a.id === req.postAdId);
  if (ad && ad.applyStatus === "pending_payment") {
    ad.applyStatus = "pending_review";
    ad.updatedAt = new Date().toISOString();
  }
  return { ok: true };
}

export { getUserPointBalance } from "@/lib/points/mock-point-ledger";
