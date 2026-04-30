import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { rejectPriceOffer } from "@/lib/offers/offers.service";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const sb = resolveServiceSupabaseForApi();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "서버 설정이 필요합니다." }, { status: 500 });
  }
  const typedSb = sb as SupabaseClient;

  const access = await assertVerifiedMemberForAction(typedSb, auth.userId);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status });
  }

  const { id } = await params;
  const result = await rejectPriceOffer(typedSb, {
    actorUserId: auth.userId,
    offerId: id,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error.error, code: result.error.code },
      { status: result.error.status }
    );
  }

  return NextResponse.json({ ok: true, offer: result.value });
}
