/**
 * 마이페이지 프로필 타입 (Supabase profiles 테이블 연동용)
 */
export interface Profile {
  id: string;
  email: string;
  nickname: string;
  avatar_url: string | null;
  username?: string | null;
  role?: string;
  member_type?: string;
  phone?: string | null;
  phone_verified?: boolean;
  phone_verification_status?: string;
  /** `manual_admin` 등 — 관리자 수동 생성 정식 회원 식별 */
  auth_provider?: string | null;
  /** 신뢰 점수 0~100 (배터리). 레거시 mock 36.5는 50으로 통일 권장 */
  temperature: number;
  trust_score?: number | null;
}
