/**
 * P0-R2 — Invalidate identity/session warm caches + lifecycle authority
 * after block / suspend / withdraw / restore.
 */

import { invalidateApiRouteAuthWarmCacheForUser } from "@/lib/auth/api-route-auth-warm-cache";
import { invalidateAuthLightSessionSnapshotCache } from "@/lib/auth/auth-light-session-snapshot-cache";
import { invalidateAuthSessionValidateCache } from "@/lib/auth/auth-session-validate-cache";
import { invalidateMemberLifecycleAuthority } from "@/lib/auth/member-lifecycle-authority-cache";
import { invalidateProxyAuthSessionCacheForUser } from "@/lib/auth/proxy-auth-session-cache";
import { invalidateUserSessionRegistryValidateCache } from "@/lib/auth/user-session-registry-validate-cache";

export function invalidateMemberAuthCachesOnLifecycleChange(userId: string): void {
  const uid = userId.trim();
  if (!uid) return;
  invalidateMemberLifecycleAuthority(uid);
  invalidateAuthLightSessionSnapshotCache(uid);
  invalidateAuthSessionValidateCache(uid);
  invalidateUserSessionRegistryValidateCache(uid);
  invalidateApiRouteAuthWarmCacheForUser(uid);
  invalidateProxyAuthSessionCacheForUser(uid);
}
