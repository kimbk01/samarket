import { type NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/auth/get-route-user-id";
import { getSupabaseServer } from "@/lib/chat/supabase-server";

export const dynamic = "force-dynamic";

function sbOr503() {
  try {
    return getSupabaseServer();
  } catch {
    return null;
  }
}

function errText(e: { message?: string; details?: string }): string {
  return `${e.message ?? ""} ${e.details ?? ""}`;
}

/** GET — 매장(commerce) 알림 이메일 수신 여부. 컬럼 없으면 column_missing: true, 값은 기본 수신(true). */
export async function GET() {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = sbOr503();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const r = await sb.from("profiles").select("notify_commerce_email").eq("id", userId).maybeSingle();
  if (r.error) {
    const msg = errText(r.error);
    if (msg.includes("notify_commerce_email")) {
      return NextResponse.json({
        ok: true,
        notify_commerce_email: true,
        column_missing: true,
      });
    }
    console.error("[GET profile/notification-email]", r.error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }

  const v = (r.data as { notify_commerce_email?: boolean | null } | null)?.notify_commerce_email;
  return NextResponse.json({
    ok: true,
    notify_commerce_email: v !== false,
    column_missing: false,
  });
}

type PatchBody = { notify_commerce_email?: boolean };

/** PATCH — body: { notify_commerce_email: boolean } */
export async function PATCH(req: NextRequest) {
  const userId = await getRouteUserId();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const sb = sbOr503();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.notify_commerce_email !== "boolean") {
    return NextResponse.json({ ok: false, error: "notify_commerce_email_boolean_required" }, { status: 400 });
  }

  const { data: exists, error: selErr } = await sb.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (selErr) {
    console.error("[PATCH profile/notification-email select]", selErr);
    return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
  }
  if (!exists) {
    return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404 });
  }

  const { error } = await sb
    .from("profiles")
    .update({ notify_commerce_email: body.notify_commerce_email })
    .eq("id", userId);

  if (error) {
    const msg = errText(error);
    if (msg.includes("notify_commerce_email")) {
      return NextResponse.json({ ok: false, error: "column_missing" }, { status: 503 });
    }
    console.error("[PATCH profile/notification-email]", error);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    notify_commerce_email: body.notify_commerce_email,
  });
}
