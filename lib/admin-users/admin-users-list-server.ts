/**
 * 어드민 회원 목록 GET — 배치 조회·청크·Auth 전체 로드 (read-only).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { chunkIds, CHAT_ROOM_ID_IN_CHUNK_SIZE } from "@/lib/chats/chat-list-limits";
import { isDibaySyntheticAuthEmail } from "@/lib/auth/synthetic-auth-email";
import type { AdminAuthListUser } from "@/lib/admin-users/resolve-admin-auth-provider";
import type { AdminLinkedIdentity } from "@/lib/admin-users/resolve-admin-user-display";

export const ADMIN_USERS_AUTH_LIST_MAX_PAGES = 25;
export const ADMIN_USERS_AUTH_LIST_PER_PAGE = 200;

type AuthAdminListClient = SupabaseClient & {
  auth: SupabaseClient["auth"] & {
    admin: {
      listUsers: (params: { page: number; perPage: number }) => Promise<{
        data?: { users?: AdminAuthListUser[] };
        error?: { message?: string } | null;
      }>;
    };
  };
};

function pickString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** GoTrue admin.listUsers — 중복 제거·페이지 상한. 실패 시 빈 배열. */
export async function loadAllAuthAdminUsers(
  serviceSb: AuthAdminListClient,
): Promise<AdminAuthListUser[]> {
  const authUsers: AdminAuthListUser[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= ADMIN_USERS_AUTH_LIST_MAX_PAGES; page += 1) {
    const result = await serviceSb.auth.admin.listUsers({
      page,
      perPage: ADMIN_USERS_AUTH_LIST_PER_PAGE,
    });
    const batch = Array.isArray(result?.data?.users) ? result.data.users : [];
    if (batch.length === 0) break;
    let added = 0;
    for (const user of batch) {
      const id = String(user?.id ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      authUsers.push(user);
      added += 1;
    }
    if (added === 0) break;
    if (batch.length < ADMIN_USERS_AUTH_LIST_PER_PAGE) break;
  }
  return authUsers;
}

export function buildAuthUserMap(authUsers: AdminAuthListUser[]): Map<string, AdminAuthListUser> {
  const map = new Map<string, AdminAuthListUser>();
  for (const user of authUsers) {
    const id = String(user.id ?? "").trim();
    if (id && !map.has(id)) map.set(id, user);
  }
  return map;
}

export async function loadLinkedIdentitiesMapChunked(
  sb: SupabaseClient,
  userIds: string[],
): Promise<Map<string, AdminLinkedIdentity[]>> {
  const out = new Map<string, AdminLinkedIdentity[]>();
  const uniqueIds = [...new Set(userIds.map((id) => String(id).trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return out;

  const chunks = chunkIds(uniqueIds, CHAT_ROOM_ID_IN_CHUNK_SIZE);
  const results = await Promise.all(
    chunks.map((chunk) =>
      sb
        .from("user_auth_identities")
        .select("user_id, provider, provider_user_id, email")
        .in("user_id", chunk),
    ),
  );

  for (const { data, error } of results) {
    if (error || !Array.isArray(data)) continue;
    for (const row of data as Array<{
      user_id?: string | null;
      provider?: string | null;
      provider_user_id?: string | null;
      email?: string | null;
    }>) {
      const userId = String(row.user_id ?? "").trim();
      const provider = String(row.provider ?? "").trim().toLowerCase();
      const providerUserId = String(row.provider_user_id ?? "").trim();
      if (!userId || !provider || !providerUserId) continue;
      const identity: AdminLinkedIdentity = {
        provider,
        providerUserId,
        email: pickString(row.email),
      };
      const existing = out.get(userId);
      if (existing) {
        const dup = existing.some(
          (item) => item.provider === identity.provider && item.providerUserId === identity.providerUserId,
        );
        if (!dup) existing.push(identity);
      } else {
        out.set(userId, [identity]);
      }
    }
  }
  return out;
}

/** profiles 없는 auth-only 행 닉네임 — synthetic email local part 노출 방지 */
export function resolveProfileLessAdminNickname(input: {
  userMetadata?: Record<string, unknown> | null;
  authEmail?: string | null;
  loginIdentifier?: string | null;
  userId: string;
}): string {
  const meta = input.userMetadata ?? {};
  const nicknameMeta =
    pickString(meta.nickname) ??
    pickString(meta.full_name) ??
    pickString(meta.name);
  if (nicknameMeta) return nicknameMeta;

  const loginId = pickString(input.loginIdentifier);
  if (loginId && loginId !== "이메일 없음") return loginId;

  const email = pickString(input.authEmail);
  if (email && !isDibaySyntheticAuthEmail(email)) {
    const local = email.split("@")[0]?.trim();
    if (local) return local;
  }

  return input.userId.slice(0, 8) || "user";
}

export function linkedProvidersFromIdentities(
  rows: readonly AdminLinkedIdentity[] | undefined,
): string[] {
  return (rows ?? []).map((row) => row.provider);
}
