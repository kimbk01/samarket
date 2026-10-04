import type { SupabaseClient } from "@supabase/supabase-js";
import { invalidateNotificationBadgeCache } from "@/lib/notifications/pipeline/notify-badge-service";
import type { SupportContext } from "@/lib/support/support-context";
import { isSupportContextEnabled } from "@/lib/support/support-context";
import { getCachedStoreIfOwner } from "@/lib/stores/owner-store-ownership-cache";
import { createAndDispatchNotificationEvent } from "@/lib/notifications/pipeline/notification-event-dispatcher";
import {
  ACTIVE_SUPPORT_CASE_STATUSES,
  buildAdminSupportCaseRoute,
  buildSupportCaseRoute,
  type SupportCaseRow,
  type SupportMessageRow,
  type SupportCaseStatus,
  type SupportCasePriority,
  type AdminSupportListFilter,
  ADMIN_SUPPORT_TABS,
  ADMIN_SUPPORT_TAB_STATUSES,
  type AdminSupportTab,
} from "@/lib/support/support-case-types";
import { getSupportCategoryGroup } from "@/lib/support/support-category-groups";

export type { AdminSupportListFilter } from "@/lib/support/support-case-types";
import {
  assertSupportReferenceAuthority,
  normalizeSupportContextForCase,
} from "@/lib/support/support-reference-authority";
import { validateSupportCategoryForOpen } from "@/lib/support/support-category-registry";
import { assertSupportGuidanceForCaseOpen } from "@/lib/support/support-guidance-service";
import { assertSupportGenericHubCategoryPolicy } from "@/lib/support/support-generic-hub-policy";
import type { SupportGuidanceOutcome } from "@/lib/support/support-guidance-authority";

function isMissingSupportTable(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes("support_cases") && m.includes("does not exist");
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

async function allocatePublicCaseNo(sb: SupabaseClient): Promise<string> {
  const { data, error } = await sb.rpc("allocate_support_public_case_no");
  if (!error && typeof data === "string" && data.trim()) {
    return data.trim();
  }
  const fallback = `${Date.now()}`.slice(-8);
  return `SC-${fallback}`;
}

function defaultSubject(category: string, sourceSurface: string): string {
  const cat = category.trim();
  const surface = sourceSurface.trim();
  if (!cat) return surface || "SUPPORT";
  return surface ? `${cat} · ${surface}` : cat;
}

function buildDefaultTriageSeed(category: string, issueType: string | null): string {
  const c = category.trim() || "SUPPORT";
  const i = (issueType ?? "").trim();
  return i ? `문의 접수 · ${c} · ${i}` : `문의 접수 · ${c}`;
}

/**
 * PHASE 3-A open payload.
 *
 * Existing contextual callers (FAB / hubs / shells) omit issueType →
 * centralized allowMissingIssue path (NULL issue_type).
 * New structured triage later must pass allowMissingIssue: false.
 */
export type OpenSupportCaseInput = {
  userId: string;
  context: SupportContext;
  initialBody?: string;
  issueType?: string | null;
  initialSummary?: string | null;
  guidanceKey?: string | null;
  guidanceRevision?: number | null;
  guidanceOutcome?: SupportGuidanceOutcome | string | null;
  /**
   * Default true for Production contextual callers.
   * Structured triage must set false so issue_type is required.
   */
  allowMissingIssue?: boolean;
  /** Required when generic hub opens with OTHER after user picked 기타. */
  explicitOtherSelection?: boolean;
};

async function recordCaseEvent(
  sb: SupabaseClient,
  input: {
    caseId: string;
    eventType: string;
    actorUserId?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const { error } = await sb.from("support_case_events").insert({
    case_id: input.caseId,
    event_type: input.eventType,
    actor_user_id: input.actorUserId ?? null,
    payload: input.payload ?? {},
  });
  if (error) {
    // DEF-05 (Phase 1 observability only): audit-trail write failure must be visible.
    console.error("[support] case_event_insert_failed", {
      caseId: input.caseId,
      eventType: input.eventType,
      error: error.message,
    });
  }
}

async function notifySupportEvent(
  sb: SupabaseClient,
  input: {
    userId: string;
    type:
      | "support_case_created"
      | "support_admin_replied"
      | "support_customer_replied"
      | "support_case_assigned"
      | "support_case_resolved"
      | "support_case_reopened";
    title: string;
    body: string;
    caseId: string;
    publicCaseNo: string;
    audience: "MEMBER" | "OWNER";
    storeId?: string | null;
    dedupeKey: string;
    actorUserId?: string;
    /** Override canonical deeplink (e.g. admin detail for support_customer_replied). */
    routeUrl?: string;
  }
): Promise<void> {
  const routeUrl =
    input.routeUrl ??
    (input.audience === "OWNER" && input.storeId
      ? `${buildSupportCaseRoute(input.caseId)}?storeId=${encodeURIComponent(input.storeId)}`
      : buildSupportCaseRoute(input.caseId));
  const notified = await createAndDispatchNotificationEvent(sb, {
    userId: input.userId,
    type: input.type,
    category: input.type === "support_admin_replied" ? "inquiry_answered" : "admin_notice",
    title: input.title,
    body: input.body.slice(0, 500),
    displayPayload: {
      routeUrl,
      supportCaseId: input.caseId,
      publicCaseNo: input.publicCaseNo,
      previewKind: "support_case",
      audience: input.audience,
      ...(input.storeId ? { ownerStoreId: input.storeId } : {}),
    },
    dedupeKey: input.dedupeKey,
    actorUserId: input.actorUserId,
    appState: "background",
  });
  if (!notified.ok && !notified.duplicate) {
    // DEF-05 (Phase 1 observability only): notification failure must not be silent.
    console.error("[support] notification_failed", {
      caseId: input.caseId,
      type: input.type,
      error: notified.error,
    });
  }
}

export async function openSupportCaseFromContext(
  sb: SupabaseClient,
  input: OpenSupportCaseInput
): Promise<
  | { ok: true; case: SupportCaseRow; sessionId: string; created: boolean }
  | { ok: false; error: string }
> {
  if (!isSupportContextEnabled(input.context)) {
    return { ok: false, error: "disabled_context" };
  }

  const norm = normalizeSupportContextForCase(input.context);

  // AUTH already done by API; then audience → store → category → issue → ref → guidance
  if (norm.audience === "OWNER") {
    const storeId = norm.ownerStoreId ?? "";
    if (!storeId) return { ok: false, error: "missing_store_id" };
    const gate = await getCachedStoreIfOwner(sb, input.userId, storeId);
    if (!gate.ok) return { ok: false, error: "store_forbidden" };
  } else if (norm.ownerStoreId) {
    return { ok: false, error: "member_case_must_not_have_store" };
  }

  const allowMissingIssue = input.allowMissingIssue !== false;
  const cat = validateSupportCategoryForOpen({
    audience: norm.audience,
    category: norm.category,
    issueType: input.issueType,
    allowMissingIssue,
  });
  if (!cat.ok) return { ok: false, error: cat.error };

  const hubPolicy = assertSupportGenericHubCategoryPolicy({
    sourceSurface: norm.sourceSurface,
    canonicalCategory: cat.category,
    explicitOtherSelection:
      input.explicitOtherSelection === true ||
      input.context.explicitOtherSelection === true,
  });
  if (!hubPolicy.ok) return { ok: false, error: hubPolicy.error };

  const ref = await assertSupportReferenceAuthority(sb, {
    userId: input.userId,
    audience: norm.audience,
    storeId: norm.ownerStoreId,
    referenceType: norm.referenceType,
    referenceId: norm.referenceId,
  });
  if (!ref.ok) return { ok: false, error: ref.error };

  const guidance = await assertSupportGuidanceForCaseOpen(sb, {
    audience: norm.audience,
    category: cat.category,
    issueType: cat.issueType,
    guidanceKey: input.guidanceKey,
    guidanceRevision: input.guidanceRevision,
    guidanceOutcome: input.guidanceOutcome,
  });
  if (!guidance.ok) return { ok: false, error: guidance.error };

  const initialSummary =
    typeof input.initialSummary === "string"
      ? input.initialSummary.trim().slice(0, 2000) || null
      : null;
  const guidanceKey = input.guidanceKey?.trim() || null;
  const guidanceRevision =
    input.guidanceRevision == null ? null : Number(input.guidanceRevision);
  const guidanceOutcome = input.guidanceOutcome?.trim() || null;

  // Dedupe key = uq_support_cases_one_active_per_key (DEF-14). Built fresh per read.
  const findActiveCase = () => {
    let q = sb
      .from("support_cases")
      .select("*")
      .eq("requester_user_id", input.userId)
      .eq("audience", norm.audience)
      .eq("category", cat.category)
      .in("status", Array.from(ACTIVE_SUPPORT_CASE_STATUSES));
    if (norm.audience === "OWNER") {
      q = q.eq("owner_store_id", norm.ownerStoreId!);
    } else {
      q = q.is("owner_store_id", null);
    }
    if (norm.referenceType && norm.referenceId) {
      q = q.eq("reference_type", norm.referenceType).eq("reference_id", norm.referenceId);
    } else {
      q = q.is("reference_type", null).is("reference_id", null);
    }
    return q.order("last_message_at", { ascending: false }).limit(1).maybeSingle();
  };

  const { data: existing, error: existingErr } = await findActiveCase();

  if (existingErr) {
    if (isMissingSupportTable(existingErr.message ?? "")) {
      return { ok: false, error: "missing_table" };
    }
    return { ok: false, error: existingErr.message };
  }

  // DEF-01/DEF-14: one path for "an active case already exists" — used by the dedupe
  // query and by the unique-index race (23505) on insert.
  const continueActiveCase = async (
    existing: SupportCaseRow
  ): Promise<
    | { ok: true; case: SupportCaseRow; sessionId: string; created: boolean }
    | { ok: false; error: string }
  > => {
    const session = await ensureOpenSupportSession(sb, {
      caseId: existing.id,
      requesterUserId: input.userId,
    });
    if (!session.ok) return { ok: false, error: session.error };
    // DEF-01: dedupe reuses the active case, but the customer's newly typed text must be
    // kept — append it through the canonical requester write path (→ WAITING_ADMIN).
    const followUpText = (initialSummary ?? input.initialBody ?? "").trim();
    let reusedCase = existing;
    if (followUpText) {
      const appended = await postRequesterSupportMessage(sb, {
        userId: input.userId,
        caseId: existing.id,
        body: followUpText,
      });
      if (!appended.ok) return { ok: false, error: appended.error };
      const reread = await getSupportCaseForUser(sb, {
        userId: input.userId,
        caseId: existing.id,
      });
      if (reread.ok) reusedCase = reread.case;
    }
    return {
      ok: true,
      case: reusedCase,
      sessionId: session.sessionId,
      created: false,
    };
  };

  if (existing) return continueActiveCase(existing as SupportCaseRow);

  const now = new Date().toISOString();
  const publicCaseNo = await allocatePublicCaseNo(sb);
  const subject = defaultSubject(cat.category, norm.sourceSurface);

  const { data: created, error: createErr } = await sb
    .from("support_cases")
    .insert({
      public_case_no: publicCaseNo,
      audience: norm.audience,
      requester_user_id: input.userId,
      owner_store_id: norm.audience === "OWNER" ? norm.ownerStoreId : null,
      category: cat.category,
      issue_type: cat.issueType,
      subject,
      source_surface: norm.sourceSurface,
      reference_type: norm.referenceType ?? null,
      reference_id: norm.referenceId ?? null,
      initial_summary: initialSummary,
      guidance_key: guidanceKey,
      guidance_revision: Number.isFinite(guidanceRevision as number)
        ? guidanceRevision
        : null,
      guidance_outcome: guidanceOutcome,
      status: "OPEN",
      priority: "NORMAL",
      admin_unread_count: 0,
      requester_unread_count: 0,
      last_message_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (createErr || !created) {
    if (isMissingSupportTable(createErr?.message ?? "")) {
      return { ok: false, error: "missing_table" };
    }
    // DEF-14: a concurrent open won the unique active-key index — continue that case.
    if ((createErr as { code?: string } | null)?.code === "23505") {
      const { data: raced } = await findActiveCase();
      if (raced) return continueActiveCase(raced as SupportCaseRow);
    }
    return { ok: false, error: createErr?.message ?? "create_failed" };
  }

  const session = await ensureOpenSupportSession(sb, {
    caseId: created.id,
    requesterUserId: input.userId,
  });
  if (!session.ok) return { ok: false, error: session.error };

  const initialBody = (input.initialBody ?? "").trim();
  const hasStructuredSummary = Boolean(initialSummary);

  if (hasStructuredSummary) {
    const seed = initialBody || buildDefaultTriageSeed(cat.category, cat.issueType);
    await appendSupportMessage(sb, {
      caseId: created.id,
      senderUserId: input.userId,
      audience: norm.audience,
      body: seed,
      messageType: "PUBLIC",
      systemSeed: true,
    });
  } else if (initialBody) {
    await appendSupportMessage(sb, {
      caseId: created.id,
      senderUserId: input.userId,
      audience: norm.audience,
      body: initialBody,
      messageType: "PUBLIC",
    });
  } else {
    await appendSupportMessage(sb, {
      caseId: created.id,
      senderUserId: input.userId,
      audience: norm.audience,
      body: "문의를 시작했습니다.",
      messageType: "PUBLIC",
      systemSeed: true,
    });
  }

  await recordCaseEvent(sb, {
    caseId: created.id,
    eventType: "case_created",
    actorUserId: input.userId,
    payload: {
      category: cat.category,
      issue_type: cat.issueType,
      issue_compatibility: cat.issueCompatibility,
      source_surface: norm.sourceSurface,
      reference_type: norm.referenceType ?? null,
      reference_id: norm.referenceId ?? null,
      guidance_key: guidanceKey,
      guidance_revision: guidanceRevision,
      guidance_outcome: guidanceOutcome,
    },
  });

  // Phase 3 A5 — no self-notification on case creation (legacy parity: the requester is
  // looking at the conversation already). Admins learn via support_messages Realtime (A1).

  return {
    ok: true,
    case: created as SupportCaseRow,
    sessionId: session.sessionId,
    created: true,
  };
}

async function ensureOpenSupportSession(
  sb: SupabaseClient,
  input: { caseId: string; requesterUserId: string }
): Promise<{ ok: true; sessionId: string } | { ok: false; error: string }> {
  const { data: open } = await sb
    .from("support_sessions")
    .select("id")
    .eq("case_id", input.caseId)
    .is("closed_at", null)
    .maybeSingle();
  if (open?.id) return { ok: true, sessionId: String(open.id) };

  const { data, error } = await sb
    .from("support_sessions")
    .insert({
      case_id: input.caseId,
      requester_user_id: input.requesterUserId,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "session_failed" };
  return { ok: true, sessionId: String(data.id) };
}

export async function getSupportCaseForUser(
  sb: SupabaseClient,
  input: { userId: string; caseId: string }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  if (!isUuid(input.caseId)) return { ok: false, error: "invalid_case_id" };
  const { data, error } = await sb
    .from("support_cases")
    .select("*")
    .eq("id", input.caseId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "not_found" };
  const row = data as SupportCaseRow;
  if (row.requester_user_id !== input.userId) return { ok: false, error: "forbidden" };
  if (row.audience === "OWNER" && row.owner_store_id) {
    const gate = await getCachedStoreIfOwner(sb, input.userId, row.owner_store_id);
    if (!gate.ok) return { ok: false, error: "forbidden" };
  }
  return { ok: true, case: row };
}

export async function listSupportCasesForRequester(
  sb: SupabaseClient,
  input: {
    userId: string;
    audience?: "MEMBER" | "OWNER";
    storeId?: string | null;
    limit?: number;
  }
): Promise<{ ok: true; cases: SupportCaseRow[] } | { ok: false; error: string }> {
  let query = sb
    .from("support_cases")
    .select("*")
    .eq("requester_user_id", input.userId)
    .order("last_message_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 100));

  if (input.audience) {
    query = query.eq("audience", input.audience);
  }
  if (input.audience === "OWNER" && input.storeId) {
    query = query.eq("owner_store_id", input.storeId);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingSupportTable(error.message ?? "")) return { ok: false, error: "missing_table" };
    return { ok: false, error: error.message };
  }
  return { ok: true, cases: (data ?? []) as SupportCaseRow[] };
}

export async function listSupportMessages(
  sb: SupabaseClient,
  input: { caseId: string; includeInternal?: boolean }
): Promise<{ ok: true; messages: SupportMessageRow[] } | { ok: false; error: string }> {
  let query = sb
    .from("support_messages")
    .select("*")
    .eq("case_id", input.caseId)
    .order("created_at", { ascending: true });
  if (!input.includeInternal) {
    query = query.eq("message_type", "PUBLIC");
  }
  const { data, error } = await query;
  if (error) {
    if (isMissingSupportTable(error.message ?? "")) return { ok: false, error: "missing_table" };
    return { ok: false, error: error.message };
  }
  const rows = (data ?? []) as SupportMessageRow[];
  if (input.includeInternal) return { ok: true, messages: rows };
  // Customer view: a deleted admin message keeps its slot but never its text.
  return {
    ok: true,
    messages: rows.map((m) => (m.deleted_at ? { ...m, body: "" } : m)),
  };
}

/**
 * Console redesign — admin edits/deletes ONLY their own message (soft; audit in case events).
 * Bumps the case `updated_at` so open customer sheets (support_cases UPDATE subscription)
 * reload and show the edited / deleted state.
 */
async function loadOwnAdminMessage(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; messageId: string }
): Promise<{ ok: true; message: SupportMessageRow } | { ok: false; error: string }> {
  const { data, error } = await sb
    .from("support_messages")
    .select("*")
    .eq("id", input.messageId)
    .eq("case_id", input.caseId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const m = data as SupportMessageRow | null;
  if (!m) return { ok: false, error: "not_found" };
  if (m.sender_type !== "ADMIN" || m.sender_admin_id !== input.adminUserId) {
    return { ok: false, error: "not_own_message" };
  }
  if (m.deleted_at) return { ok: false, error: "message_deleted" };
  return { ok: true, message: m };
}

export async function adminEditSupportMessage(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; messageId: string; body: string }
): Promise<{ ok: true; message: SupportMessageRow } | { ok: false; error: string }> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "empty_body" };
  const own = await loadOwnAdminMessage(sb, input);
  if (!own.ok) return own;
  const previousBody = own.message.body;
  if (previousBody === body) return { ok: true, message: own.message };
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("support_messages")
    .update({ body, edited_at: now })
    .eq("id", input.messageId)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "edit_failed" };
  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "message_edited",
    actorUserId: input.adminUserId,
    payload: { message_id: input.messageId, previous_body: previousBody },
  });
  await sb.from("support_cases").update({ updated_at: now }).eq("id", input.caseId);
  return { ok: true, message: data as SupportMessageRow };
}

export async function adminDeleteSupportMessage(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; messageId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const own = await loadOwnAdminMessage(sb, input);
  if (!own.ok) return own;
  const now = new Date().toISOString();
  const { error } = await sb
    .from("support_messages")
    .update({ deleted_at: now })
    .eq("id", input.messageId);
  if (error) return { ok: false, error: error.message };
  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "message_deleted",
    actorUserId: input.adminUserId,
    payload: { message_id: input.messageId },
  });
  await sb.from("support_cases").update({ updated_at: now }).eq("id", input.caseId);
  return { ok: true };
}

export async function appendSupportMessage(
  sb: SupabaseClient,
  input: {
    caseId: string;
    senderUserId?: string;
    senderAdminId?: string;
    audience?: "MEMBER" | "OWNER";
    body: string;
    messageType: "PUBLIC" | "INTERNAL_NOTE";
    systemSeed?: boolean;
  }
): Promise<{ ok: true; message: SupportMessageRow } | { ok: false; error: string }> {
  const body = input.body.trim().slice(0, 8000);
  if (!body) return { ok: false, error: "empty_body" };

  let senderType: "MEMBER" | "OWNER" | "ADMIN" | "SYSTEM" = "SYSTEM";
  if (input.senderAdminId) {
    senderType = "ADMIN";
  } else if (input.audience === "OWNER") {
    senderType = "OWNER";
  } else if (input.senderUserId) {
    senderType = "MEMBER";
  }

  // DEF-05 (Phase 2): message insert + case status/unread/first-response update run in ONE
  // DB transaction (support_append_message). Transition rules are unchanged:
  // ADMIN PUBLIC → WAITING_USER (+requester unread, first response stamped once);
  // MEMBER/OWNER (non-seed) → WAITING_ADMIN (+admin unread); otherwise last_message_at only.
  const { data: message, error } = await sb.rpc("support_append_message", {
    p_case_id: input.caseId,
    p_sender_type: senderType, // derived server-side above, never from the request body
    p_sender_user_id: input.senderUserId ?? null,
    p_sender_admin_id: input.senderAdminId ?? null,
    p_message_type: input.messageType,
    p_body: body,
    p_system_seed: input.systemSeed === true,
  });

  if (error || !message) {
    console.error("[support] append_message_failed", {
      caseId: input.caseId,
      senderType,
      error: error?.message ?? "insert_failed",
    });
    return { ok: false, error: error?.message ?? "insert_failed" };
  }

  return { ok: true, message: message as SupportMessageRow };
}

export async function postRequesterSupportMessage(
  sb: SupabaseClient,
  input: { userId: string; caseId: string; body: string }
): Promise<{ ok: true; message: SupportMessageRow } | { ok: false; error: string }> {
  const gate = await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId });
  if (!gate.ok) return gate;
  if (gate.case.status === "RESOLVED" || gate.case.status === "ARCHIVED") {
    return { ok: false, error: "case_closed" };
  }
  const res = await appendSupportMessage(sb, {
    caseId: input.caseId,
    senderUserId: input.userId,
    audience: gate.case.audience,
    body: input.body,
    messageType: "PUBLIC",
  });
  if (!res.ok) return res;

  // CUT2 contract: support_customer_replied notifies assigned admin (admin deeplink).
  // Unassigned cases rely on admin_unread_count + Support Admin list wake-up only.
  const assignee = gate.case.assigned_admin_id ? String(gate.case.assigned_admin_id) : "";
  if (assignee) {
    await notifySupportEvent(sb, {
      userId: assignee,
      type: "support_customer_replied",
      title: `문의 ${gate.case.public_case_no}`,
      body: input.body,
      caseId: gate.case.id,
      publicCaseNo: gate.case.public_case_no,
      audience: gate.case.audience,
      storeId: gate.case.owner_store_id,
      dedupeKey: `support_customer_replied:${res.message.id}`,
      actorUserId: input.userId,
      routeUrl: buildAdminSupportCaseRoute(gate.case.id),
    });
  }

  return res;
}


export type AdminSupportListQuery = {
  /** Legacy single filter (deep links / older clients). Ignored when `tab` is set. */
  filter?: AdminSupportListFilter;
  /** Console status tab (ADMIN_SUPPORT_TABS). */
  tab?: AdminSupportTab;
  audience?: "MEMBER" | "OWNER" | null;
  /** SUPPORT_CATEGORY_GROUPS id. */
  group?: string | null;
  assignee?: "ME" | "UNASSIGNED" | null;
  adminUserId?: string | null;
  /** Only cases whose last message is 24h+ old. */
  stale?: boolean;
  search?: string;
  limit?: number;
};

/** Strip characters that would break a PostgREST `or()` expression. */
function sanitizeSearchToken(raw: string): string {
  return raw.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export async function listSupportCasesForAdmin(
  sb: SupabaseClient,
  input: AdminSupportListQuery
): Promise<{ ok: true; cases: SupportCaseRow[] } | { ok: false; error: string }> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  const tab = input.tab ?? null;
  const actionableOldestFirst = tab
    ? tab === "ACTIONABLE"
    : input.filter === "ACTIONABLE" || input.filter === "WAITING_ADMIN" || input.filter === "UNASSIGNED";
  let query = sb
    .from("support_cases")
    .select("*")
    .order("last_message_at", { ascending: actionableOldestFirst })
    .limit(limit);

  if (tab) {
    const statuses = ADMIN_SUPPORT_TAB_STATUSES[tab];
    if (statuses) query = query.in("status", [...statuses]);
  } else {
    switch (input.filter) {
      case "MEMBER":
        query = query.eq("audience", "MEMBER");
        break;
      case "OWNER":
        query = query.eq("audience", "OWNER");
        break;
      case "UNASSIGNED":
        query = query.is("assigned_admin_id", null).in("status", ["OPEN", "WAITING_ADMIN", "WAITING_USER"]);
        break;
      case "WAITING_ADMIN":
        query = query.eq("status", "WAITING_ADMIN");
        break;
      case "ACTIONABLE":
        query = query.in("status", ["OPEN", "WAITING_ADMIN"]);
        break;
      case "WAITING_USER":
        query = query.eq("status", "WAITING_USER");
        break;
      case "RESOLVED":
        query = query.eq("status", "RESOLVED");
        break;
      default:
        break;
    }
  }

  if (input.audience === "MEMBER" || input.audience === "OWNER") {
    query = query.eq("audience", input.audience);
  }
  const group = getSupportCategoryGroup(input.group);
  if (group) query = query.in("category", [...group.categories]);
  if (input.assignee === "UNASSIGNED") {
    query = query.is("assigned_admin_id", null);
  } else if (input.assignee === "ME" && input.adminUserId) {
    query = query.eq("assigned_admin_id", input.adminUserId);
  }
  if (input.stale) {
    query = query.lt("last_message_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
  }

  const search = (input.search ?? "").trim();
  if (search) {
    if (isUuid(search)) {
      // CUT D — match case id, business reference, or Owner store context
      query = query.or(
        `id.eq.${search},reference_id.eq.${search},owner_store_id.eq.${search},requester_user_id.eq.${search}`
      );
    } else if (/^SC-\d+$/i.test(search)) {
      query = query.ilike("public_case_no", search);
    } else {
      // Console redesign — customer name / email / store name / first words.
      const token = sanitizeSearchToken(search);
      if (token) {
        const like = `%${token}%`;
        const [{ data: people }, { data: stores }] = await Promise.all([
          sb
            .from("profiles")
            .select("id")
            .or(`display_name.ilike.${like},nickname.ilike.${like},email.ilike.${like}`)
            .limit(50),
          sb.from("stores").select("id").ilike("store_name", like).limit(50),
        ]);
        const personIds = ((people ?? []) as { id: string }[]).map((r) => r.id).filter(Boolean);
        const storeIds = ((stores ?? []) as { id: string }[]).map((r) => r.id).filter(Boolean);
        const ors = [`initial_summary.ilike.${like}`, `subject.ilike.${like}`];
        if (personIds.length) ors.push(`requester_user_id.in.(${personIds.join(",")})`);
        if (storeIds.length) ors.push(`owner_store_id.in.(${storeIds.join(",")})`);
        query = query.or(ors.join(","));
      }
    }
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingSupportTable(error.message ?? "")) return { ok: false, error: "missing_table" };
    return { ok: false, error: error.message };
  }
  return { ok: true, cases: (data ?? []) as SupportCaseRow[] };
}

/** Console tab badges — global per-status counts (independent of secondary filters). */
export async function countSupportCasesByTab(
  sb: SupabaseClient
): Promise<Record<AdminSupportTab, number> | null> {
  const results = await Promise.all(
    ADMIN_SUPPORT_TABS.map(async (tab) => {
      const statuses = ADMIN_SUPPORT_TAB_STATUSES[tab];
      let q = sb.from("support_cases").select("id", { count: "exact", head: true });
      if (statuses) q = q.in("status", [...statuses]);
      const { count, error } = await q;
      return [tab, error ? null : (count ?? 0)] as const;
    })
  );
  if (results.some(([, n]) => n == null)) return null;
  return Object.fromEntries(results) as Record<AdminSupportTab, number>;
}

/** DEF-09 — Admin queue display fields (read-only; never written to support_cases). */
export type SupportCaseAdminDisplayRow = SupportCaseRow & {
  requester_display_name: string | null;
  requester_email: string | null;
  owner_store_name: string | null;
};

/**
 * DEF-09 — restore legacy Admin member identification (display name / email / store)
 * using the same read pattern as `enrichAdminNoteThreadsForDisplay`.
 * Display-only: lookup failure degrades to null fields, never fails the list.
 */
export async function enrichSupportCasesForAdminDisplay(
  sb: SupabaseClient,
  cases: SupportCaseRow[]
): Promise<SupportCaseAdminDisplayRow[]> {
  if (cases.length === 0) return [];
  const userIds = [...new Set(cases.map((c) => c.requester_user_id).filter(Boolean))];
  const storeIds = [
    ...new Set(cases.map((c) => c.owner_store_id).filter((v): v is string => Boolean(v))),
  ];
  const [profilesRes, storesRes] = await Promise.all([
    sb.from("profiles").select("id, display_name, nickname, email").in("id", userIds),
    storeIds.length > 0
      ? sb.from("stores").select("id, store_name").in("id", storeIds)
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);
  if (profilesRes.error || storesRes.error) {
    console.error("[support] admin_display_enrich_failed", {
      profiles: profilesRes.error?.message ?? null,
      stores: storesRes.error?.message ?? null,
    });
  }
  const profileById = new Map<
    string,
    { display_name?: string | null; nickname?: string | null; email?: string | null }
  >();
  for (const p of (profilesRes.data ?? []) as {
    id?: string;
    display_name?: string | null;
    nickname?: string | null;
    email?: string | null;
  }[]) {
    if (p.id) profileById.set(String(p.id), p);
  }
  const storeNameById = new Map<string, string>();
  for (const st of (storesRes.data ?? []) as { id?: string; store_name?: string | null }[]) {
    const name = String(st.store_name ?? "").trim();
    if (st.id && name) storeNameById.set(String(st.id), name);
  }
  return cases.map((c) => {
    const profile = profileById.get(c.requester_user_id);
    return {
      ...c,
      requester_display_name:
        String(profile?.display_name ?? "").trim() ||
        String(profile?.nickname ?? "").trim() ||
        null,
      requester_email: String(profile?.email ?? "").trim() || null,
      owner_store_name: c.owner_store_id ? storeNameById.get(c.owner_store_id) ?? null : null,
    };
  });
}

export async function getSupportCaseForAdmin(
  sb: SupabaseClient,
  caseId: string
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  if (!isUuid(caseId)) return { ok: false, error: "invalid_case_id" };
  const { data, error } = await sb.from("support_cases").select("*").eq("id", caseId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "not_found" };
  return { ok: true, case: data as SupportCaseRow };
}

export async function adminReplySupportCase(
  sb: SupabaseClient,
  input: {
    adminUserId: string;
    caseId: string;
    body: string;
    internalNote?: boolean;
    closeAfter?: boolean;
  }
): Promise<{ ok: true; message: SupportMessageRow } | { ok: false; error: string }> {
  const gate = await getSupportCaseForAdmin(sb, input.caseId);
  if (!gate.ok) return gate;
  // DEF-02: a closed case returns to an active state only via reopenSupportCase
  // (reopened event + session + notification). Internal notes do not change state.
  if (
    !input.internalNote &&
    (gate.case.status === "RESOLVED" || gate.case.status === "ARCHIVED")
  ) {
    return { ok: false, error: "case_closed" };
  }

  const res = await appendSupportMessage(sb, {
    caseId: input.caseId,
    senderAdminId: input.adminUserId,
    body: input.body,
    messageType: input.internalNote ? "INTERNAL_NOTE" : "PUBLIC",
  });
  if (!res.ok) return res;

  if (!input.internalNote) {
    await notifySupportEvent(sb, {
      userId: gate.case.requester_user_id,
      type: "support_admin_replied",
      title: `문의 ${gate.case.public_case_no}`,
      body: input.body,
      caseId: gate.case.id,
      publicCaseNo: gate.case.public_case_no,
      audience: gate.case.audience,
      storeId: gate.case.owner_store_id,
      dedupeKey: `support_admin_replied:${res.message.id}`,
      actorUserId: input.adminUserId,
    });
  }

  if (input.closeAfter) {
    await adminUpdateSupportCaseStatus(sb, {
      adminUserId: input.adminUserId,
      caseId: input.caseId,
      status: "RESOLVED",
    });
  }

  return res;
}

export async function adminUpdateSupportCaseStatus(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; status: SupportCaseStatus }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  const gate = await getSupportCaseForAdmin(sb, input.caseId);
  if (!gate.ok) return gate;
  // DEF-15: same-status transition is a no-op (no write, no event, no notification) —
  // same idempotency contract as mark-read.
  if (gate.case.status === input.status) {
    return { ok: true, case: gate.case };
  }
  // Console redesign — 보관 only from 종료; 보관 해제 = back to 종료 (silent, keeps resolved_at).
  if (input.status === "ARCHIVED" && gate.case.status !== "RESOLVED") {
    return { ok: false, error: "not_closed" };
  }
  const unarchive = gate.case.status === "ARCHIVED" && input.status === "RESOLVED";

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: now,
  };
  if (input.status === "RESOLVED" && !unarchive) {
    patch.resolved_at = now;
    await sb
      .from("support_sessions")
      .update({ closed_at: now, last_seen_at: now })
      .eq("case_id", input.caseId)
      .is("closed_at", null);
  }
  if (input.status === "ARCHIVED") {
    patch.archived_at = now;
  }
  if (unarchive) {
    patch.archived_at = null;
  }

  const { data, error } = await sb
    .from("support_cases")
    .update(patch)
    .eq("id", input.caseId)
    .select("*")
    .single();
  if (error || !data) {
    // DEF-14: moving a closed case back to active collides with another active case on the
    // same key (customer already opened a new one) — surface a stable code.
    if ((error as { code?: string } | null)?.code === "23505") {
      return { ok: false, error: "active_case_exists" };
    }
    return { ok: false, error: error?.message ?? "update_failed" };
  }

  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "status_changed",
    actorUserId: input.adminUserId,
    payload: { status: input.status },
  });

  if (input.status === "RESOLVED" && !unarchive) {
    await notifySupportEvent(sb, {
      userId: gate.case.requester_user_id,
      type: "support_case_resolved",
      title: `문의 ${gate.case.public_case_no} 종료`,
      // Phase 3 A5 — fixed copy; `subject` is an internal "CATEGORY · surface" token.
      body: "상담이 종료되었습니다.",
      caseId: gate.case.id,
      publicCaseNo: gate.case.public_case_no,
      audience: gate.case.audience,
      storeId: gate.case.owner_store_id,
      dedupeKey: `support_case_resolved:${gate.case.id}:${now}`,
      actorUserId: input.adminUserId,
    });
  }

  return { ok: true, case: data as SupportCaseRow };
}

export async function adminAssignSupportCase(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; assigneeAdminId: string | null }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  const gate = await getSupportCaseForAdmin(sb, input.caseId);
  if (!gate.ok) return gate;

  const { data, error } = await sb
    .from("support_cases")
    .update({
      assigned_admin_id: input.assigneeAdminId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.caseId)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "assign_failed" };

  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "assigned",
    actorUserId: input.adminUserId,
    payload: { assigned_admin_id: input.assigneeAdminId },
  });

  // Phase 3 A5 / Owner decision D2 — assignment is internal; no customer notification.

  return { ok: true, case: data as SupportCaseRow };
}

export async function adminSetSupportCasePriority(
  sb: SupabaseClient,
  input: { adminUserId: string; caseId: string; priority: SupportCasePriority }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  const gate = await getSupportCaseForAdmin(sb, input.caseId);
  if (!gate.ok) return gate;
  const { data, error } = await sb
    .from("support_cases")
    .update({ priority: input.priority, updated_at: new Date().toISOString() })
    .eq("id", input.caseId)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "priority_failed" };
  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "priority_changed",
    actorUserId: input.adminUserId,
    payload: { priority: input.priority },
  });
  return { ok: true, case: data as SupportCaseRow };
}

export async function reopenSupportCase(
  sb: SupabaseClient,
  input: { userId: string; caseId: string; isAdmin?: boolean }
): Promise<{ ok: true; case: SupportCaseRow } | { ok: false; error: string }> {
  const gate = input.isAdmin
    ? await getSupportCaseForAdmin(sb, input.caseId)
    : await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId });
  if (!gate.ok) return gate;
  if (gate.case.status !== "RESOLVED" && gate.case.status !== "ARCHIVED") {
    return { ok: false, error: "not_closed" };
  }

  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("support_cases")
    .update({
      status: "OPEN",
      resolved_at: null,
      archived_at: null,
      updated_at: now,
      last_message_at: now,
    })
    .eq("id", input.caseId)
    .select("*")
    .single();
  if (error || !data) {
    if ((error as { code?: string } | null)?.code === "23505") {
      return { ok: false, error: "active_case_exists" };
    }
    return { ok: false, error: error?.message ?? "reopen_failed" };
  }

  await ensureOpenSupportSession(sb, {
    caseId: input.caseId,
    requesterUserId: gate.case.requester_user_id,
  });

  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "reopened",
    actorUserId: input.userId,
    payload: {},
  });

  // Phase 3 A5 — notify only when someone else (admin) reopened it; never self-notify.
  if (input.userId !== gate.case.requester_user_id) {
    await notifySupportEvent(sb, {
      userId: gate.case.requester_user_id,
      type: "support_case_reopened",
      title: `문의 ${gate.case.public_case_no} 재오픈`,
      body: "상담이 다시 열렸습니다.",
      caseId: gate.case.id,
      publicCaseNo: gate.case.public_case_no,
      audience: gate.case.audience,
      storeId: gate.case.owner_store_id,
      dedupeKey: `support_case_reopened:${gate.case.id}:${now}`,
      actorUserId: input.userId,
    });
  }

  return { ok: true, case: data as SupportCaseRow };
}

/**
 * Mark requester unread → 0.
 * IDEMPOTENT: when already 0, perform **no UPDATE** (no `updated_at` bump).
 * Prevents SupportModalHost Realtime `support_cases` UPDATE → GET → mark-read self-loop.
 */
export async function markSupportCaseReadForRequester(
  sb: SupabaseClient,
  input: { userId: string; caseId: string }
): Promise<{ ok: true; wrote: boolean } | { ok: false; error: string }> {
  const gate = await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId });
  if (!gate.ok) return gate;
  const unread = Number(gate.case.requester_unread_count ?? 0);
  if (!Number.isFinite(unread) || unread <= 0) {
    return { ok: true, wrote: false };
  }
  const { error } = await sb
    .from("support_cases")
    .update({ requester_unread_count: 0, updated_at: new Date().toISOString() })
    .eq("id", input.caseId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, wrote: true };
}

/**
 * Phase 3 A3 — bell/app-icon read sync. Opening a case marks this viewer's unread
 * `support_*` notification_events for the same case read (same write shape as the legacy
 * `markMemberAdminNoteNotificationsRead`). Separate from the case-counter mark-read above:
 * touches only notification_events, so no support_cases UPDATE → Realtime self-loop.
 */
export async function markSupportCaseNotificationsRead(
  sb: SupabaseClient,
  input: { userId: string; caseId: string }
): Promise<number> {
  const uid = input.userId.trim();
  const caseId = input.caseId.trim();
  if (!uid || !caseId) return 0;
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("notification_events")
    .update({ unread: false, read_at: now, opened_at: now })
    .eq("user_id", uid)
    .eq("unread", true)
    .is("read_at", null)
    .like("type", "support_%")
    .eq("display_payload->>supportCaseId", caseId)
    .select("id");
  if (error) {
    console.warn("[support] notification_read_sync_failed", { caseId, error: error.message });
    return 0;
  }
  const count = data?.length ?? 0;
  if (count > 0) invalidateNotificationBadgeCache(uid);
  return count;
}

/**
 * Mark admin unread → 0.
 * IDEMPOTENT: when already 0, perform **no UPDATE** (same write contract as requester).
 */
export async function markSupportCaseReadForAdmin(
  sb: SupabaseClient,
  caseId: string
): Promise<{ ok: true; wrote: boolean } | { ok: false; error: string }> {
  const gate = await getSupportCaseForAdmin(sb, caseId);
  if (!gate.ok) return gate;
  const unread = Number(gate.case.admin_unread_count ?? 0);
  if (!Number.isFinite(unread) || unread <= 0) {
    return { ok: true, wrote: false };
  }
  const { error } = await sb
    .from("support_cases")
    .update({ admin_unread_count: 0, updated_at: new Date().toISOString() })
    .eq("id", caseId);
  if (error) return { ok: false, error: error.message };
  return { ok: true, wrote: true };
}

export type AdminSupportSummary = {
  totalOpen: number;
  unassigned: number;
  waitingAdmin: number;
  /** Canonical status WAITING_USER count (alias waitingCustomer kept for A2-2 clients). */
  waitingUser: number;
  waitingCustomer: number;
  unreadCustomerReplies: number;
  /** Sidebar/ops badge — cases needing admin action (OPEN + WAITING_ADMIN). */
  actionable: number;
};

/**
 * A2-2 badge/dashboard SSOT. Actionable = OPEN | WAITING_ADMIN
 * (customer reply → WAITING_ADMIN; new case → OPEN). WAITING_USER is not actionable.
 */
export async function getAdminSupportSummary(
  sb: SupabaseClient
): Promise<{ ok: true; summary: AdminSupportSummary } | { ok: false; error: string }> {
  const active = ["OPEN", "WAITING_ADMIN", "WAITING_USER"] as const;

  const [
    totalOpenRes,
    unassignedRes,
    waitingAdminRes,
    waitingCustomerRes,
    unreadRes,
    actionableRes,
  ] = await Promise.all([
    sb.from("support_cases").select("id", { count: "exact", head: true }).in("status", [...active]),
    sb
      .from("support_cases")
      .select("id", { count: "exact", head: true })
      .in("status", [...active])
      .is("assigned_admin_id", null),
    sb.from("support_cases").select("id", { count: "exact", head: true }).eq("status", "WAITING_ADMIN"),
    sb.from("support_cases").select("id", { count: "exact", head: true }).eq("status", "WAITING_USER"),
    sb
      .from("support_cases")
      .select("id", { count: "exact", head: true })
      .in("status", [...active])
      .gt("admin_unread_count", 0),
    sb
      .from("support_cases")
      .select("id", { count: "exact", head: true })
      .in("status", ["OPEN", "WAITING_ADMIN"]),
  ]);

  const err =
    totalOpenRes.error ||
    unassignedRes.error ||
    waitingAdminRes.error ||
    waitingCustomerRes.error ||
    unreadRes.error ||
    actionableRes.error;
  if (err) {
    if (isMissingSupportTable(err.message ?? "")) return { ok: false, error: "missing_table" };
    return { ok: false, error: err.message };
  }

  const n = (c: number | null | undefined) => Math.max(0, Math.floor(Number(c) || 0));
  return {
    ok: true,
    summary: {
      totalOpen: n(totalOpenRes.count),
      unassigned: n(unassignedRes.count),
      waitingAdmin: n(waitingAdminRes.count),
      waitingUser: n(waitingCustomerRes.count),
      waitingCustomer: n(waitingCustomerRes.count),
      unreadCustomerReplies: n(unreadRes.count),
      actionable: n(actionableRes.count),
    },
  };
}

export { buildAdminSupportCaseRoute, buildSupportCaseRoute };
