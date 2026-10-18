/**
 * B4 — "has this member ever given legal consent" on the client, for post-login device side effects
 * (OS notification prompt, Android FSI nudge, push device registration).
 *
 * First entry contract: those side effects start only after the member accepted terms + privacy.
 * Re-consent after an Admin version publish does NOT stop push delivery for an existing member —
 * new writes are gated server-side (B3) instead.
 */
import { peekAppBootProfile } from "@/lib/app-boot/app-boot-store";
import { getSupabaseProfileCache } from "@/lib/auth/supabase-profile-cache";

export type ClientEverConsentedState = "consented" | "not_consented" | "unknown";

/** Fired after the consent form saved successfully (client side). */
export const DIBAY_LEGAL_CONSENT_COMPLETED_EVENT = "dibay:legal-consent-completed";

export function notifyLegalConsentCompleted(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DIBAY_LEGAL_CONSENT_COMPLETED_EVENT));
}

function pick(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export function resolveClientEverConsentedState(): ClientEverConsentedState {
  const boot = peekAppBootProfile();
  const cached = getSupabaseProfileCache();
  const sources = [boot, cached].filter((p) => Boolean(p?.id)) as Array<{
    terms_accepted_at?: string | null;
    privacy_accepted_at?: string | null;
  }>;
  if (!sources.length) return "unknown";
  return sources.some((p) => pick(p.terms_accepted_at) && pick(p.privacy_accepted_at))
    ? "consented"
    : "not_consented";
}
