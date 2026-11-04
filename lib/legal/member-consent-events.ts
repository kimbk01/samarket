/**
 * Append-only member consent event ledger (design §16.6).
 * Writers must INSERT only — never UPDATE/DELETE historical rows.
 * Required consent paths must NOT soft-skip ledger failures (use record_member_required_consent RPC).
 * Settings marketing toggles use appendMemberConsentEventStrict — fail the write if ledger fails.
 */
export const MEMBER_CONSENT_EVENT_KINDS = [
  "terms",
  "privacy",
  "marketing",
  "age_attestation",
] as const;
export type MemberConsentEventKind = (typeof MEMBER_CONSENT_EVENT_KINDS)[number];

export const MEMBER_CONSENT_EVENT_ACTIONS = ["agree", "withdraw", "admin_note"] as const;
export type MemberConsentEventAction = (typeof MEMBER_CONSENT_EVENT_ACTIONS)[number];

export const MEMBER_CONSENT_EVENT_SOURCES = [
  "signup",
  "reconsent",
  "settings",
  "migration",
  "admin",
] as const;
export type MemberConsentEventSource = (typeof MEMBER_CONSENT_EVENT_SOURCES)[number];

export type MemberConsentEventInsert = {
  userId: string;
  kind: MemberConsentEventKind;
  action: MemberConsentEventAction;
  source: MemberConsentEventSource;
  version?: string | null;
  actorAdminId?: string | null;
};

export type AppendConsentEventResult =
  | { ok: true }
  | { ok: false; code: "table_missing" | "insert_failed"; reason: string };

function classifyInsertError(message: string): AppendConsentEventResult {
  const msg = String(message ?? "");
  if (/member_consent_events/i.test(msg) && /does not exist|schema cache/i.test(msg)) {
    return { ok: false, code: "table_missing", reason: "table_missing" };
  }
  return { ok: false, code: "insert_failed", reason: msg || "insert_failed" };
}

/** Strict append — table missing / insert failure ⇒ ok:false (never silent success). */
export async function appendMemberConsentEventStrict(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service/route supabase client
  sb: any,
  input: MemberConsentEventInsert,
): Promise<AppendConsentEventResult> {
  try {
    const { error } = await sb.from("member_consent_events").insert({
      user_id: input.userId,
      kind: input.kind,
      action: input.action,
      source: input.source,
      version: input.version?.trim() || null,
      actor_admin_id: input.actorAdminId ?? null,
    });
    if (error) return classifyInsertError(error.message ?? "");
    return { ok: true };
  } catch (e) {
    return classifyInsertError(e instanceof Error ? e.message : "insert_failed");
  }
}

/** @deprecated Prefer appendMemberConsentEventStrict — kept name for call-site migration. */
export async function appendMemberConsentEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  input: MemberConsentEventInsert,
): Promise<AppendConsentEventResult> {
  return appendMemberConsentEventStrict(sb, input);
}

export async function appendMemberConsentEventsStrict(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  events: MemberConsentEventInsert[],
): Promise<AppendConsentEventResult> {
  for (const ev of events) {
    const r = await appendMemberConsentEventStrict(sb, ev);
    if (!r.ok) return r;
  }
  return { ok: true };
}
