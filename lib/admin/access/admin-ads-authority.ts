/**
 * 어드민 광고 권한 표 (설계 `ads-admin-ssot-design-2026-11-07.md` §4 · Owner 「설계안대로 진행」 2026-11-07) — 한 표.
 * 메뉴·화면·버튼·API 가 같은 키를 쓴다. Client-safe (서버 모듈 import 없음).
 *
 * | 키       | 쓰기                                                                                   |
 * |----------|----------------------------------------------------------------------------------------|
 * | ads      | 운영자·이벤트·자체 광고(피드 직접·팝업·PTR·마이·인트로·이벤트 배너) · 피드 회원 신청 · 거래·커뮤니티 상위노출 |
 * | business | 배달 광고(사장님 유료·매장 홍보) · 사장님 팝업 · 비즈니스 캐시 충전 대기열                               |
 * | point    | 포인트 충전 승인 · 관리자 지급·회수                                                            |
 * | support  | 광고주 문의                                                                             |
 */

import type { AdminRouteRequirement } from "@/lib/admin/access/admin-route-access";

/** `admin_ad_delete` / `admin_ad_undelete` 의 `p_kind` (계약 · R2). */
export const ADMIN_AD_DELETE_KINDS = [
  "trade_promotion",
  "community_promotion",
  "feed_request",
  "feed_campaign",
  "popup_campaign",
  "ptr",
  "delivery_banner",
  "delivery_sponsored",
  "event_distribution",
  "my_banner",
  "intro",
] as const;

export type AdminAdDeleteKind = (typeof ADMIN_AD_DELETE_KINDS)[number];

export function isAdminAdDeleteKind(v: unknown): v is AdminAdDeleteKind {
  return typeof v === "string" && (ADMIN_AD_DELETE_KINDS as readonly string[]).includes(v);
}

const ADS: AdminRouteRequirement = { kind: "permission", key: "ads" };
const BUSINESS: AdminRouteRequirement = { kind: "permission", key: "business" };

/** 거래·커뮤니티 상위노출 쓰기(승인·반려·정지·재개·종료·삭제) — 도메인 화면·공통 화면 같은 키 (§4 · 「거래 관리자」·community promotion 대신). */
export const ADS_BOOST_WRITE_REQUIREMENT: AdminRouteRequirement = ADS;

/**
 * 광고 종류 → 쓰기(삭제·삭제 취소 포함) 요구 권한.
 * 배달 광고·사장님 팝업 = business · 그 밖 = ads. 팝업은 사장님 팝업인지(`ownerPopup`) 서버가 행을 읽어 정한다.
 */
export function adminAdKindWriteRequirement(
  kind: AdminAdDeleteKind,
  opts?: { ownerPopup?: boolean }
): AdminRouteRequirement {
  if (kind === "delivery_banner" || kind === "delivery_sponsored") return BUSINESS;
  if (kind === "popup_campaign" && opts?.ownerPopup) return BUSINESS;
  return ADS;
}

/** 요구 권한이 단일 권한 키일 때 그 키 (API 가드용). */
export function adminAdKindWritePermissionKey(
  kind: AdminAdDeleteKind,
  opts?: { ownerPopup?: boolean }
): "ads" | "business" {
  const req = adminAdKindWriteRequirement(kind, opts);
  return req.kind === "permission" && req.key === "business" ? "business" : "ads";
}
