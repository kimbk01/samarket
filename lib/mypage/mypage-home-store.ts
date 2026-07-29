/**
 * `/mypage` root memory authority — single writer for home profile projection.
 * DO NOT: duplicate into form state / second store / localStorage PII.
 */

import type { ProfileRow } from "@/lib/profile/types";
import type { RequiredInfoStatus } from "@/lib/mypage/mypage-home-snapshot";
import {
  writeMypageHomeSessionLite,
  type MypageHomeSessionLite,
} from "@/lib/mypage/mypage-home-snapshot";
import { evaluatePublicIdProfileView } from "@/lib/auth/dibay-public-id-ssot";
import { hasVerifiedPhone } from "@/lib/auth/post-login-profile-policy";

export type MypageHomeProjection = {
  viewerId: string;
  profile: ProfileRow | null;
  displayName: string;
  avatarUrl: string | null;
  username: string | null;
  bio: string | null;
  profileUpdatedAt: string | null;
  hasDibayId: boolean;
  phoneStatus: RequiredInfoStatus;
  addressStatus: RequiredInfoStatus;
};

type Listener = () => void;

let memory: MypageHomeProjection | null = null;
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribeMypageHomeStore(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMypageHomeProjection(): MypageHomeProjection | null {
  return memory;
}

export function clearMypageHomeStore(): void {
  memory = null;
  emit();
}

function toLite(proj: MypageHomeProjection): MypageHomeSessionLite {
  return {
    viewerId: proj.viewerId,
    displayName: proj.displayName,
    avatarUrl: proj.avatarUrl,
    username: proj.username,
    bio: proj.bio,
    profileUpdatedAt: proj.profileUpdatedAt,
    hasDibayId: proj.hasDibayId,
    phoneStatus: proj.phoneStatus === "unknown" ? "unknown" : proj.phoneStatus,
    addressStatus: proj.addressStatus === "unknown" ? "unknown" : proj.addressStatus,
    savedAt: Date.now(),
  };
}

export function projectionFromProfile(
  profile: ProfileRow,
  addressStatus: RequiredInfoStatus,
): MypageHomeProjection {
  const publicId = evaluatePublicIdProfileView(profile);
  const phoneOk = hasVerifiedPhone(profile);
  return {
    viewerId: profile.id.trim(),
    profile,
    displayName: (profile.display_name ?? profile.nickname ?? "").trim(),
    avatarUrl: profile.avatar_url ?? null,
    username: publicId.atDisplay,
    bio: (profile.bio ?? "").trim() || null,
    profileUpdatedAt: profile.updated_at ?? null,
    hasDibayId: publicId.setupComplete,
    phoneStatus: phoneOk ? "complete" : "required",
    addressStatus,
  };
}

export function projectionFromSessionLite(
  lite: MypageHomeSessionLite,
): MypageHomeProjection {
  return {
    viewerId: lite.viewerId,
    profile: null,
    displayName: lite.displayName,
    avatarUrl: lite.avatarUrl,
    username: lite.username,
    bio: lite.bio,
    profileUpdatedAt: lite.profileUpdatedAt,
    hasDibayId: lite.hasDibayId,
    phoneStatus: lite.phoneStatus,
    addressStatus: lite.addressStatus,
  };
}

/** Full replace after server normalize */
export function setMypageHomeProjection(next: MypageHomeProjection): void {
  memory = next;
  writeMypageHomeSessionLite(toLite(next));
  emit();
}

/** Field patch after profile save — no full remount */
export function patchMypageHomeProjection(
  patch: Partial<Omit<MypageHomeProjection, "viewerId">> & { profile?: ProfileRow | null },
): void {
  if (!memory) return;
  const next: MypageHomeProjection = { ...memory, ...patch, viewerId: memory.viewerId };
  if (patch.profile) {
    const addr = patch.addressStatus ?? memory.addressStatus;
    const rebuilt = projectionFromProfile(patch.profile, addr);
    memory = { ...rebuilt, addressStatus: addr };
  } else {
    memory = next;
  }
  writeMypageHomeSessionLite(toLite(memory));
  emit();
}
