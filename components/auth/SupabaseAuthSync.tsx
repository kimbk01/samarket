"use client";

import { useEffect } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import {
  sessionToProfile,
  setSupabaseProfileCache,
} from "@/lib/auth/supabase-profile-cache";
import { dispatchTestAuthChanged } from "@/lib/auth/test-auth-store";

/**
 * Supabase 브라우저 세션을 프로필 캐시에 반영하고, 기존 화면이 listen 하는 이벤트로 갱신을 트리거.
 */
export function SupabaseAuthSync() {
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;

    const apply = () => {
      void sb.auth.getSession().then(({ data: { session } }) => {
        setSupabaseProfileCache(sessionToProfile(session));
        dispatchTestAuthChanged();
      });
    };

    apply();
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      setSupabaseProfileCache(sessionToProfile(session));
      dispatchTestAuthChanged();
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}
