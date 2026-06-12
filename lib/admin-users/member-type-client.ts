import type { MemberType } from "@/lib/types/admin-user";

const cache = new Map<string, MemberType>();

function normalizeMemberType(raw: unknown): MemberType {
  if (raw === "premium" || raw === "admin") return raw;
  return "normal";
}

/** 실험·피드용 회원 구분 — 기본 normal, `/api/me/profile` hydrate 후 갱신 */
export function getMemberType(userId: string): MemberType {
  if (!userId) return "normal";
  return cache.get(userId) ?? "normal";
}

export function setMemberTypeCache(userId: string, memberType: MemberType): void {
  if (!userId) return;
  cache.set(userId, memberType);
}

/** GET /api/me/profile 응답에서 member_type 반영 */
export function hydrateMemberTypeFromProfilePayload(
  userId: string,
  payload: { member_type?: unknown; memberType?: unknown } | null | undefined
): MemberType {
  if (!userId || payload == null) return "normal";
  const memberType = normalizeMemberType(payload.member_type ?? payload.memberType);
  cache.set(userId, memberType);
  return memberType;
}

export async function fetchAndCacheMemberType(userId: string): Promise<MemberType> {
  if (!userId) return "normal";
  try {
    const res = await fetch("/api/me/profile", { credentials: "include", cache: "no-store" });
    if (!res.ok) return getMemberType(userId);
    const j = (await res.json()) as {
      profile?: { member_type?: unknown };
      member_type?: unknown;
    };
    const profile = j.profile ?? j;
    return hydrateMemberTypeFromProfilePayload(userId, profile);
  } catch {
    return getMemberType(userId);
  }
}
