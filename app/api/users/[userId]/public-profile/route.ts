/**
 * GET /api/users/[userId]/public-profile
 * 거래 상세 등 — 판매자 닉네임·프로필 사진·신뢰(매너) 배터리용 점수 (서비스 롤, 공개 필드만)
 */
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/chat/supabase-server";
import {
  mapProfileRowToPublicSeller,
  mapTestUserRowToPublicSeller,
} from "@/lib/users/map-profile-to-public-seller";
import { getUserAddressDefaults } from "@/lib/addresses/user-address-service";
import { resolveUserAddressTitle } from "@/lib/addresses/user-address-display-ssot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  let sb: ReturnType<typeof getSupabaseServer>;
  try {
    sb = getSupabaseServer();
  } catch {
    return NextResponse.json({ ok: false, error: "server_config" }, { status: 500 });
  }

  const { userId: raw } = await params;
  const userId = typeof raw === "string" ? raw.trim() : "";
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId_required" }, { status: 400 });
  }

  const sbAny = sb as import("@supabase/supabase-js").SupabaseClient<any>;

  const profileSelect =
    "id, display_name, nickname, username, avatar_url, trust_score, manner_score, manner_temperature";
  let { data: prof, error: profErr } = await sbAny.from("profiles").select(profileSelect).eq("id", userId).maybeSingle();

  if (
    profErr &&
    /column|does not exist|schema cache|Could not find/i.test(String(profErr.message ?? ""))
  ) {
    const r2 = await sbAny
      .from("profiles")
      .select("id, display_name, nickname, username, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    prof = r2.data as typeof prof;
    profErr = r2.error;
  }

  if (!profErr && prof && typeof (prof as { id?: string }).id === "string") {
    try {
      const { data: snap } = await sbAny
        .from("member_trust_snapshots")
        .select("manner_battery_percent")
        .eq("member_id", userId)
        .maybeSingle();
      const pct = (snap as { manner_battery_percent?: number } | null)?.manner_battery_percent;
      if (pct != null && Number.isFinite(Number(pct))) {
        (prof as Record<string, unknown>).trust_score = Number(pct);
      }
    } catch {
      /* snapshot table may not exist yet — bridge trust_score */
    }
    const profile = mapProfileRowToPublicSeller(prof as Record<string, unknown>);
    if (profile.id) {
      let tradeLocationLine: string | null = null;
      try {
        const defaults = await getUserAddressDefaults(sbAny, userId);
        tradeLocationLine = resolveUserAddressTitle(defaults.master);
      } catch {
        /* user_addresses 미구성·RLS 등 — 생략 */
      }
      return NextResponse.json(
        {
          ok: true,
          profile: { ...profile, tradeLocationLine },
        },
        { headers: { "Cache-Control": "private, max-age=60" } }
      );
    }
  }

  const { data: testRow } = await sbAny
    .from("test_users")
    .select("id, display_name, username")
    .eq("id", userId)
    .maybeSingle();

  if (testRow && typeof (testRow as { id?: string }).id === "string") {
    const profile = mapTestUserRowToPublicSeller(testRow as Record<string, unknown>);
    return NextResponse.json(
      { ok: true, profile },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  }

  return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
}
