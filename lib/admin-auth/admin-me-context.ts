"use client";

import { adminFetch, clearAllAdminFetchCache, invalidateAdminFetchCache } from "@/lib/admin/admin-fetch-client";
import { getBoundAuthUserId } from "@/lib/auth/client-instance-id";
import type { AdminRole } from "@/lib/admin-menu-config";
import type { AdminPermissionKey } from "@/lib/types/admin-staff";

export type AdminMeSnapshot = {
  userId: string;
  role: "super_admin" | "admin";
  uiRole: AdminRole;
  adminTier: string | null;
  permissions: AdminPermissionKey[];
  loginId: string;
  displayName: string;
  /** `/api/admin/me.isDeployOwner` — 배포 담당자 여부 (구버전 응답이면 false). */
  isDeployOwner?: boolean;
  /** `/api/admin/me.accountSuspended` — 정지된 운영자 (홍보 조치 불가 · 구버전 응답이면 false). */
  accountSuspended?: boolean;
};

let cached: AdminMeSnapshot | null = null;
let inflight: Promise<AdminMeSnapshot | null> | null = null;
let fetchGeneration = 0;

/**
 * AD-08: 스냅샷은 `/api/admin/me.userId` 를 함께 저장한다. 현재 탭에 묶인 인증 user id 가 있고
 * 스냅샷 userId 와 다르면(A→B 계정 전환) 이전 관리자 스냅샷·admin fetch 캐시를 버린다.
 * 묶인 id 가 없을 때(로그인 직후 바인딩 전 등)는 판단하지 않는다 — 로그아웃은 `resetAdminClientStateForAuthChange` 가 지운다.
 */
function dropSnapshotIfAuthUserChanged(): void {
  if (!cached) return;
  let bound: string | null = null;
  try {
    bound = getBoundAuthUserId();
  } catch {
    bound = null;
  }
  if (bound && bound !== cached.userId) resetAdminClientStateForAuthChange();
}

export function peekAdminMeSnapshot(): AdminMeSnapshot | null {
  dropSnapshotIfAuthUserChanged();
  return cached;
}

export function clearAdminMeSnapshot(): void {
  cached = null;
  inflight = null;
  fetchGeneration += 1;
}

/**
 * AD-08: 로그아웃·계정 전환 wipe 에서 호출 — admin `/me` 스냅샷 + admin fetch·query 캐시 전부 초기화.
 * (`lib/auth/client-session-wipe.ts` 의 auth 캐시 초기화 단계에서 1회 호출)
 */
export function resetAdminClientStateForAuthChange(): void {
  clearAdminMeSnapshot();
  clearAllAdminFetchCache();
}

export async function fetchAdminMeSnapshot(options?: {
  force?: boolean;
}): Promise<AdminMeSnapshot | null> {
  const force = options?.force === true;
  dropSnapshotIfAuthUserChanged();
  if (!force && cached) return cached;
  if (!force && inflight) return inflight;

  const generation = force ? ++fetchGeneration : fetchGeneration;

  if (force) {
    cached = null;
    invalidateAdminFetchCache("admin:me");
    inflight = null;
  }

  inflight = (async () => {
    try {
      const res = await adminFetch("/api/admin/me", {
        credentials: "include",
        cache: "no-store",
        dedupeKey: "admin:me",
        cacheTtlMs: 30_000,
      });
      if (generation !== fetchGeneration) return cached;

      if (!res.ok) {
        if (generation === fetchGeneration) cached = null;
        return null;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        userId?: string;
        role?: "super_admin" | "admin";
        uiRole?: AdminRole;
        adminTier?: string | null;
        permissions?: AdminPermissionKey[];
        loginId?: string;
        displayName?: string;
        isDeployOwner?: boolean;
        accountSuspended?: boolean;
      };
      if (!data.ok || !data.userId) {
        if (generation === fetchGeneration) cached = null;
        return null;
      }
      if (generation !== fetchGeneration) return cached;
      cached = {
        userId: data.userId,
        role: data.role ?? "admin",
        uiRole: data.uiRole ?? "operator",
        adminTier: data.adminTier ?? null,
        permissions: data.permissions ?? [],
        loginId: data.loginId ?? "",
        displayName: data.displayName ?? "",
        isDeployOwner: data.isDeployOwner === true,
        accountSuspended: data.accountSuspended === true,
      };
      return cached;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function isSuperAdminFromSnapshot(snapshot: AdminMeSnapshot | null): boolean {
  // Canonical highest privilege = /api/admin/me.role from active admin_memberships.
  // uiRole "master" is a staff tier label and must NOT authorize super-admin mutations.
  return snapshot?.role === "super_admin";
}
