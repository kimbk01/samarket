import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { loadPhoneOtpOpsSnapshot, setAuthPhoneOtpEnabled } from "@/lib/auth/phone-otp-ops";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Service ops — settings permission (not per-member users_edit_membership). */
export async function GET(req: NextRequest) {
  const gate = await requireAdminPermission("settings");
  if (!gate.ok) return gate.response;
  const sb = gate.sb ?? tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_unconfigured" }, { status: 503 });
  }
  const force = req.nextUrl.searchParams.get("refresh") === "1";
  const snapshot = await loadPhoneOtpOpsSnapshot(sb, { probeProvider: true, forceProbe: force });
  return NextResponse.json({
    ok: true,
    ops: {
      ...snapshot,
      security: {
        ok: snapshot.security.ok,
        missing: snapshot.security.missing,
        envEnableConflict: snapshot.security.envEnableConflict,
        hashSecretConfigured: snapshot.security.hashSecretConfigured,
        semaphoreKeyConfigured: snapshot.security.semaphoreKeyConfigured,
      },
    },
  });
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdminPermission("settings");
  if (!gate.ok) return gate.response;
  const sb = gate.sb ?? tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_service_unconfigured" }, { status: 503 });
  }

  let body: { enabled?: boolean; reason?: string; expectedVersion?: number; confirm?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (body.confirm !== true) {
    return NextResponse.json(
      { ok: false, error: "confirm_required", message: "2중 확인이 필요합니다." },
      { status: 400 },
    );
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ ok: false, error: "invalid_enabled" }, { status: 400 });
  }
  const expectedVersion = Math.floor(Number(body.expectedVersion));
  if (!Number.isFinite(expectedVersion) || expectedVersion < 1) {
    return NextResponse.json({ ok: false, error: "invalid_version" }, { status: 400 });
  }

  const result = await setAuthPhoneOtpEnabled({
    sb,
    actorId: gate.actor.userId,
    enabled: body.enabled,
    reason: String(body.reason ?? ""),
    expectedVersion,
  });
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.code,
        message: result.message,
        currentVersion: result.currentVersion ?? null,
        blockers: result.blockers ?? null,
      },
      { status: result.status },
    );
  }

  const snapshot = await loadPhoneOtpOpsSnapshot(sb, { probeProvider: true, forceProbe: false });
  return NextResponse.json({
    ok: true,
    enabled: result.enabled,
    rowVersion: result.rowVersion,
    invalidatedChallenges: result.invalidatedChallenges,
    ops: snapshot,
  });
}
