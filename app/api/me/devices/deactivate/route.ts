import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { parseJsonBody } from "@/lib/http/api-route";
import { deactivateAllUserDevicesForLogout } from "@/lib/push/dispatch/deactivate-failed-token";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DeactivateBody = {
  device_id?: unknown;
  push_token?: unknown;
  push_provider?: unknown;
  /** 동일 physical device_id의 모든 user row 비활성 (계정 전환) */
  scope?: unknown;
};

export async function POST(req: NextRequest) {
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;

  const parsed = await parseJsonBody<DeactivateBody>(req);
  const body = parsed.ok ? parsed.value : {};

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json({ ok: false, error: "server_misconfigured" }, { status: 503 });
  }

  const deviceId = typeof body.device_id === "string" ? body.device_id.trim() : "";
  const pushToken = typeof body.push_token === "string" ? body.push_token.trim() : "";
  const pushProvider = typeof body.push_provider === "string" ? body.push_provider.trim().toLowerCase() : "";
  const scope = typeof body.scope === "string" ? body.scope.trim() : "";
  const now = new Date().toISOString();

  if (scope === "device_all_users" && deviceId) {
    await svc
      .from("user_devices")
      .update({ is_active: false, updated_at: now })
      .eq("device_id", deviceId);
  } else if (pushToken && pushProvider) {
    await svc
      .from("user_devices")
      .update({ is_active: false, updated_at: now })
      .eq("user_id", auth.userId)
      .eq("push_provider", pushProvider)
      .eq("push_token", pushToken);
  } else if (pushProvider) {
    await svc
      .from("user_devices")
      .update({ is_active: false, updated_at: now })
      .eq("user_id", auth.userId)
      .eq("push_provider", pushProvider);
  } else {
    await deactivateAllUserDevicesForLogout(svc, auth.userId, deviceId || null);
  }

  return NextResponse.json({ ok: true });
}
