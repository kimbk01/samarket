/**
 * 거래/배달 채팅 상단 카드용 — 상대방 표시명·아바타·신뢰 점수.
 * GET /api/chat/room/[roomId] 에서 사용자별 `profiles` 단건 조회(N회) 대신 `.in("id", …)` 일괄 조회.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { postAuthorUserId } from "@/lib/chats/resolve-author-nickname";
import { resolveProfileTrustScore } from "@/lib/trust/profile-trust-display";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

export type PartnerDisplayFields = {
  partnerNickname: string;
  partnerAvatar: string;
  partnerTrustScore: number;
  partnerUsername?: string | null;
  partnerDisplayName?: string | null;
};

export async function fetchPartnerDisplayFieldsMap(
  sbAny: SupabaseClient<any>,
  userIds: string[]
): Promise<Map<string, PartnerDisplayFields>> {
  const map = new Map<string, PartnerDisplayFields>();
  const ids = [...new Set(userIds.map((x) => String(x).trim()).filter(Boolean))];
  for (const id of ids) {
    map.set(id, {
      partnerNickname: id.slice(0, 8),
      partnerAvatar: "",
      partnerTrustScore: resolveProfileTrustScore(null),
      partnerUsername: null,
      partnerDisplayName: null,
    });
  }
  if (ids.length === 0) return map;

  const { data: profiles } = await sbAny
    .from("profiles")
    .select("id, display_name, nickname, username, avatar_url, trust_score, manner_score, manner_temperature")
    .in("id", ids);

  const foundProfile = new Set<string>();
  for (const row of profiles ?? []) {
    const p = row as Record<string, unknown>;
    const id = String(p.id ?? "");
    if (!id) continue;
    foundProfile.add(id);
    const fb = id.slice(0, 8) || "?";
    const username = typeof p.username === "string" && p.username.trim() ? p.username.trim() : null;
    const displayName =
      typeof p.display_name === "string" && p.display_name.trim() ? p.display_name.trim() : null;
    const label =
      labelFromDisplayAndUsername(
        (p.display_name ?? p.nickname) as string | null | undefined,
        p.username as string | null | undefined
      ).trim() || fb;
    const av = p.avatar_url;
    const avatar = typeof av === "string" && av.trim() ? av.trim() : "";
    map.set(id, {
      partnerNickname: label,
      partnerAvatar: avatar,
      partnerTrustScore: resolveProfileTrustScore(p),
      partnerUsername: username,
      partnerDisplayName: displayName,
    });
  }

  try {
    const { data: snaps } = await sbAny
      .from("member_trust_snapshots")
      .select("member_id, manner_battery_percent")
      .in("member_id", ids);
    for (const s of snaps ?? []) {
      const row = s as { member_id?: string; manner_battery_percent?: number };
      const id = String(row.member_id ?? "");
      if (!id || row.manner_battery_percent == null) continue;
      const prev = map.get(id);
      if (!prev) continue;
      map.set(id, {
        ...prev,
        partnerTrustScore: resolveProfileTrustScore({
          trust_score: Number(row.manner_battery_percent),
        }),
      });
    }
  } catch {
    /* snapshot table may not exist yet */
  }

  const missing = ids.filter((id) => !foundProfile.has(id));
  if (missing.length) {
    const { data: testUsers } = await sbAny.from("test_users").select("id, display_name, username").in("id", missing);
    for (const row of testUsers ?? []) {
      const t = row as Record<string, unknown>;
      const id = String(t.id ?? "");
      if (!id) continue;
      const fb = id.slice(0, 8) || "?";
      const username = typeof t.username === "string" && t.username.trim() ? t.username.trim() : null;
      const displayName =
        typeof t.display_name === "string" && t.display_name.trim() ? t.display_name.trim() : null;
      const nick = ((t.display_name ?? t.username ?? fb) as string).trim() || fb;
      map.set(id, {
        partnerNickname: nick,
        partnerAvatar: "",
        partnerTrustScore: resolveProfileTrustScore(null),
        partnerUsername: username,
        partnerDisplayName: displayName,
      });
    }
  }

  return map;
}

export function partnerDisplayFromMap(
  map: Map<string, PartnerDisplayFields>,
  partnerId: string,
  nicknameFallback: string
): PartnerDisplayFields {
  const fb = nicknameFallback.trim() || partnerId.slice(0, 8) || "?";
  if (!partnerId) {
    return {
      partnerNickname: fb,
      partnerAvatar: "",
      partnerTrustScore: resolveProfileTrustScore(null),
    };
  }
  return (
    map.get(partnerId) ?? {
      partnerNickname: fb,
      partnerAvatar: "",
      partnerTrustScore: resolveProfileTrustScore(null),
    }
  );
}

export function nicknameMapFromPartnerDisplayMap(map: Map<string, PartnerDisplayFields>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [id, disp] of map) {
    out.set(id, disp.partnerNickname);
  }
  return out;
}

/**
 * `fetchPartnerDisplayFieldsMap` 결과로 작성자 닉을 붙인다.
 * `nicknameMapFromPartnerDisplayMap` + `enrichPostWithAuthorNickname` 대비 Map 복제·전체 순회 1회 생략.
 */
export function enrichPostWithAuthorNicknameFromPartnerDisplayMap(
  post: Record<string, unknown> | undefined,
  partnerMap: Map<string, PartnerDisplayFields>
): Record<string, unknown> | undefined {
  if (!post) return undefined;
  const existing = typeof post.author_nickname === "string" ? post.author_nickname.trim() : "";
  if (existing) return post;
  const aid = postAuthorUserId(post);
  const n = aid ? partnerMap.get(aid)?.partnerNickname?.trim() : undefined;
  return n ? { ...post, author_nickname: n } : post;
}
