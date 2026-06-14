import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import { parseJsonBody } from "@/lib/http/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TestBody = {
  user_id?: unknown;
  title?: unknown;
  body?: unknown;
  device_id?: unknown;
};

export async function POST(req: NextRequest) {
  const perm = await requireAdminPermission("dev");
  if (!perm.ok) return perm.response;

  const parsed = await parseJsonBody<TestBody>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  if (!userId) {
    return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });
  }

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : "DIBAY 테스트 푸시";
  const messageBody =
    typeof body.body === "string" && body.body.trim() ? body.body.trim().slice(0, 500) : "관리자 테스트 알림입니다.";

  await dispatchPushForUser(
    {
      user_id: userId,
      notification_type: "admin_test",
      title,
      body: messageBody,
      link_url: "/my/notifications",
      link_url_absolute: null,
      occurred_at: new Date().toISOString(),
    },
    {
      target_type: "admin_test",
      skip_settings_gate: true,
    }
  );

  const svc = tryCreateSupabaseServiceClient();
  let recentDeliveries: unknown[] = [];
  if (svc) {
    const { data } = await svc
      .from("notification_deliveries")
      .select("id, status, event_type, provider_response, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);
    recentDeliveries = data ?? [];
  }

  return NextResponse.json({ ok: true, deliveries: recentDeliveries });
}
