"use client";

import { useSyncExternalStore } from "react";
import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  getOAuthPendingProvider,
  subscribeOAuthPending,
} from "@/lib/auth/oauth-pending-lifecycle";

function getOAuthPendingProviderServerSnapshot(): OAuthProvider | null {
  return null;
}

export function useOAuthPendingProvider(): OAuthProvider | null {
  return useSyncExternalStore(
    subscribeOAuthPending,
    getOAuthPendingProvider,
    getOAuthPendingProviderServerSnapshot,
  );
}
