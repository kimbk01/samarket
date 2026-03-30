"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import { mapProfileRowToPublicSeller } from "@/lib/users/map-profile-to-public-seller";

export interface UserProfilePublic {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  /** 배터리 UI용 0~100 (trust_score → manner_temperature → manner_score) */
  trustScore: number;
  /** @deprecated trustScore 와 동일 */
  temperature?: number;
  /** @deprecated trustScore 와 동일 */
  speed?: number;
  trust_score?: number | null;
}

/**
 * 작성자 등 공개 프로필 조회 (브라우저 Supabase — RLS 정책에 따름).
 * 상세 화면은 `/api/users/.../public-profile` 우선 권장.
 */
export async function getUserProfile(userId: string): Promise<UserProfilePublic | null> {
  const supabase = getSupabaseClient();
  if (!supabase || !userId?.trim()) return null;

  try {
    const { data, error } = await (supabase as any)
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();

    if (!error && data) {
      const row = data as Record<string, unknown>;
      const base = mapProfileRowToPublicSeller(row);
      const ts = row.trust_score;
      return {
        ...base,
        temperature: base.trustScore,
        speed: base.trustScore,
        trust_score: ts != null && ts !== "" ? Number(ts) : null,
      };
    }

    return null;
  } catch {
    return null;
  }
}
