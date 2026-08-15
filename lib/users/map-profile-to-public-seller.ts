import { resolveProfileTrustScore } from "@/lib/trust/profile-trust-display";
import {
  resolvePublicMemberIdentity,
  type MemberIdentityProfileFields,
} from "@/lib/users/public-member-identity";

/** 거래 상세·채팅 등에 노출하는 판매자 공개 정보 — MEMBER Identity SSOT */
export type PublicSellerProfileDTO = {
  id: string;
  /**
   * @handle value for UI — **Member public id (`dibay_id`)**.
   * Field name kept for callers; never profiles.username / store slug as authority.
   */
  username?: string | null;
  /** Canonical member display (= nickname) */
  display_name?: string | null;
  nickname: string | null;
  avatar_url: string | null;
  /** 배터리 UI 입력(0~100) — trust_score·매너 필드 통합 */
  trustScore: number;
  /**
   * 대표 주소에서 파생한 TITLE 한 줄(주소록 `is_default_master`).
   * 글에 region/city 가 없거나 비정상일 때 물품 상세와 맞춤.
   */
  tradeLocationLine?: string | null;
};

export function mapProfileRowToPublicSeller(row: Record<string, unknown>): PublicSellerProfileDTO {
  const identity = resolvePublicMemberIdentity(row as MemberIdentityProfileFields);
  const id = identity?.userId || String(row.id ?? "");
  return {
    id,
    username: identity?.dibayId ?? null,
    display_name: identity?.nickname ?? identity?.displayLabel ?? null,
    nickname: identity?.nickname ?? identity?.displayLabel ?? null,
    avatar_url: identity?.avatarUrl ?? ((row.avatar_url ?? null) as string | null),
    trustScore: resolveProfileTrustScore(row),
  };
}

export function mapTestUserRowToPublicSeller(row: Record<string, unknown>): PublicSellerProfileDTO {
  const display = typeof row.display_name === "string" ? row.display_name.trim() : null;
  const user = typeof row.username === "string" ? row.username.trim() : null;
  const nick = display || user;
  return {
    id: String(row.id ?? ""),
    username: user,
    display_name: nick,
    nickname: nick,
    avatar_url: null,
    trustScore: resolveProfileTrustScore({}),
  };
}
