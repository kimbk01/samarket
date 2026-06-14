import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { dispatchPushForUser } from "@/lib/push/dispatch/dispatch-push-for-user";
import { ensureFirebaseAdminApp } from "@/lib/push/dispatch/fcm-sender-impl";
import {
  fcmConfigSource,
  getFcmEnvDiagnostics,
  isFcmConfigured,
  logFcmEnvDiagnostics,
} from "@/lib/push/dispatch/read-fcm-service-account";
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

type DeliveryRow = {
  id: string;
  status: string;
  event_type: string | null;
  provider_response: Record<string, unknown> | null;
  created_at: string;
  device_id?: string | null;
};

async function loadRecentDeliveries(userId: string): Promise<DeliveryRow[]> {
  const svc = tryCreateSupabaseServiceClient();
  if (!svc) return [];
  const { data } = await svc
    .from("notification_deliveries")
    .select("id, status, event_type, provider_response, created_at, device_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as DeliveryRow[];
}

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

  console.info("[admin/push/test] start", {
    user_id: userId,
    fcm_configured: isFcmConfigured(),
    fcm_source: fcmConfigSource(),
    push_dispatch_enabled: process.env.PUSH_DISPATCH_ENABLED === "1",
    fcm_env: getFcmEnvDiagnostics(),
  });

  logFcmEnvDiagnostics("admin/push/test");
  const firebaseApp = await ensureFirebaseAdminApp();
  console.info("[admin/push/test] firebase-admin warm-up", {
    ready: firebaseApp !== null,
    app_name: firebaseApp?.name ?? null,
  });

  const dispatchResult = await dispatchPushForUser(
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
      force_dispatch: true,
      event_type: "admin_test",
    }
  );

  console.info("[admin/push/test] dispatch done", {
    user_id: userId,
    targets_found: dispatchResult.targets_found,
    delivery_audits: dispatchResult.deliveries.length,
    skipped_reason: dispatchResult.skipped_reason ?? null,
  });

  const recentDeliveries = await loadRecentDeliveries(userId);
  const fcmEnv = getFcmEnvDiagnostics();

  if (recentDeliveries.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_deliveries_recorded",
        dispatch: dispatchResult,
        deliveries: [],
      },
      { status: 503 }
    );
  }

  const latest = recentDeliveries[0];
  const latestResponse = latest?.provider_response ?? {};
  if (
    latest?.status === "skipped" &&
    latestResponse.reason === "fcm_not_configured" &&
    latestResponse.source === "none"
  ) {
    console.error("[admin/push/test] FAIL — FCM env source none", {
      user_id: userId,
      fcm_env: fcmEnv,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "fcm_env_missing",
        dispatch: dispatchResult,
        deliveries: recentDeliveries,
        fcm_env: fcmEnv,
      },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    dispatch: dispatchResult,
    deliveries: recentDeliveries,
    fcm_env: fcmEnv,
  });
}
