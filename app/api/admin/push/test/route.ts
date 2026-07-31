import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { createNotificationEvent } from "@/lib/notifications/core/notification-event-repository";
import { getNotificationEventDefinition } from "@/lib/notifications/core/notification-event-registry";
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
  idempotency_key?: unknown;
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
  const targetDeviceId =
    typeof body.device_id === "string" ? body.device_id.trim().slice(0, 128) : "";
  const idempotencyKey =
    typeof body.idempotency_key === "string" && body.idempotency_key.trim()
      ? body.idempotency_key.trim().slice(0, 160)
      : randomUUID();

  console.info("[admin/push/test] start", {
    user_id: userId,
    fcm_configured: isFcmConfigured(),
    fcm_source: fcmConfigSource(),
    push_dispatch_enabled: process.env.PUSH_DISPATCH_ENABLED === "1",
    fcm_env: getFcmEnvDiagnostics(),
  });

  logFcmEnvDiagnostics("admin/push/test");
  const fcmHandle = await ensureFirebaseAdminApp();
  console.info("[admin/push/test] fcm-http-v1 warm-up", {
    ready: fcmHandle !== null,
    project_id: fcmHandle?.projectId ?? null,
  });

  const svc = tryCreateSupabaseServiceClient();
  if (!svc) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured" },
      { status: 503 }
    );
  }

  const definition = getNotificationEventDefinition("admin_test");
  const expiresAt = new Date(
    Date.now() + definition.ttlSeconds * 1_000
  ).toISOString();
  const created = await createNotificationEvent(svc, {
    userId,
    type: definition.type,
    category: definition.eventCategory,
    title,
    body: messageBody,
    dedupeKey: `admin-test:${userId}:${idempotencyKey}`,
    displayPayload: {
      routeUrl: "/my/notifications",
      previewKind: "admin_test",
      excludeFromBadge: true,
      expires_at: expiresAt,
      targetDeviceId: targetDeviceId || null,
    },
    unread: false,
  });
  if (!created.ok) {
    if (created.duplicate) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        dispatch: {
          ok: true,
          targets_found: 0,
          deliveries: [],
          skipped_reason: "duplicate_admin_test",
        },
        deliveries: [],
      });
    }
    return NextResponse.json(
      { ok: false, error: created.error },
      { status: 500 }
    );
  }

  const dispatchResult = await dispatchPushForUser(
    {
      user_id: userId,
      notification_type: "admin_test",
      title,
      body: messageBody,
      link_url: "/my/notifications",
      link_url_absolute: null,
      occurred_at: created.row.created_at,
      meta: {
        kind: "admin_test",
        notification_event_id: created.row.id,
        notification_id: created.row.id,
        event_key: definition.soundEventKey,
        badge_count: 0,
      },
    },
    {
      target_type: "admin_test",
      target_id: targetDeviceId || userId,
      skip_settings_gate: true,
      force_dispatch: true,
      event_type: "admin_test",
      event_key: definition.soundEventKey ?? undefined,
      badge_count: 0,
      notification_event_id: created.row.id,
      target_device_id: targetDeviceId || undefined,
    }
  );

  console.info("[admin/push/test] dispatch done", {
    user_id: userId,
    targets_found: dispatchResult.targets_found,
    delivery_audits: dispatchResult.deliveries.length,
    skipped_reason: dispatchResult.skipped_reason ?? null,
  });

  const recentDeliveries = dispatchResult.deliveries;
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
