"use client";

import { useEffect, useState } from "react";
import { getCurrentUserIdForDb } from "@/lib/auth/get-current-user";
import { TEST_AUTH_CHANGED_EVENT } from "@/lib/auth/test-auth-store";
import { getSupabaseClient } from "@/lib/supabase/client";
import { useCommunityMessengerPresenceRuntime } from "@/lib/community-messenger/realtime/presence/use-community-messenger-presence-runtime";

export function CommunityMessengerPresenceRuntimeChrome() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const syncUser = () => {
      void getCurrentUserIdForDb().then((id) => setUserId((prev) => (prev === id ? prev : id)));
    };
    syncUser();

    const sb = getSupabaseClient();
    const authSub = sb?.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") return;
      syncUser();
    });

    const onTestAuth = () => syncUser();
    window.addEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuth);

    return () => {
      window.removeEventListener(TEST_AUTH_CHANGED_EVENT, onTestAuth);
      authSub?.data.subscription.unsubscribe();
    };
  }, []);

  useCommunityMessengerPresenceRuntime(userId);
  return null;
}

