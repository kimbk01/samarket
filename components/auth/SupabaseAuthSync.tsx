"use client";

import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  setSupabaseProfileCache,
  userToProfile,
} from "@/lib/auth/supabase-profile-cache";
import { dispatchTestAuthChanged } from "@/lib/auth/test-auth-store";

/** INITIAL_SESSION·SIGNED_IN 등 짧은 간격에 ensure 가 여러 번 때리는 것 방지 */
let profileEnsureInFlight: Promise<Response> | null = null;

function fetchProfileEnsureDeduped(): Promise<Response> {
  if (!profileEnsureInFlight) {
    profileEnsureInFlight = fetch("/api/auth/profile/ensure", {
      method: "POST",
      credentials: "include",
    }).finally(() => {
      profileEnsureInFlight = null;
    });
  }
  return profileEnsureInFlight;
}

/**
 * 세션 + 서버 ensure(profiles DB)로 프로필 캐시를 맞춤.
 * - ensure 응답의 avatar_url 이 profiles 테이블 기준(업로드 사진 유지)
 * - 세션 메타만 쓰면(OAuth/Google picture만 반영) 저장한 프로필 사진이 사라지는 문제가 난다.
 */
async function hydrateProfileCacheFromSession(sb: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await sb.auth.getUser();
  if (error || !user) {
    setSupabaseProfileCache(null);
    dispatchTestAuthChanged();
    return;
  }
  let nextProfile = userToProfile(user);
  try {
    const res = await fetchProfileEnsureDeduped();
    const data = (await res.json().catch(() => null)) as
      | {
          ok?: boolean;
          profile?: {
            id: string;
            email: string;
            nickname: string;
            avatar_url?: string | null;
            username?: string | null;
            role?: string;
            member_type?: string;
            phone?: string | null;
            phone_verified?: boolean;
            phone_verification_status?: string;
            temperature?: number;
          };
        }
      | null;
    if (res.ok && data?.ok && data.profile) {
      const p = data.profile;
      nextProfile = {
        ...nextProfile,
        ...p,
        avatar_url: p.avatar_url ?? nextProfile?.avatar_url ?? null,
        temperature: p.temperature ?? nextProfile?.temperature ?? 50,
      };
    }
  } catch {
    /* ignore */
  }
  setSupabaseProfileCache(nextProfile);
  dispatchTestAuthChanged();
}

/**
 * Supabase 브라우저 세션을 프로필 캐시에 반영하고, 기존 화면이 listen 하는 이벤트로 갱신을 트리거.
 */
export function SupabaseAuthSync() {
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;

    void hydrateProfileCacheFromSession(sb);
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setSupabaseProfileCache(null);
        dispatchTestAuthChanged();
        return;
      }
      void hydrateProfileCacheFromSession(sb);
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
