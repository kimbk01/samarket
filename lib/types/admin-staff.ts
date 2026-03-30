/**
 * 관리자(스태프) 타입 — 회원관리 화면에서 회원과 분리하여 관리
 * 당근 운영 분석 기준 권한 키로 세분화 권한 부여
 */

import type { AdminRole } from "@/lib/admin-menu-config";

/** 당근형 운영 메뉴 기준 권한 키 (실질운영·광고·포인트·설정·관리/보고·개발) */
export type AdminPermissionKey =
  | "users"        // 회원관리
  | "users_edit_membership" // 회원 구분·전화인증 수정 (DB 반영)
  | "regions"      // 지역관리
  | "products"    // 중고거래(상품/카테고리/가격제안/찜/거래상태)
  | "boards"      // 커뮤니티(게시판/카테고리/인기글/공지)
  | "post_write"   // 글쓰기(게시글 작성·수정·삭제)
  | "comment_write" // 댓글쓰기(댓글 작성·삭제)
  | "product_edit" // 상품 등록·수정·삭제
  | "business"    // 매장 (배달관련)
  | "jobs"        // 알바
  | "real_estate" // 부동산
  | "used_car"    // 중고차
  | "chats"       // 채팅관리
  | "reviews"     // 리뷰관리
  | "reports"     // 신고/제재관리
  | "ads"         // 광고/노출
  | "point"       // 포인트 운영
  | "settings"    // 운영 설정
  | "manage"      // 관리/보고
  | "dev"         // 개발/시스템
  | "create_admin"; // 관리자 수동 생성 (최고 관리자 전용)

export interface AdminStaff {
  id: string;
  /** 로그인 아이디(이메일 또는 username) */
  loginId: string;
  displayName: string;
  /** 역할: master만 관리자 생성 가능 */
  role: AdminRole;
  /** 세부 권한 (비어 있으면 역할 기본 권한 사용) */
  permissions: AdminPermissionKey[];
  createdAt: string;
  createdBy?: string;
  /** 비활성화 시 로그인 불가 */
  disabled?: boolean;
}

export type CreateAdminInput = {
  loginId: string;
  password: string;
  displayName: string;
  role: AdminRole;
  permissions: AdminPermissionKey[];
};
