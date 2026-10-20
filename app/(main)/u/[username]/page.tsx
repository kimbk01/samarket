import { notFound } from "next/navigation";
import { PublicUserProfileView } from "@/components/users/PublicUserProfileView";
import { listCommunityPostsForUser } from "@/lib/community-feed/list-community-posts-for-user";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { mapProfileRowToPublicSeller, mapTestUserRowToPublicSeller } from "@/lib/users/map-profile-to-public-seller";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import {
  isPublicProfileHidden,
  PUBLIC_PROFILE_SELECT,
  PUBLIC_PROFILE_SELECT_FALLBACK,
  resolvePublicTradeLocationLine,
} from "@/lib/users/public-profile-exposure";
import { escapeIlikePatternFragment } from "@/lib/community-messenger/profile-user-search-filter";

export const dynamic = "force-dynamic";

function normalizeUsernameParam(raw: string): string {
  return String(raw ?? "").trim().toLowerCase().replace(/^@+/, "");
}

export default async function PublicUserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const u = normalizeUsernameParam(username);
  if (!u) notFound();

  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    notFound();
  }

  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;
  const profileSelect = PUBLIC_PROFILE_SELECT;
  const profileResult = await sbAny
    .from("profiles")
    .select(profileSelect)
    .ilike("username", escapeIlikePatternFragment(u))
    .maybeSingle();
  let prof = profileResult.data;
  const profErr = profileResult.error;

  if (
    profErr &&
    /column|does not exist|schema cache|Could not find/i.test(String(profErr.message ?? ""))
  ) {
    const r2 = await sbAny
      .from("profiles")
      .select(PUBLIC_PROFILE_SELECT_FALLBACK)
      .ilike("username", escapeIlikePatternFragment(u))
      .maybeSingle();
    prof = r2.data as typeof prof;
  }

  if (prof && isPublicProfileHidden(prof as { status?: string | null; deleted_at?: string | null })) notFound();

  if (prof && typeof (prof as { id?: string }).id === "string") {
    // 매너 배터리 = 스냅샷 SSOT (공개 프로필 API 와 동일). 스냅샷 없으면 trust_score 브리지 (D15)
    try {
      const { data: snap } = await sbAny
        .from("member_trust_snapshots")
        .select("manner_battery_percent")
        .eq("member_id", (prof as { id: string }).id)
        .maybeSingle();
      const pct = (snap as { manner_battery_percent?: number } | null)?.manner_battery_percent;
      if (pct != null && Number.isFinite(Number(pct))) {
        (prof as Record<string, unknown>).trust_score = Number(pct);
      }
    } catch {
      /* snapshot table may not exist yet — bridge trust_score */
    }
  }

  let profile = prof && typeof (prof as { id?: string }).id === "string"
    ? mapProfileRowToPublicSeller(prof as Record<string, unknown>)
    : null;

  if (!profile?.id) {
    const { data: testRow } = await sbAny
      .from("test_users")
      .select("id, display_name, username")
      .ilike("username", escapeIlikePatternFragment(u))
      .maybeSingle();
    if (testRow && typeof (testRow as { id?: string }).id === "string") {
      profile = mapTestUserRowToPublicSeller(testRow as Record<string, unknown>);
    }
  }

  if (!profile?.id) notFound();

  let tradeLocationLine: string | null = null;
  try {
    const defaults = await getUserAddressDefaults(sbAny, profile.id);
    tradeLocationLine = resolvePublicTradeLocationLine(defaults.master);
  } catch {
    /* ignore */
  }

  const communityPosts = await listCommunityPostsForUser(profile.id, 20);

  return (
    <PublicUserProfileView
      profile={{ ...profile, tradeLocationLine }}
      communityPosts={communityPosts}
    />
  );
}
