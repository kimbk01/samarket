import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { markUserAddressUsed } from "@/lib/addresses/user-address-service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await context.params;
  const aid = id?.trim();
  if (!aid) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  try {
    await markUserAddressUsed(sb, userId, aid);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "mark_used_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
