import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { assertVerifiedMemberForAction } from "@/lib/auth/member-access";
import { resolveServiceSupabaseForApi } from "@/lib/supabase/resolve-service-supabase-for-api";
import { createPriceOffer } from "@/lib/offers/offers.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CreateOfferBody = {
  productId?: string;
  offeredPrice?: number;
  message?: string | null;
};

export async function POST(req: NextRequest) {
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

  let body: CreateOfferBody;
  try {
    body = (await req.json()) as CreateOfferBody;
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 본문이 필요합니다." }, { status: 400 });
  }

  const result = await createPriceOffer(typedSb, {
    buyerUserId: auth.userId,
    productId: typeof body.productId === "string" ? body.productId : "",
    offeredPrice: typeof body.offeredPrice === "number" ? body.offeredPrice : Number(body.offeredPrice),
    message: body.message ?? null,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error.error, code: result.error.code },
      { status: result.error.status }
    );
  }

  return NextResponse.json({ ok: true, offer: result.value });
}
