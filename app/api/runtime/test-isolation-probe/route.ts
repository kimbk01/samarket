/**
 * TEST-only public probe — no secrets in response.
 * Verifies DB target, service_role JWT ref claim, banner, outbound blocks.
 */
import { NextResponse } from "next/server";
import { resolveDataResetDatabaseTarget } from "@/lib/admin/data-reset/database-target-guard";
import {
  evaluateTestAccess,
  isTestRuntimeSurface,
} from "@/lib/config/test-access-control";
import { resolveRuntimeBannerVariant } from "@/lib/config/resolve-runtime-banner-variant";
import {
  evaluateSideEffectDispatchGate,
  resolveServerDeployTier,
} from "@/lib/config/test-production-isolation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jwtRefClaim(token: string | undefined): string | null {
  const raw = (token ?? "").trim();
  if (!raw || raw.split(".").length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(raw.split(".")[1]!, "base64url").toString("utf8")
    ) as { ref?: unknown };
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

function present(envKey: string): boolean {
  return Boolean((process.env[envKey] ?? "").trim());
}

export async function GET() {
  if (!isTestRuntimeSurface()) {
    return NextResponse.json(
      { ok: false, error: "not_test_surface" },
      { status: 404 }
    );
  }

  const db = resolveDataResetDatabaseTarget();
  const serviceRoleRef = jwtRefClaim(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anonRef = jwtRefClaim(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const expected = db.projectRef;
  const prodRef = "ckdosyydvgzqwpbwuhon";
  const banner = resolveRuntimeBannerVariant();
  const gate = evaluateSideEffectDispatchGate();
  const accessEmpty = evaluateTestAccess({ userId: null, email: null });

  return NextResponse.json({
    ok: true,
    deployTier: resolveServerDeployTier(),
    vercelEnv: (process.env.VERCEL_ENV ?? "").trim() || null,
    vercelTargetEnv: (process.env.VERCEL_TARGET_ENV ?? "").trim() || null,
    runtimeSurface: (process.env.NEXT_PUBLIC_DIBAY_RUNTIME_SURFACE ?? "").trim() || null,
    databaseTarget: db.target,
    projectRef: db.projectRef,
    anonRefClaim: anonRef,
    serviceRoleRefClaim: serviceRoleRef,
    serviceRoleMatchesUrl: Boolean(
      expected && serviceRoleRef && serviceRoleRef === expected
    ),
    anonMatchesUrl: Boolean(expected && anonRef && anonRef === expected),
    isProductionRef: expected === prodRef || serviceRoleRef === prodRef,
    bannerVariant: banner.variant,
    sideEffectGateAllowed: gate.allowed,
    sideEffectGateReason: gate.reason,
    pushDispatchEnabled: (process.env.PUSH_DISPATCH_ENABLED ?? "").trim(),
    webPushEnabled: (process.env.WEB_PUSH_ENABLED ?? "").trim(),
    outboundCredentialsPresent: {
      agoraAppId: present("NEXT_PUBLIC_COMMUNITY_MESSENGER_AGORA_APP_ID"),
      agoraCertificate: present("COMMUNITY_MESSENGER_AGORA_APP_CERTIFICATE"),
      fcm: present("FCM_SERVICE_ACCOUNT_JSON_BASE64") || present("FCM_PRIVATE_KEY"),
      apns: present("APNS_KEY_P8"),
      semaphore: present("SEMAPHORE_API_KEY"),
    },
    testAllowlistEmptyDenies: accessEmpty.required && !accessEmpty.allowed,
  });
}
