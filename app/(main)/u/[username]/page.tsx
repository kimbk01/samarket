import { notFound } from "next/navigation";
import { PublicUserProfileView } from "@/components/users/PublicUserProfileView";
import { listCommunityPostsForUser } from "@/lib/community-feed/list-community-posts-for-user";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { mapProfileRowToPublicSeller, mapTestUserRowToPublicSeller } from "@/lib/users/map-profile-to-public-seller";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import { buildTradeLocationPreviewForPublic } from "@/lib/addresses/user-address-format";

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
  const profileSelect = "id, display_name, nickname, username, avatar_url, trust_score, manner_score, manner_temperature";
  const profileResult = await sbAny
    .from("profiles")
    .select(profileSelect)
    .ilike("username", u)
    .maybeSingle();
  let prof = profileResult.data;
  const profErr = profileResult.error;

  if (
    profErr &&
    /column|does not exist|schema cache|Could not find/i.test(String(profErr.message ?? ""))
  ) {
    const r2 = await sbAny
      .from("profiles")
      .select("id, display_name, nickname, username, avatar_url")
      .ilike("username", u)
      .maybeSingle();
    prof = r2.data as typeof prof;
  }

  let profile = prof && typeof (prof as { id?: string }).id === "string"
    ? mapProfileRowToPublicSeller(prof as Record<string, unknown>)
    : null;

  if (!profile?.id) {
    const { data: testRow } = await sbAny
      .from("test_users")
      .select("id, display_name, username")
      .ilike("username", u)
      .maybeSingle();
    if (testRow && typeof (testRow as { id?: string }).id === "string") {
      profile = mapTestUserRowToPublicSeller(testRow as Record<string, unknown>);
    }
  }

  if (!profile?.id) notFound();

  let tradeLocationLine: string | null = null;
  try {
    const defaults = await getUserAddressDefaults(sbAny, profile.id);
    tradeLocationLine = buildTradeLocationPreviewForPublic(defaults.trade);
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
