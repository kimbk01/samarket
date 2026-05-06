import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { riderSelfPatchPresence } from "@/lib/stores/store-order-delivery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  is_online?: boolean;
  rider_status?: string | null;
};

export async function PATCH(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const rm = getAuditRequestMeta(req);
  const result = await riderSelfPatchPresence(sb, {
    riderUserId: userId,
    is_online: body.is_online,
    rider_status: body.rider_status,
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });

  return NextResponse.json({ ok: true, rider: result.rider });
}
