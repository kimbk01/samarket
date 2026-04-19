import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/supabase-server-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { endpoint?: unknown };

export async function DELETE(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  let endpoint = "";
  try {
    const text = await req.text();
    if (text.trim()) {
      const j = JSON.parse(text) as Body;
      endpoint = typeof j.endpoint === "string" ? j.endpoint.trim() : "";
    }
  } catch {
    endpoint = "";
  }

  const sb = await createSupabaseRouteHandlerClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  if (endpoint) {
    const { error } = await sb.from("web_push_subscriptions").delete().eq("user_id", auth.userId).eq("endpoint", endpoint);
    if (error && !error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
    }
  } else {
    const { error } = await sb.from("web_push_subscriptions").delete().eq("user_id", auth.userId);
    if (error && !error.message?.includes("does not exist")) {
      return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
