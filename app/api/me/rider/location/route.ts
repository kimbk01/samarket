import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestMeta } from "@/lib/audit/request-meta";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { enforceRateLimit } from "@/lib/http/api-route";
import { tryGetSupabaseForStores } from "@/lib/stores/try-supabase-stores";
import { riderSelfPostLocation } from "@/lib/stores/store-order-delivery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { lat?: number; lng?: number };

export async function POST(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const rl = await enforceRateLimit({
    key: `rider_location:${userId}`,
    limit: 40,
    windowMs: 60_000,
    message: "위치 업데이트가 너무 잦습니다. 잠시 후 다시 시도해 주세요.",
    code: "rider_location_rate_limited",
  });
  if (!rl.ok) return rl.response;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sb = tryGetSupabaseForStores();
  if (!sb) return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });

  const rm = getAuditRequestMeta(req);
  const result = await riderSelfPostLocation(sb, {
    riderUserId: userId,
    lat: Number(body.lat),
    lng: Number(body.lng),
    ip: rm.ip,
    user_agent: rm.userAgent,
  });

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.httpStatus });

  return NextResponse.json({ ok: true });
}
