/**
 * `/mypage` (and `/my`) admin menu row — server-confirmed admin fact for the first render.
 *
 * CONTRACT:
 * - Reuses `isRouteAdmin()` (active `admin_memberships` + active session) — no second admin formula.
 * - Computed per RSC request for the cookie user; never persisted (no storage, no TTL).
 * - Display hint only. `/admin` and `/api/admin/**` keep their own server checks; the client still
 *   re-verifies with `/api/admin/access-check` on every mount.
 * - `viewerId` lets the client reject a seed that belongs to a different account.
 * - `nonce` is unique per RSC request: once the user leaves the page, the client retires it, so a
 *   router-cache-reused payload (e.g. back navigation) can never re-show an older admin fact.
 */
import { randomUUID } from "node:crypto";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";

export type MypageAdminMenuSeed = {
  viewerId: string;
  isAdmin: boolean;
  nonce: string;
};

export async function loadMypageAdminMenuSeedServer(): Promise<MypageAdminMenuSeed | null> {
  const viewerId = (await getRouteUserId())?.trim() ?? "";
  if (!viewerId) return null;
  try {
    return { viewerId, isAdmin: await isRouteAdmin(), nonce: randomUUID() };
  } catch {
    return null;
  }
}
