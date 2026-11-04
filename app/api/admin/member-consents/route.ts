import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { hasAgeGateConsent } from "@/lib/legal/member-age-gate";
import { readMemberAgeGateLegacy } from "@/lib/legal/member-age-gate-legacy.server";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin member consent lookup — current SSOT + append-only events.
 * Query: ?userId=uuid
 */
export async function GET(req: NextRequest) {
  // Member PII (DOB) — same permission as /admin/users.
  const admin = await requireAdminPermission("users");
  if (!admin.ok) return admin.response;

  const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return NextResponse.json({ ok: false, error: "invalid_user_id" }, { status: 400 });
  }

  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const [profileRes, notifRes, eventsRes] = await Promise.all([
    sb
      .from("profiles")
      .select(
        "id, nickname, dibay_id, terms_accepted_at, terms_version, privacy_accepted_at, privacy_version, date_of_birth, age_gate_status, age_attested_at",
      )
      .eq("id", userId)
      .maybeSingle(),
    sb
      .from("user_notification_settings")
      .select(
        "marketing_enabled, marketing_consent_at, marketing_consent_version, marketing_consent_source",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    sb
      .from("member_consent_events")
      .select("id, kind, action, source, version, created_at, actor_admin_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (profileRes.error) {
    return NextResponse.json({ ok: false, error: profileRes.error.message }, { status: 500 });
  }
  if (!profileRes.data) {
    return NextResponse.json({ ok: false, error: "member_not_found" }, { status: 404 });
  }

  const eventsTableMissing =
    !!eventsRes.error &&
    /member_consent_events/i.test(eventsRes.error.message ?? "") &&
    /does not exist|schema cache/i.test(eventsRes.error.message ?? "");

  const events = eventsTableMissing
    ? []
    : (eventsRes.data ?? []).map((row: Record<string, unknown>) => ({
        id: String(row.id ?? ""),
        kind: String(row.kind ?? ""),
        action: String(row.action ?? ""),
        source: String(row.source ?? ""),
        version: row.version != null ? String(row.version) : null,
        createdAt: String(row.created_at ?? ""),
        actorAdminId: row.actor_admin_id != null ? String(row.actor_admin_id) : null,
      }));

  const notif = notifRes.data as Record<string, unknown> | null;
  const legacy = await readMemberAgeGateLegacy(sb, userId);
  const ageFields = {
    date_of_birth: profileRes.data.date_of_birth ?? null,
    age_gate_status: profileRes.data.age_gate_status ?? null,
    age_attested_at: profileRes.data.age_attested_at ?? null,
    age_gate_legacy: legacy.ok ? legacy.legacy : false,
  };
  /** legacy = 기존 정책 인정(연령 미기록) · verified = 신규 동의 완료 — never mixed. */
  const ageGateBasis = !legacy.ok
    ? "unknown"
    : legacy.legacy
      ? "legacy"
      : hasAgeGateConsent(ageFields)
        ? "verified"
        : ageFields.age_gate_status === "blocked_underage"
          ? "blocked_underage"
          : "missing";

  return NextResponse.json({
    ok: true,
    member: {
      id: profileRes.data.id,
      nickname: profileRes.data.nickname ?? null,
      dibayId: profileRes.data.dibay_id ?? null,
      termsAcceptedAt: profileRes.data.terms_accepted_at ?? null,
      termsVersion: profileRes.data.terms_version ?? null,
      privacyAcceptedAt: profileRes.data.privacy_accepted_at ?? null,
      privacyVersion: profileRes.data.privacy_version ?? null,
      dateOfBirth: profileRes.data.date_of_birth ?? null,
      ageGateStatus: profileRes.data.age_gate_status ?? null,
      ageAttestedAt: profileRes.data.age_attested_at ?? null,
      ageGateBasis,
      marketingEnabled: notif?.marketing_enabled === true,
      marketingConsentAt: notif?.marketing_consent_at ?? null,
      marketingConsentVersion: notif?.marketing_consent_version ?? null,
      marketingConsentSource: notif?.marketing_consent_source ?? null,
    },
    events,
    degraded: eventsTableMissing ? "events_table_missing" : null,
  });
}
