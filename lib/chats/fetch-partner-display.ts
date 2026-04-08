/**
 * 거래/배달 채팅 상단 카드용 — 상대방 표시명·아바타·신뢰 점수.
 * GET /api/chat/room/[roomId] 에서 사용자별 `profiles` 단건 조회(N회) 대신 `.in("id", …)` 일괄 조회.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveProfileTrustScore } from "@/lib/trust/profile-trust-display";

export type PartnerDisplayFields = {
  partnerNickname: string;
  partnerAvatar: string;
  partnerTrustScore: number;
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
    });
  }
  if (ids.length === 0) return map;

  const { data: profiles } = await sbAny
    .from("profiles")
    .select("id, nickname, username, avatar_url, trust_score, manner_score, manner_temperature")
    .in("id", ids);

  const foundProfile = new Set<string>();
  for (const row of profiles ?? []) {
    const p = row as Record<string, unknown>;
    const id = String(p.id ?? "");
    if (!id) continue;
    foundProfile.add(id);
    const fb = id.slice(0, 8) || "?";
    const nick = ((p.nickname ?? p.username ?? fb) as string).trim() || fb;
    const av = p.avatar_url;
    const avatar = typeof av === "string" && av.trim() ? av.trim() : "";
    map.set(id, {
      partnerNickname: nick,
      partnerAvatar: avatar,
      partnerTrustScore: resolveProfileTrustScore(p),
    });
  }

  const missing = ids.filter((id) => !foundProfile.has(id));
  if (missing.length) {
    const { data: testUsers } = await sbAny.from("test_users").select("id, display_name, username").in("id", missing);
    for (const row of testUsers ?? []) {
      const t = row as Record<string, unknown>;
      const id = String(t.id ?? "");
      if (!id) continue;
      const fb = id.slice(0, 8) || "?";
      const nick = ((t.display_name ?? t.username ?? fb) as string).trim() || fb;
      map.set(id, {
        partnerNickname: nick,
        partnerAvatar: "",
        partnerTrustScore: resolveProfileTrustScore(null),
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
