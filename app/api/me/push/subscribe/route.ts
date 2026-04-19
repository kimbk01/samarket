import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { enforceRateLimit, getRateLimitKey, parseJsonBody } from "@/lib/http/api-route";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SUBSCRIPTIONS_PER_USER = 10;
const MAX_ENDPOINT_LEN = 4096;

type PushBody = {
  endpoint?: unknown;
  keys?: { p256dh?: unknown; auth?: unknown };
};

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const rateLimit = await enforceRateLimit({
    key: `me:push:subscribe:${getRateLimitKey(req, auth.userId)}`,
    limit: 30,
    windowMs: 60_000,
    message: "푸시 등록 요청이 너무 빠릅니다.",
    code: "push_subscribe_rate_limited",
  });
  if (!rateLimit.ok) return rateLimit.response;

  const parsed = await parseJsonBody<PushBody>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
  const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh.trim() : "";
  const authKey = typeof body.keys?.auth === "string" ? body.keys.auth.trim() : "";

  if (!endpoint || endpoint.length > MAX_ENDPOINT_LEN || !p256dh || !authKey) {
    return NextResponse.json({ ok: false, error: "invalid_subscription" }, { status: 400 });
  }

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const ua = req.headers.get("user-agent")?.slice(0, 512) ?? null;
  const now = new Date().toISOString();

  const { error: wipeErr } = await svc.from("web_push_subscriptions").delete().eq("endpoint", endpoint);
  if (wipeErr) {
    const msg = wipeErr.message ?? "";
    if (msg.includes("does not exist") || wipeErr.code === "42P01") {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  const { count, error: countErr } = await svc
    .from("web_push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", auth.userId);

  if (countErr) {
    return NextResponse.json({ ok: false, error: "query_failed" }, { status: 500 });
  }

  const n = count ?? 0;
  if (n >= MAX_SUBSCRIPTIONS_PER_USER) {
    const { data: oldest, error: oldErr } = await svc
      .from("web_push_subscriptions")
      .select("id")
      .eq("user_id", auth.userId)
      .order("updated_at", { ascending: true })
      .limit(1);
    if (oldErr || !oldest?.length) {
      return NextResponse.json({ ok: false, error: "capacity_trim_failed" }, { status: 500 });
    }
    await svc.from("web_push_subscriptions").delete().eq("id", oldest[0].id);
  }

  const { error: insErr } = await svc.from("web_push_subscriptions").insert({
    user_id: auth.userId,
    endpoint,
    key_p256dh: p256dh,
    key_auth: authKey,
    user_agent: ua,
    updated_at: now,
  });

  if (insErr) {
    if (insErr.message?.includes("does not exist") || insErr.code === "42P01") {
      return NextResponse.json({ ok: false, error: "table_missing" }, { status: 503 });
    }
    console.error("[push/subscribe]", insErr.message);
    return NextResponse.json({ ok: false, error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
