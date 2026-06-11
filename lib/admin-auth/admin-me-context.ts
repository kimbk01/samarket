"use client";

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

export function peekAdminMeSnapshot(): AdminMeSnapshot | null {
  return cached;
}

export function clearAdminMeSnapshot(): void {
  cached = null;
  inflight = null;
}

export async function fetchAdminMeSnapshot(): Promise<AdminMeSnapshot | null> {
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("/api/admin/me", { credentials: "include", cache: "no-store" });
      if (!res.ok) return null;
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
      if (!data.ok || !data.userId) return null;
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
