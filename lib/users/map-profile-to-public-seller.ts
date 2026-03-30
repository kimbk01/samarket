import { resolveProfileTrustScore } from "@/lib/trust/profile-trust-display";

/** 거래 상세·채팅 등에 노출하는 판매자 공개 정보 */
export type PublicSellerProfileDTO = {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  /** 배터리 UI 입력(0~100) — trust_score·매너 필드 통합 */
  trustScore: number;
};

export function mapProfileRowToPublicSeller(row: Record<string, unknown>): PublicSellerProfileDTO {
  return {
    id: String(row.id ?? ""),
    nickname: ((row.nickname ?? row.username) ?? null) as string | null,
    avatar_url: (row.avatar_url ?? null) as string | null,
    trustScore: resolveProfileTrustScore(row),
  };
}

export function mapTestUserRowToPublicSeller(row: Record<string, unknown>): PublicSellerProfileDTO {
  const nick = ((row.display_name ?? row.username) ?? null) as string | null;
  return {
    id: String(row.id ?? ""),
    nickname: nick && String(nick).trim() ? String(nick).trim() : null,
    avatar_url: null,
    trustScore: resolveProfileTrustScore({}),
  };
}
