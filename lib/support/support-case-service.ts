import type { SupabaseClient } from "@supabase/supabase-js";
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
} from "@/lib/support/support-case-types";
import {
  assertSupportReferenceAuthority,
  normalizeSupportContextForCase,
} from "@/lib/support/support-reference-authority";

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
  const cat = category.trim() || "OTHER";
  const surface = sourceSurface.trim();
  return surface ? `${cat} · ${surface}` : cat;
}

async function recordCaseEvent(
  sb: SupabaseClient,
  input: {
    caseId: string;
    eventType: string;
    actorUserId?: string | null;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  await sb.from("support_case_events").insert({
    case_id: input.caseId,
    event_type: input.eventType,
    actor_user_id: input.actorUserId ?? null,
    payload: input.payload ?? {},
  });
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
  await createAndDispatchNotificationEvent(sb, {
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
}

export async function openSupportCaseFromContext(
  sb: SupabaseClient,
  input: { userId: string; context: SupportContext; initialBody?: string }
): Promise<
  | { ok: true; case: SupportCaseRow; sessionId: string; created: boolean }
  | { ok: false; error: string }
> {
  if (!isSupportContextEnabled(input.context)) {
    return { ok: false, error: "disabled_context" };
  }

  const norm = normalizeSupportContextForCase(input.context);
  if (norm.audience === "OWNER") {
    const storeId = norm.ownerStoreId ?? "";
    if (!storeId) return { ok: false, error: "missing_store_id" };
    const gate = await getCachedStoreIfOwner(sb, input.userId, storeId);
    if (!gate.ok) return { ok: false, error: "store_forbidden" };
  } else if (norm.ownerStoreId) {
    return { ok: false, error: "member_case_must_not_have_store" };
  }

  const ref = await assertSupportReferenceAuthority(sb, {
    userId: input.userId,
    audience: norm.audience,
    storeId: norm.ownerStoreId,
    referenceType: norm.referenceType,
    referenceId: norm.referenceId,
  });
  if (!ref.ok) return { ok: false, error: ref.error };

  let existingQuery = sb
    .from("support_cases")
    .select("*")
    .eq("requester_user_id", input.userId)
    .eq("audience", norm.audience)
    .eq("category", norm.category)
    .in("status", Array.from(ACTIVE_SUPPORT_CASE_STATUSES));

  if (norm.audience === "OWNER") {
    existingQuery = existingQuery.eq("owner_store_id", norm.ownerStoreId!);
  } else {
    existingQuery = existingQuery.is("owner_store_id", null);
  }
  if (norm.referenceType && norm.referenceId) {
    existingQuery = existingQuery
      .eq("reference_type", norm.referenceType)
      .eq("reference_id", norm.referenceId);
  } else {
    existingQuery = existingQuery.is("reference_type", null).is("reference_id", null);
  }

  const { data: existing, error: existingErr } = await existingQuery
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingErr) {
    if (isMissingSupportTable(existingErr.message ?? "")) {
      return { ok: false, error: "missing_table" };
    }
    return { ok: false, error: existingErr.message };
  }

  if (existing) {
    const session = await ensureOpenSupportSession(sb, {
      caseId: existing.id,
      requesterUserId: input.userId,
    });
    if (!session.ok) return { ok: false, error: session.error };
    return {
      ok: true,
      case: existing as SupportCaseRow,
      sessionId: session.sessionId,
      created: false,
    };
  }

  const now = new Date().toISOString();
  const publicCaseNo = await allocatePublicCaseNo(sb);
  const subject = defaultSubject(norm.category, norm.sourceSurface);

  const { data: created, error: createErr } = await sb
    .from("support_cases")
    .insert({
      public_case_no: publicCaseNo,
      audience: norm.audience,
      requester_user_id: input.userId,
      owner_store_id: norm.audience === "OWNER" ? norm.ownerStoreId : null,
      category: norm.category,
      subject,
      source_surface: norm.sourceSurface,
      reference_type: norm.referenceType ?? null,
      reference_id: norm.referenceId ?? null,
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
    return { ok: false, error: createErr?.message ?? "create_failed" };
  }

  const session = await ensureOpenSupportSession(sb, {
    caseId: created.id,
    requesterUserId: input.userId,
  });
  if (!session.ok) return { ok: false, error: session.error };

  const initialBody = (input.initialBody ?? "").trim();
  if (initialBody) {
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
      category: norm.category,
      source_surface: norm.sourceSurface,
      reference_type: norm.referenceType ?? null,
      reference_id: norm.referenceId ?? null,
    },
  });

  await notifySupportEvent(sb, {
    userId: input.userId,
    type: "support_case_created",
    title: `문의 ${publicCaseNo}`,
    body: subject,
    caseId: created.id,
    publicCaseNo,
    audience: norm.audience,
    storeId: norm.ownerStoreId ?? null,
    dedupeKey: `support_case_created:${created.id}`,
    actorUserId: input.userId,
  });

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
  return { ok: true, messages: (data ?? []) as SupportMessageRow[] };
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

  const { data: message, error } = await sb
    .from("support_messages")
    .insert({
      case_id: input.caseId,
      sender_type: senderType,
      sender_user_id: input.senderUserId ?? null,
      sender_admin_id: input.senderAdminId ?? null,
      message_type: input.messageType,
      body,
    })
    .select("*")
    .single();

  if (error || !message) {
    return { ok: false, error: error?.message ?? "insert_failed" };
  }

  const now = new Date().toISOString();
  const { data: caseRow } = await sb
    .from("support_cases")
    .select("*")
    .eq("id", input.caseId)
    .maybeSingle();

  if (caseRow) {
    const patch: Record<string, unknown> = {
      last_message_at: now,
      updated_at: now,
    };
    if (senderType === "ADMIN" && input.messageType === "PUBLIC") {
      patch.status = "WAITING_USER";
      patch.requester_unread_count = Number(caseRow.requester_unread_count ?? 0) + 1;
      if (!caseRow.first_admin_response_at) patch.first_admin_response_at = now;
    } else if ((senderType === "MEMBER" || senderType === "OWNER") && !input.systemSeed) {
      patch.status = "WAITING_ADMIN";
      patch.admin_unread_count = Number(caseRow.admin_unread_count ?? 0) + 1;
    }
    await sb.from("support_cases").update(patch).eq("id", input.caseId);
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

export type AdminSupportListFilter =
  | "ALL"
  | "MEMBER"
  | "OWNER"
  | "UNASSIGNED"
  | "WAITING_ADMIN"
  | "WAITING_USER"
  | "RESOLVED";

export async function listSupportCasesForAdmin(
  sb: SupabaseClient,
  input: { filter?: AdminSupportListFilter; search?: string; limit?: number }
): Promise<{ ok: true; cases: SupportCaseRow[] } | { ok: false; error: string }> {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  let query = sb.from("support_cases").select("*").order("last_message_at", { ascending: false }).limit(limit);

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
    case "WAITING_USER":
      query = query.eq("status", "WAITING_USER");
      break;
    case "RESOLVED":
      query = query.eq("status", "RESOLVED");
      break;
    default:
      break;
  }

  const search = (input.search ?? "").trim();
  if (search) {
    if (isUuid(search)) {
      query = query.or(`id.eq.${search},reference_id.eq.${search}`);
    } else if (/^SC-\d+$/i.test(search)) {
      query = query.ilike("public_case_no", search);
    } else {
      query = query.ilike("subject", `%${search}%`);
    }
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingSupportTable(error.message ?? "")) return { ok: false, error: "missing_table" };
    return { ok: false, error: error.message };
  }
  return { ok: true, cases: (data ?? []) as SupportCaseRow[] };
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

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.status,
    updated_at: now,
  };
  if (input.status === "RESOLVED") {
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

  const { data, error } = await sb
    .from("support_cases")
    .update(patch)
    .eq("id", input.caseId)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "update_failed" };

  await recordCaseEvent(sb, {
    caseId: input.caseId,
    eventType: "status_changed",
    actorUserId: input.adminUserId,
    payload: { status: input.status },
  });

  if (input.status === "RESOLVED") {
    await notifySupportEvent(sb, {
      userId: gate.case.requester_user_id,
      type: "support_case_resolved",
      title: `문의 ${gate.case.public_case_no} 종료`,
      body: gate.case.subject,
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

  if (input.assigneeAdminId) {
    await notifySupportEvent(sb, {
      userId: gate.case.requester_user_id,
      type: "support_case_assigned",
      title: `문의 ${gate.case.public_case_no}`,
      body: "담당자가 배정되었습니다.",
      caseId: gate.case.id,
      publicCaseNo: gate.case.public_case_no,
      audience: gate.case.audience,
      storeId: gate.case.owner_store_id,
      dedupeKey: `support_case_assigned:${gate.case.id}:${input.assigneeAdminId}`,
      actorUserId: input.adminUserId,
    });
  }

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
  if (error || !data) return { ok: false, error: error?.message ?? "reopen_failed" };

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

  await notifySupportEvent(sb, {
    userId: gate.case.requester_user_id,
    type: "support_case_reopened",
    title: `문의 ${gate.case.public_case_no} 재오픈`,
    body: gate.case.subject,
    caseId: gate.case.id,
    publicCaseNo: gate.case.public_case_no,
    audience: gate.case.audience,
    storeId: gate.case.owner_store_id,
    dedupeKey: `support_case_reopened:${gate.case.id}:${now}`,
    actorUserId: input.userId,
  });

  return { ok: true, case: data as SupportCaseRow };
}

export async function markSupportCaseReadForRequester(
  sb: SupabaseClient,
  input: { userId: string; caseId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await getSupportCaseForUser(sb, { userId: input.userId, caseId: input.caseId });
  if (!gate.ok) return gate;
  await sb
    .from("support_cases")
    .update({ requester_unread_count: 0, updated_at: new Date().toISOString() })
    .eq("id", input.caseId);
  return { ok: true };
}

export async function markSupportCaseReadForAdmin(
  sb: SupabaseClient,
  caseId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  await sb
    .from("support_cases")
    .update({ admin_unread_count: 0, updated_at: new Date().toISOString() })
    .eq("id", caseId);
  return { ok: true };
}

export type AdminSupportSummary = {
  totalOpen: number;
  unassigned: number;
  waitingAdmin: number;
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
      waitingCustomer: n(waitingCustomerRes.count),
      unreadCustomerReplies: n(unreadRes.count),
      actionable: n(actionableRes.count),
    },
  };
}

export { buildAdminSupportCaseRoute, buildSupportCaseRoute };
