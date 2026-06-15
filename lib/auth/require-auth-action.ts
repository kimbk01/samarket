"use client";

import type { Profile } from "@/lib/types/profile";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { resolveClientProfileFromSession } from "@/lib/auth/resolve-client-profile-session";
import { isClientSignupComplete } from "@/lib/auth/client-signup-gate";
import { ensureCallCanUseMedia } from "@/lib/community-messenger/call-media-permission-preflight";
import { sanitizeLoginNextPath } from "@/lib/auth/auth-route-classification";
import { POST_LOGIN_PATH } from "@/lib/auth/post-login-path";
import { toProfileActionType } from "@/lib/profile/profile-requirements";
import { requireProfileCompletionClient } from "@/lib/profile/require-profile-completion.client";

export type RequireAuthActionType =
  | "community_write"
  | "community_comment"
  | "community_like"
  | "community_report"
  | "community_bookmark"
  | "trade_create_item"
  | "trade_favorite"
  | "trade_report"
  | "trade_buy"
  | "trade_chat"
  | "messenger_open"
  | "messenger_new_chat"
  | "friend_add"
  | "friend_chat"
  | "voice_call"
  | "video_call"
  | "delivery_order"
  | "order_chat"
  | "review_write"
  | "owner_dashboard"
  | "profile_edit"
  | "phone_verify"
  | "address_save";

export type RequireAuthActionOptions = {
  next?: string;
  /** @deprecated profile-requirements 매트릭스 사용 */
  requirePhone?: boolean;
  /** @deprecated profile-requirements 매트릭스 사용 */
  requireAddress?: boolean;
};

export type LoginRequiredDetail = {
  actionType: RequireAuthActionType;
  next?: string;
  token?: string;
};

export const DIBAY_LOGIN_REQUIRED_EVENT = "dibay:login-required" as const;
export const DIBAY_LOGIN_REQUIRED_DISMISS_EVENT = "dibay:login-required-dismiss" as const;

type PendingAction = () => void | Promise<void>;

const pendingActions = new Map<string, PendingAction>();

/** OAuth handoff 직후 시트 재오픈 — openLoginRequiredSheet 시 저장 */
let lastLoginRequiredDetail: LoginRequiredDetail | null = null;

export function clearStoredLoginRequiredDetail(): void {
  lastLoginRequiredDetail = null;
}

export function getStoredLoginRequiredDetailForTests(): LoginRequiredDetail | null {
  return lastLoginRequiredDetail;
}

export function clearPendingAuthActions(): void {
  pendingActions.clear();
}

function buildConsentHrefForAction(next?: string): string {
  const target = next?.trim() || currentHrefFallback();
  return `/auth/onboarding/terms?next=${encodeURIComponent(target)}`;
}

function currentHrefFallback(): string {
  if (typeof window === "undefined") return POST_LOGIN_PATH;
  const href = `${window.location.pathname}${window.location.search}`;
  return sanitizeLoginNextPath(href) ?? POST_LOGIN_PATH;
}

function createPendingToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `auth-action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function dispatchLoginRequired(detail: LoginRequiredDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<LoginRequiredDetail>(DIBAY_LOGIN_REQUIRED_EVENT, { detail }));
}

export function openLoginRequiredSheet(detail: LoginRequiredDetail): void {
  const next = detail.next?.trim()
    ? sanitizeLoginNextPath(detail.next) ?? undefined
    : undefined;
  const normalized = { ...detail, next };
  lastLoginRequiredDetail = normalized;
  dispatchLoginRequired(normalized);
}

export function dismissLoginRequiredSheet(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DIBAY_LOGIN_REQUIRED_DISMISS_EVENT));
}

/** OAuth 실패 시 직전 로그인 시트 복원 (actionType·token·next 유지) */
export function reopenLoginRequiredSheet(): void {
  if (!lastLoginRequiredDetail) return;
  dispatchLoginRequired(lastLoginRequiredDetail);
}

export async function consumePendingAuthAction(token: string | null | undefined): Promise<boolean> {
  const normalized = String(token ?? "").trim();
  if (!normalized) return false;
  const action = pendingActions.get(normalized);
  if (!action) return false;
  pendingActions.delete(normalized);
  await action();
  return true;
}

/** 모달 취소·나중에 — pending action 폐기 (재실행 없음) */
export function dismissPendingAuthAction(token?: string | null): void {
  const normalized = String(token ?? "").trim();
  if (!normalized) return;
  pendingActions.delete(normalized);
}

async function resolveClientProfile(): Promise<Profile | null> {
  const cached = getCurrentUser();
  if (cached?.id) return cached;
  return resolveClientProfileFromSession("requireAuthAction");
}

async function ensureDevicePermissions(actionType: RequireAuthActionType): Promise<boolean> {
  if (actionType === "voice_call") {
    return (await ensureCallCanUseMedia("voice")).ok;
  }
  if (actionType === "video_call") {
    return (await ensureCallCanUseMedia("video")).ok;
  }
  return true;
}

export async function requireAuthAction(
  actionType: RequireAuthActionType,
  nextAction: PendingAction,
  options: RequireAuthActionOptions = {},
): Promise<boolean> {
  const next = options.next?.trim() || currentHrefFallback();
  const profile = await resolveClientProfile();
  if (!profile?.id) {
    const token = createPendingToken();
    pendingActions.set(token, async () => {
      await requireAuthAction(actionType, nextAction, options);
    });
    openLoginRequiredSheet({ actionType, next, token });
    return false;
  }

  if (!isClientSignupComplete(profile)) {
    if (typeof window !== "undefined") {
      window.location.assign(buildConsentHrefForAction(next));
    }
    return false;
  }

  const profileActionType = toProfileActionType(actionType);
  if (profileActionType) {
    const token = createPendingToken();
    pendingActions.set(token, async () => {
      await requireAuthAction(actionType, nextAction, options);
    });
    const ok = await requireProfileCompletionClient(profile, profileActionType, { next, token });
    if (!ok) return false;
    pendingActions.delete(token);
  }

  if (!(await ensureDevicePermissions(actionType))) return false;

  await nextAction();
  return true;
}
