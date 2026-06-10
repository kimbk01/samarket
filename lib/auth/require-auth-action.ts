"use client";

import type { Profile } from "@/lib/types/profile";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { getMyProfile } from "@/lib/profile/getMyProfile";
import { profileRowToClientProfile } from "@/lib/auth/profile-row-to-client-profile";
import { setSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";
import {
  clientHasVerifiedContactForInteractive,
  openPhoneVerificationRequiredDialog,
} from "@/lib/auth/phone-verification-gate-client";
import { requestPermission } from "@/lib/permissions/device-permission-manager";

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
  requirePhone?: boolean;
  requireAddress?: boolean;
};

export type LoginRequiredDetail = {
  actionType: RequireAuthActionType;
  next?: string;
  token?: string;
};

export type AddressRequiredDetail = {
  actionType: RequireAuthActionType;
  next?: string;
  token?: string;
};

export const DIBAY_LOGIN_REQUIRED_EVENT = "dibay:login-required" as const;
export const DIBAY_ADDRESS_REQUIRED_EVENT = "dibay:address-required" as const;

type PendingAction = () => void | Promise<void>;

const pendingActions = new Map<string, PendingAction>();

const ACTION_REQUIRES_PHONE = new Set<RequireAuthActionType>([
  "trade_create_item",
  "trade_favorite",
  "trade_report",
  "trade_buy",
  "trade_chat",
]);

const ACTION_REQUIRES_ADDRESS = new Set<RequireAuthActionType>([
  "delivery_order",
]);

function currentHrefFallback(): string {
  if (typeof window === "undefined") return "/";
  return `${window.location.pathname}${window.location.search}`;
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
  dispatchLoginRequired(detail);
}

export function openAddressRequiredSheet(detail: AddressRequiredDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AddressRequiredDetail>(DIBAY_ADDRESS_REQUIRED_EVENT, { detail }));
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

async function resolveClientProfile(): Promise<Profile | null> {
  const cached = getCurrentUser();
  if (cached?.id) return cached;
  const row = await getMyProfile();
  if (!row?.id) return null;
  const profile = profileRowToClientProfile(row);
  setSupabaseProfileCache(profile);
  return profile;
}

async function hasDefaultAddress(): Promise<boolean> {
  const res = await fetch("/api/me/mandatory-address-gate", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as
    | { ok?: boolean; authenticated?: boolean; needsBlock?: boolean }
    | null;
  return res.ok && json?.ok === true && json.authenticated === true && json.needsBlock !== true;
}

function permissionFeatureKey(actionType: RequireAuthActionType) {
  if (actionType === "voice_call") return "messenger_voice_call" as const;
  if (actionType === "video_call") return "messenger_video_call" as const;
  return undefined;
}

async function ensureDevicePermissions(actionType: RequireAuthActionType): Promise<boolean> {
  if (actionType === "voice_call") {
    const mic = await requestPermission("microphone", {
      explicitRetry: true,
      featureKey: permissionFeatureKey(actionType),
    });
    return mic.result.ok === true;
  }
  if (actionType === "video_call") {
    const mic = await requestPermission("microphone", {
      explicitRetry: true,
      featureKey: permissionFeatureKey(actionType),
    });
    if (mic.result.ok !== true) return false;
    const camera = await requestPermission("camera", {
      explicitRetry: true,
      featureKey: permissionFeatureKey(actionType),
    });
    return camera.result.ok === true;
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

  const needsPhone = options.requirePhone === true || ACTION_REQUIRES_PHONE.has(actionType);
  if (needsPhone && !clientHasVerifiedContactForInteractive(profile)) {
    openPhoneVerificationRequiredDialog({ next });
    return false;
  }

  const needsAddress = options.requireAddress === true || ACTION_REQUIRES_ADDRESS.has(actionType);
  if (needsAddress && !(await hasDefaultAddress())) {
    const token = createPendingToken();
    pendingActions.set(token, async () => {
      await requireAuthAction(actionType, nextAction, options);
    });
    openAddressRequiredSheet({ actionType, next, token });
    return false;
  }

  if (!(await ensureDevicePermissions(actionType))) return false;

  await nextAction();
  return true;
}
