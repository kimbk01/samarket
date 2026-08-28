import { NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { loadGiftInstanceDetail } from "@/lib/gift-certificate/load-gift-instance-detail";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/me/gift-certificates/instances/[instanceId] — G3 minimum customer projection */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ instanceId: string }> }
) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const sb = tryGetSupabaseForStores();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const { instanceId } = await ctx.params;
  const loaded = await loadGiftInstanceDetail(sb, userId, instanceId);
  if (!loaded.ok) {
    return NextResponse.json({ ok: false, error: loaded.error }, { status: loaded.status });
  }
  return NextResponse.json({ ok: true, instance: loaded.instance });
}
