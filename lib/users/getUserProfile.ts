"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import { resolveProfileTrustScore } from "@/lib/trust/profile-trust-display";

export interface UserProfilePublic {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  /** 레거시 호환 — 배터리 점수와 동일 숫자(0~100)로 맞춤 */
  temperature?: number;
  /** 신뢰 점수(0~100) — 배터리 UI 입력 */
  speed?: number;
  trust_score?: number | null;
}

/**
 * 작성자 등 공개 프로필 조회 (profiles만 사용).
 * speed = manner_score ?? temperature → 개인 스피드 연동 (현재 매너온도 표시, 향후 스피드로 전환 가능)
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
      const score = resolveProfileTrustScore(row);
      const ts = row.trust_score;
      return {
        id: row.id as string,
        nickname: (row.nickname ?? row.username ?? null) as string | null,
        avatar_url: (row.avatar_url ?? null) as string | null,
        temperature: score,
        speed: score,
        trust_score: ts != null && ts !== "" ? Number(ts) : null,
      } as UserProfilePublic;
    }

    return null;
  } catch {
    return null;
  }
}
