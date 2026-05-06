import type { SupabaseClient } from "@supabase/supabase-js";
import { labelFromDisplayAndUsername } from "@/lib/users/user-label";

/** 매장 오너 화면용 — UUID 대신 닉네임·사용자명 등 사람이 읽을 수 있는 구매자 표시 */
export const BUYER_PUBLIC_LABEL_FALLBACK = "사마켓 회원";

function labelFromUserIdentity(
  displayName: string | null | undefined,
  legacyNickname: string | null | undefined,
  username: string | null | undefined
): string {
  const label = labelFromDisplayAndUsername(displayName ?? legacyNickname ?? null, username ?? null).trim();
  if (label) return label;
  const fallback = (displayName ?? legacyNickname ?? username ?? "").trim();
  return fallback;
}

/**
 * `buyer_user_id` 집합 → 공개 라벨(닉네임·username·test_users).
 * 프로필이 없으면 `BUYER_PUBLIC_LABEL_FALLBACK`.
 */
export async function mapBuyerUserIdsToPublicLabels(
  sb: SupabaseClient<any>,
  buyerIds: string[]
): Promise<Record<string, string>> {
  const unique = [...new Set(buyerIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  const out: Record<string, string> = {};
  if (!unique.length) return out;

  const merge = (id: string, label: string) => {
    const t = label.trim();
    if (!id || !t) return;
    if (!out[id]) out[id] = t;
  };

  const { data: profiles } = await sb
    .from("profiles")
    .select("id, display_name, nickname, username")
    .in("id", unique);
  for (const p of profiles ?? []) {
    const id = String((p as { id?: string }).id ?? "").trim();
    const row = p as {
      display_name?: string | null;
      nickname?: string | null;
      username?: string | null;
    };
    const label = labelFromUserIdentity(row.display_name, row.nickname, row.username);
    if (label) merge(id, label);
  }

  const missing = unique.filter((id) => !out[id]);
  if (missing.length) {
    const { data: testUsers } = await sb
      .from("test_users")
      .select("id, display_name, username")
      .in("id", missing);
    for (const t of testUsers ?? []) {
      const id = String((t as { id?: string }).id ?? "").trim();
      const row = t as { display_name?: string | null; username?: string | null };
      const label = labelFromUserIdentity(row.display_name, null, row.username);
      if (label) merge(id, label);
    }
  }

  for (const id of unique) {
    if (!out[id]) out[id] = BUYER_PUBLIC_LABEL_FALLBACK;
  }

  return out;
}
