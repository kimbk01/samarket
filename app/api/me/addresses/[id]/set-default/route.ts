import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { setUserAddressAsDefault } from "@/lib/addresses/user-address-service";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
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
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const o = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  try {
    const address = await setUserAddressAsDefault(sb, userId, aid, {
      master: o.master !== false,
      life: o.life !== false,
      trade: o.trade !== false,
      delivery: o.delivery !== false,
    });
    return NextResponse.json({ ok: true, address });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "set_default_failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
