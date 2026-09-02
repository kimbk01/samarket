/**
 * Support guidance server authority (PHASE 3-A).
 * Admin CRUD via service client after isRouteAdmin gate at API layer.
 * Customer reads enabled entries through this module (not client writes).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  assertGuidanceOpenConsistency,
  isSupportGuidanceOutcome,
  validateSupportGuidanceCta,
  type SupportGuidanceCtaKind,
  type SupportGuidanceEntryRow,
  type SupportGuidanceOutcome,
} from "@/lib/support/support-guidance-authority";

function isMissingGuidanceTable(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("support_guidance_entries") && m.includes("does not exist");
}

export async function getSupportGuidanceEntryById(
  sb: SupabaseClient,
  guidanceKey: string
): Promise<
  | { ok: true; entry: SupportGuidanceEntryRow }
  | { ok: false; error: string }
> {
  const id = guidanceKey.trim();
  if (!id) return { ok: false, error: "guidance_not_found" };
  const { data, error } = await sb
    .from("support_guidance_entries")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    if (isMissingGuidanceTable(error.message ?? "")) {
      return { ok: false, error: "missing_guidance_table" };
    }
    return { ok: false, error: error.message };
  }
  if (!data) return { ok: false, error: "guidance_not_found" };
  return { ok: true, entry: data as SupportGuidanceEntryRow };
}

export async function assertSupportGuidanceForCaseOpen(
  sb: SupabaseClient,
  input: {
    audience: "MEMBER" | "OWNER";
    category: string;
    issueType: string | null;
    guidanceKey?: string | null;
    guidanceRevision?: number | null;
    guidanceOutcome?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = input.guidanceKey?.trim() || "";
  const hasMeta =
    Boolean(key) ||
    input.guidanceRevision != null ||
    Boolean(input.guidanceOutcome?.trim());

  if (!hasMeta) return { ok: true };

  if (!key) return { ok: false, error: "guidance_not_found" };

  if (input.guidanceOutcome?.trim()) {
    if (!isSupportGuidanceOutcome(input.guidanceOutcome.trim())) {
      return { ok: false, error: "invalid_guidance_outcome" };
    }
  }

  const loaded = await getSupportGuidanceEntryById(sb, key);
  if (!loaded.ok) return loaded;

  return assertGuidanceOpenConsistency({
    entry: loaded.entry,
    audience: input.audience,
    category: input.category,
    issueType: input.issueType,
    guidanceKey: key,
    guidanceRevision: input.guidanceRevision,
    requireEnabled: true,
  });
}

export async function listEnabledSupportGuidance(
  sb: SupabaseClient,
  input: { audience: "MEMBER" | "OWNER"; category: string; issueType: string }
): Promise<
  | { ok: true; entries: SupportGuidanceEntryRow[] }
  | { ok: false; error: string }
> {
  const { data, error } = await sb
    .from("support_guidance_entries")
    .select("*")
    .eq("audience", input.audience)
    .eq("category", input.category.trim())
    .eq("issue_type", input.issueType.trim())
    .eq("enabled", true)
    .order("sort_order", { ascending: true });
  if (error) {
    if (isMissingGuidanceTable(error.message ?? "")) {
      return { ok: false, error: "missing_guidance_table" };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, entries: (data ?? []) as SupportGuidanceEntryRow[] };
}

export async function adminUpsertSupportGuidanceEntry(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    id?: string;
    audience: "MEMBER" | "OWNER";
    category: string;
    issueType: string;
    title: string;
    body: string;
    enabled?: boolean;
    sortOrder?: number;
    ctaKind?: SupportGuidanceCtaKind;
    ctaTarget?: string | null;
    escalationAllowed?: boolean;
  }
): Promise<
  | { ok: true; entry: SupportGuidanceEntryRow }
  | { ok: false; error: string }
> {
  const cta = validateSupportGuidanceCta(
    input.ctaKind ?? "NONE",
    input.ctaTarget ?? null
  );
  if (!cta.ok) return cta;

  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) return { ok: false, error: "missing_guidance_content" };

  const now = new Date().toISOString();
  const existingId = input.id?.trim() || "";

  if (existingId) {
    const loaded = await getSupportGuidanceEntryById(sb, existingId);
    if (!loaded.ok) return loaded;
    const { data, error } = await sb
      .from("support_guidance_entries")
      .update({
        audience: input.audience,
        category: input.category.trim(),
        issue_type: input.issueType.trim(),
        title,
        body,
        enabled: input.enabled !== false,
        sort_order: input.sortOrder ?? loaded.entry.sort_order,
        cta_kind: cta.kind,
        cta_target: cta.target,
        escalation_allowed: input.escalationAllowed !== false,
        revision: Number(loaded.entry.revision) + 1,
        updated_by: input.adminUserId,
        updated_at: now,
      })
      .eq("id", existingId)
      .select("*")
      .single();
    if (error || !data) {
      return { ok: false, error: error?.message ?? "update_failed" };
    }
    return { ok: true, entry: data as SupportGuidanceEntryRow };
  }

  const { data, error } = await sb
    .from("support_guidance_entries")
    .insert({
      audience: input.audience,
      category: input.category.trim(),
      issue_type: input.issueType.trim(),
      title,
      body,
      enabled: input.enabled !== false,
      sort_order: input.sortOrder ?? 0,
      cta_kind: cta.kind,
      cta_target: cta.target,
      escalation_allowed: input.escalationAllowed !== false,
      revision: 1,
      created_by: input.adminUserId,
      updated_by: input.adminUserId,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error || !data) {
    if (isMissingGuidanceTable(error?.message ?? "")) {
      return { ok: false, error: "missing_guidance_table" };
    }
    return { ok: false, error: error?.message ?? "create_failed" };
  }
  return { ok: true, entry: data as SupportGuidanceEntryRow };
}

export type { SupportGuidanceOutcome };
