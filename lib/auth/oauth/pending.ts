import type { OAuthProvider } from "@/lib/auth/auth-providers";
import {
  OAUTH_FOREGROUND_CLEAR_DELAY_MS,
  OAUTH_PENDING_RETURN_TIMEOUT_NATIVE_MS,
} from "@/lib/auth/oauth/config";
import { isCapacitorNativePlatform } from "@/lib/platform/capacitor-native";

export type OAuthPendingClearReason =
  | "app_url_open"
  | "exchange_success"
  | "exchange_failed"
  | "cancel_or_foreground"
  | "timeout"
  | "launch_failed"
  | "manual";

const CLEAR_LOG_LABELS: Record<OAuthPendingClearReason, string> = {
  app_url_open: "[oauth] pending_clear_app_url_open",
  exchange_success: "[oauth] pending_clear_exchange_success",
  exchange_failed: "[oauth] pending_clear_exchange_failed",
  cancel_or_foreground: "[oauth] pending_clear_cancel_or_foreground",
  timeout: "[oauth] pending_clear_timeout",
  launch_failed: "[oauth] pending_clear_launch_failed",
  manual: "[oauth] pending_clear_cancel_or_foreground",
};

type PendingSnapshot = {
  provider: OAuthProvider | null;
  launched: boolean;
  sawAppUrlOpen: boolean;
};

let snapshot: PendingSnapshot = {
  provider: null,
  launched: false,
  sawAppUrlOpen: false,
};

let returnTimeoutId: ReturnType<typeof setTimeout> | null = null;
let foregroundClearTimeoutId: ReturnType<typeof setTimeout> | null = null;
let listenersRegistered = false;
const subscribers = new Set<() => void>();

function safeConsoleInfo(label: string, payload?: Record<string, unknown>): void {
  if (typeof console === "undefined") return;
  if (payload) {
    console.info(label, payload);
    return;
  }
  console.info(label);
}

function emitChange(): void {
  for (const listener of subscribers) {
    listener();
  }
}

function clearReturnTimeout(): void {
  if (returnTimeoutId != null) {
    clearTimeout(returnTimeoutId);
    returnTimeoutId = null;
  }
}

function clearForegroundClearTimeout(): void {
  if (foregroundClearTimeoutId != null) {
    clearTimeout(foregroundClearTimeoutId);
    foregroundClearTimeoutId = null;
  }
}

function armReturnTimeout(): void {
  if (!isCapacitorNativePlatform()) return;
  clearReturnTimeout();
  returnTimeoutId = setTimeout(() => {
    clearOAuthPending("timeout");
  }, OAUTH_PENDING_RETURN_TIMEOUT_NATIVE_MS);
}

function handleVisibilityChange(): void {
  if (typeof document === "undefined") return;
  if (document.visibilityState !== "visible") return;
  if (!snapshot.provider || snapshot.sawAppUrlOpen || !snapshot.launched) return;

  clearForegroundClearTimeout();
  foregroundClearTimeoutId = setTimeout(() => {
    if (snapshot.provider && !snapshot.sawAppUrlOpen && snapshot.launched) {
      clearOAuthPending("cancel_or_foreground");
    }
  }, OAUTH_FOREGROUND_CLEAR_DELAY_MS);
}

export function ensureOAuthPendingListeners(): void {
  if (listenersRegistered || typeof document === "undefined") return;
  listenersRegistered = true;
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

export function subscribeOAuthPending(onStoreChange: () => void): () => void {
  ensureOAuthPendingListeners();
  subscribers.add(onStoreChange);
  return () => {
    subscribers.delete(onStoreChange);
  };
}

export function getOAuthPendingProvider(): OAuthProvider | null {
  return snapshot.provider;
}

export function setOAuthPending(provider: OAuthProvider): void {
  clearReturnTimeout();
  clearForegroundClearTimeout();
  snapshot = {
    provider,
    launched: false,
    sawAppUrlOpen: false,
  };
  safeConsoleInfo("[oauth] pending_set", { provider });
  emitChange();
}

export function confirmOAuthPendingLaunched(): void {
  if (!snapshot.provider) return;
  snapshot = {
    ...snapshot,
    launched: true,
    sawAppUrlOpen: false,
  };
  armReturnTimeout();
  emitChange();
}

export function notifyOAuthAppUrlOpenReceived(url?: string): void {
  if (!snapshot.provider) return;
  const provider = snapshot.provider;
  clearForegroundClearTimeout();
  clearReturnTimeout();
  safeConsoleInfo(CLEAR_LOG_LABELS.app_url_open, {
    provider,
    url: url?.trim() || null,
  });
  snapshot = {
    provider: null,
    launched: false,
    sawAppUrlOpen: false,
  };
  emitChange();
}

export function clearOAuthPending(reason: OAuthPendingClearReason): void {
  if (!snapshot.provider) return;

  const provider = snapshot.provider;
  clearReturnTimeout();
  clearForegroundClearTimeout();
  safeConsoleInfo(CLEAR_LOG_LABELS[reason], { provider, reason });
  snapshot = {
    provider: null,
    launched: false,
    sawAppUrlOpen: false,
  };
  emitChange();
}

export function resetOAuthPendingForTests(): void {
  clearReturnTimeout();
  clearForegroundClearTimeout();
  listenersRegistered = false;
  snapshot = {
    provider: null,
    launched: false,
    sawAppUrlOpen: false,
  };
  emitChange();
}
