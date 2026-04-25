"use client";

import { getSupabaseClient } from "@/lib/supabase/client";
import { syncSupabaseRealtimeAuthFromSession, waitForSupabaseRealtimeAuth } from "@/lib/supabase/wait-for-realtime-auth";

export function createRealtimeAuthBridge(args: {
  sb: NonNullable<ReturnType<typeof getSupabaseClient>>;
  isCancelled: () => boolean;
  onReady: () => void;
}): () => void {
  const { sb, isCancelled, onReady } = args;
  let authCleanup: (() => void) | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let ready = false;

  const cleanup = () => {
    authCleanup?.();
    authCleanup = null;
    if (retryTimer != null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  void (async () => {
    const authOk = await waitForSupabaseRealtimeAuth(sb);
    if (ready || isCancelled()) {
      cleanup();
      return;
    }
    if (authOk) {
      ready = true;
      cleanup();
      onReady();
      return;
    }

    const { data } = sb.auth.onAuthStateChange((_e, session) => {
      if (ready || isCancelled() || !session?.access_token) return;
      ready = true;
      cleanup();
      onReady();
    });
    const { subscription: authStateSubscription } = data;
    authCleanup = () => {
      try {
        authStateSubscription.unsubscribe();
      } catch {
        /* ignore */
      }
    };

    retryTimer = setTimeout(() => {
      if (ready || isCancelled()) return;
      void syncSupabaseRealtimeAuthFromSession(sb).then((ok) => {
        if (ready || isCancelled() || !ok) return;
        ready = true;
        cleanup();
        onReady();
      });
    }, 180);
  })();

  return cleanup;
}
