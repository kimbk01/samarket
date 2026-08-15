/**
 * GET /api/users/by-username/[username]/public-profile
 * - 공개 프로필 진입(/u/[username]) 및 상세 화면 표기용
 * - UUID 노출 금지: username으로만 조회
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { mapProfileRowToPublicSeller, mapTestUserRowToPublicSeller } from "@/lib/users/map-profile-to-public-seller";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import { resolveUserAddressTitle } from "@/lib/addresses/user-address-display-ssot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeUsernameParam(raw: string): string {
  return String(raw ?? "").trim().toLowerCase().replace(/^@+/, "");
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { username: raw } = await params;
  const username = normalizeUsernameParam(raw);
  if (!username) {
    return NextResponse.json({ ok: false, error: "username_required" }, { status: 400 });
  }

  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const profileSelect = "id, display_name, nickname, username, avatar_url, trust_score, manner_score, manner_temperature";
  let { data: prof, error: profErr } = await sbAny
    .from("profiles")
    .select(profileSelect)
    .ilike("username", username)
    .maybeSingle();

  if (
    profErr &&
    /column|does not exist|schema cache|Could not find/i.test(String(profErr.message ?? ""))
  ) {
    const r2 = await sbAny
      .from("profiles")
      .select("id, display_name, nickname, username, avatar_url")
      .ilike("username", username)
      .maybeSingle();
    prof = r2.data as typeof prof;
    profErr = r2.error;
  }

  if (!profErr && prof && typeof (prof as { id?: string }).id === "string") {
    const profileId = (prof as { id: string }).id;
    try {
      const { data: snap } = await sbAny
        .from("member_trust_snapshots")
        .select("manner_battery_percent")
        .eq("member_id", profileId)
        .maybeSingle();
      const pct = (snap as { manner_battery_percent?: number } | null)?.manner_battery_percent;
      if (pct != null && Number.isFinite(Number(pct))) {
        (prof as Record<string, unknown>).trust_score = Number(pct);
      }
    } catch {
      /* snapshot table may not exist yet */
    }
    const profile = mapProfileRowToPublicSeller(prof as Record<string, unknown>);
    if (profile.id) {
      let tradeLocationLine: string | null = null;
      try {
        const defaults = await getUserAddressDefaults(sbAny, profile.id);
        tradeLocationLine = resolveUserAddressTitle(defaults.master);
      } catch {
        /* ignore */
      }
      return NextResponse.json(
        { ok: true, profile: { ...profile, tradeLocationLine } },
        { headers: { "Cache-Control": "private, max-age=60" } }
      );
    }
  }

  // test_users fallback (개발/테스트)
  const { data: testRow } = await sbAny
    .from("test_users")
    .select("id, display_name, username")
    .ilike("username", username)
    .maybeSingle();

  if (testRow && typeof (testRow as { id?: string }).id === "string") {
    const profile = mapTestUserRowToPublicSeller(testRow as Record<string, unknown>);
    return NextResponse.json({ ok: true, profile }, { headers: { "Cache-Control": "private, max-age=60" } });
  }

  return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
}

