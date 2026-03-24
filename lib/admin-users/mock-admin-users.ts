/**
 * 14단계: 관리자 회원 목록/상세 (MOCK_PRODUCTS·12단계 제재 상태 기반)
 */

import type { AdminUser, MemberType, UserActivitySummary } from "@/lib/types/admin-user";
import type { ModerationStatus } from "@/lib/types/report";
import { MOCK_PRODUCTS } from "@/lib/mock-products";
import { getUserModerationState } from "@/lib/admin-reports/mock-user-moderation";
import { MOCK_REPORTS } from "@/lib/reports/mock-reports";
import { MOCK_BLOCKED_USERS } from "@/lib/reports/mock-blocked-users";
import { MOCK_DATA_AS_OF_MS } from "@/lib/mock-time-anchor";

const ADMIN_MEMO: Record<string, string> = {};
/** 27단계: 회원 구분. 기본값 미설정 시 normal. 데모용 me=premium */
const MEMBER_TYPE: Record<string, MemberType> = { me: "premium" };
const JOINED_AT: Record<string, string> = {};
const LAST_ACTIVE: Record<string, string> = {};
const POINT_BALANCE: Record<string, number> = {};

function getUniqueUserIds(): string[] {
  const set = new Set<string>();
  MOCK_PRODUCTS.forEach((p) => {
    const id = p.seller?.id ?? p.sellerId;
    if (id) set.add(id);
  });
  return Array.from(set);
}

function buildUser(id: string): AdminUser {
  const state = getUserModerationState(id);
  const moderationStatus: ModerationStatus = state?.status ?? "normal";
  const nickname = state?.nickname ?? id;
  const products = MOCK_PRODUCTS.filter(
    (p) => (p.seller?.id ?? p.sellerId) === id
  );
  const productCount = products.filter(
    (p) => !["sold", "deleted"].includes(p.status)
  ).length;
  const soldCount = products.filter((p) => p.status === "sold").length;
  const first = products[0];
  const location = first?.location ?? first?.seller?.location ?? "";
  const reportCount = MOCK_REPORTS.filter((r) => r.targetUserId === id).length;
  const chatCount = products.reduce((s, p) => s + (p.chatCount ?? 0), 0);
  const joinedAt =
    JOINED_AT[id] ??
    first?.createdAt ??
    new Date(MOCK_DATA_AS_OF_MS - 1000 * 60 * 60 * 24 * 30).toISOString();
  const lastActiveAt = LAST_ACTIVE[id] ?? first?.updatedAt ?? first?.createdAt ?? joinedAt;

  return {
    id,
    nickname,
    email: undefined,
    avatar: undefined,
    memberType: MEMBER_TYPE[id] ?? "normal",
    moderationStatus,
    location,
    pointBalance: POINT_BALANCE[id] ?? 0,
    productCount,
    soldCount,
    reviewCount: 0,
    averageRating: undefined,
    reportCount,
    chatCount,
    joinedAt,
    lastActiveAt,
    adminMemo: ADMIN_MEMO[id],
  };
}

export function getUsersForAdmin(): AdminUser[] {
  return getUniqueUserIds().map(buildUser);
}

export function getAdminUserById(userId: string): AdminUser | undefined {
  const ids = getUniqueUserIds();
  if (!ids.includes(userId)) return undefined;
  return buildUser(userId);
}

export function getAdminMemo(userId: string): string {
  return ADMIN_MEMO[userId] ?? "";
}

export function setAdminMemo(userId: string, memo: string): void {
  if (memo.trim()) ADMIN_MEMO[userId] = memo.trim();
  else delete ADMIN_MEMO[userId];
}

export function setMemberType(userId: string, memberType: MemberType): void {
  MEMBER_TYPE[userId] = memberType;
}

/** API에서 불러온 회원 목록으로 MEMBER_TYPE 동기화 (getMemberType에서 사용) */
export function setMemberTypesFromList(users: { id: string; memberType: MemberType }[]): void {
  users.forEach((u) => {
    MEMBER_TYPE[u.id] = u.memberType;
  });
}

/** 27단계: 앱/판매자 카드용 회원 구분 조회 */
export function getMemberType(userId: string): MemberType {
  return MEMBER_TYPE[userId] ?? "normal";
}

/** 23단계: 포인트 잔액 조회/설정 (pointLedger·충전 승인과 연동) */
export function getUserPointBalance(userId: string): number {
  return POINT_BALANCE[userId] ?? 0;
}

export function setUserPointBalance(userId: string, balance: number): void {
  POINT_BALANCE[userId] = Math.max(0, balance);
}

export function addUserPointBalance(userId: string, delta: number): number {
  const next = Math.max(0, (POINT_BALANCE[userId] ?? 0) + delta);
  POINT_BALANCE[userId] = next;
  return next;
}

export function getActivitySummary(userId: string): UserActivitySummary {
  const products = MOCK_PRODUCTS.filter(
    (p) => (p.seller?.id ?? p.sellerId) === userId
  );
  const activeProducts = products.filter(
    (p) => !["sold", "hidden", "blinded", "deleted"].includes(p.status)
  ).length;
  const soldProducts = products.filter((p) => p.status === "sold").length;
  const reportCount = MOCK_REPORTS.filter((r) => r.targetUserId === userId).length;
  const blockedCount = MOCK_BLOCKED_USERS.filter(
    (b) => b.userId === userId || b.blockedUserId === userId
  ).length;
  const chatRoomCount = products.reduce((s, p) => s + (p.chatCount ?? 0), 0);
  return {
    userId,
    activeProducts,
    soldProducts,
    favoriteCount: 0,
    reviewCount: 0,
    averageRating: 0,
    reportCount,
    blockedCount,
    chatRoomCount,
  };
}
