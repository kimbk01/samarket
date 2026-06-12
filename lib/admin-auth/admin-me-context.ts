"use client";

import { adminFetch, invalidateAdminFetchCache } from "@/lib/admin/admin-fetch-client";
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
};

let cached: AdminMeSnapshot | null = null;
let inflight: Promise<AdminMeSnapshot | null> | null = null;
let fetchGeneration = 0;

export function peekAdminMeSnapshot(): AdminMeSnapshot | null {
  return cached;
}

export function clearAdminMeSnapshot(): void {
  cached = null;
  inflight = null;
  fetchGeneration += 1;
}

export async function fetchAdminMeSnapshot(options?: {
  force?: boolean;
}): Promise<AdminMeSnapshot | null> {
  const force = options?.force === true;
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
  return snapshot?.role === "super_admin" || snapshot?.uiRole === "master";
}
