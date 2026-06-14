"use client";

import type { NativeExchangeFailureResponse } from "@/lib/auth/native/native-provider-contract";
import { logOAuthNativeEvent } from "@/lib/auth/oauth/oauth-native-callback-log";
import type { StoredAuthProvider } from "@/lib/auth/provider-identity/types";

export type ProviderEmailConflictState = {
  email: string;
  attemptedProvider: StoredAuthProvider;
  existingProviders: StoredAuthProvider[];
  stashToken: string;
};

const CONFLICT_STASH_KEY = "dibay:auth-provider-conflict-stash";

let activeConflict: ProviderEmailConflictState | null = null;
const subscribers = new Set<() => void>();

export const AUTH_PROVIDER_CONFLICT_EVENT = "dibay:auth-provider-email-conflict";

function emit(): void {
  for (const sub of subscribers) sub();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_PROVIDER_CONFLICT_EVENT));
  }
}

export function subscribeProviderEmailConflict(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

export function getProviderEmailConflict(): ProviderEmailConflictState | null {
  return activeConflict;
}

export function showProviderEmailConflict(conflict: ProviderEmailConflictState): void {
  activeConflict = conflict;
  try {
    sessionStorage.setItem(CONFLICT_STASH_KEY, conflict.stashToken);
  } catch {
    /* ignore */
  }
  logOAuthNativeEvent("auth_provider_email_conflict", {
    email: conflict.email,
    attemptedProvider: conflict.attemptedProvider,
    existingProviders: conflict.existingProviders,
  });
  emit();
}

export function clearProviderEmailConflict(): void {
  activeConflict = null;
  try {
    sessionStorage.removeItem(CONFLICT_STASH_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

export function readStoredConflictStashToken(): string | null {
  try {
    return sessionStorage.getItem(CONFLICT_STASH_KEY);
  } catch {
    return null;
  }
}

export function logAuthProviderLinkEvent(
  event:
    | "auth_provider_link_start"
    | "auth_provider_link_success"
    | "auth_provider_link_failed"
    | "auth_provider_private_relay_detected",
  detail: Record<string, unknown> = {},
): void {
  logOAuthNativeEvent(event, detail);
}

export function openProviderEmailConflictFromExchange(
  exchange: NativeExchangeFailureResponse,
): boolean {
  if (exchange.errorCode !== "provider_email_conflict" || !exchange.conflict?.stashToken) {
    return false;
  }
  showProviderEmailConflict({
    email: exchange.conflict.email,
    attemptedProvider: exchange.conflict.attemptedProvider as "google" | "kakao" | "apple",
    existingProviders: exchange.conflict.existingProviders as StoredAuthProvider[],
    stashToken: exchange.conflict.stashToken,
  });
  return true;
}

export function openProviderEmailConflictFromRedirect(params: {
  email: string;
  attemptedProvider: "google" | "kakao" | "apple";
  existingProviders: StoredAuthProvider[];
  stashToken: string;
}): void {
  showProviderEmailConflict(params);
}
