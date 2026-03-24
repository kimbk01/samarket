/**
 * 9단계: 내 동네 / 지역 시스템 타입 (동네 인증 확장 시 활용)
 */

export interface UserRegion {
  id: string;
  userId: string;
  regionId: string;
  cityId: string;
  barangay: string;
  label: string;
  isPrimary: boolean;
  createdAt: string;
}
