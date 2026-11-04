import { requireAuthenticatedUserIdStrict } from "@/lib/auth/api-session";
import { jsonError, jsonOk } from "@/lib/http/api-route";
import { hasAgeGateConsent } from "@/lib/legal/member-age-gate";
import { readMemberAgeGateState } from "@/lib/legal/member-age-gate-legacy.server";
import { readMemberMarketingConsent } from "@/lib/legal/marketing-consent.server";
import { fetchProfileRowSafe } from "@/lib/profile/fetch-profile-row-safe";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Own consent summary + ledger. Ledger = terms/privacy/age events (append-only);
 * marketing = current state from the marketing SSOT (`user_notification_settings`).
 * DOB is never returned.
 */
export async function GET() {
  const auth = await requireAuthenticatedUserIdStrict();
  if (!auth.ok) return auth.response;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) return jsonError("인증 설정이 준비되지 않았습니다.", 503, { code: "supabase_unconfigured" });

  const [eventsRes, profile, ageState, marketing] = await Promise.all([
    sb
      .from("member_consent_events")
      .select("id, kind, action, source, version, created_at")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(100),
    fetchProfileRowSafe(sb, auth.userId),
    readMemberAgeGateState(sb, auth.userId),
    readMemberMarketingConsent(sb, auth.userId),
  ]);

  let degraded: string | undefined;
  let events: {
    id: string;
    kind: string;
    action: string;
    source: string;
    version: string | null;
    createdAt: string;
  }[] = [];
  if (eventsRes.error) {
    const msg = eventsRes.error.message ?? "";
    if (/member_consent_events/i.test(msg) && /does not exist|schema cache/i.test(msg)) degraded = "table_missing";
    else return jsonError("consent_events_load_failed", 500, { code: "consent_events_load_failed" });
  } else {
    events = (eventsRes.data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ""),
      kind: String(row.kind ?? ""),
      action: String(row.action ?? ""),
      source: String(row.source ?? ""),
      version: row.version != null ? String(row.version) : null,
      createdAt: String(row.created_at ?? ""),
    }));
  }

  const age = ageState.ok
    ? {
        state: ageState.fields.age_gate_legacy
          ? ("legacy" as const)
          : hasAgeGateConsent(ageState.fields)
            ? ("verified" as const)
            : ageState.fields.age_gate_status === "blocked_underage"
              ? ("blocked" as const)
              : ("missing" as const),
        attestedAt: ageState.fields.age_gate_legacy ? null : ageState.fields.age_attested_at ?? null,
      }
    : null;

  return jsonOk({
    events,
    ...(degraded ? { degraded } : {}),
    summary: {
      terms: { version: profile?.terms_version ?? null, at: profile?.terms_accepted_at ?? null },
      privacy: { version: profile?.privacy_version ?? null, at: profile?.privacy_accepted_at ?? null },
      age,
      marketing: marketing.ok ? marketing.consent : null,
    },
  });
}
