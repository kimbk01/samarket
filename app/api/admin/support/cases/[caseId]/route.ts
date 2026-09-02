import { NextRequest, NextResponse } from "next/server";
import { isRouteAdmin } from "@/lib/auth/is-route-admin";
import { requireAuthenticatedUserId } from "@/lib/auth/api-session";
import { tryCreateSupabaseServiceClient } from "@/lib/supabase/try-supabase-server";
import {
  adminAssignSupportCase,
  adminReplySupportCase,
  adminSetSupportCasePriority,
  adminUpdateSupportCaseStatus,
  getSupportCaseForAdmin,
  listSupportMessages,
  markSupportCaseReadForAdmin,
  reopenSupportCase,
} from "@/lib/support/support-case-service";
import type { SupportCasePriority, SupportCaseStatus } from "@/lib/support/support-case-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ caseId: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const { caseId } = await context.params;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }
  const gate = await getSupportCaseForAdmin(sb, caseId);
  if (!gate.ok) {
    const status = gate.error === "not_found" ? 404 : 400;
    return NextResponse.json({ ok: false, error: gate.error }, { status });
  }
  const messages = await listSupportMessages(sb, { caseId, includeInternal: true });
  if (!messages.ok) {
    return NextResponse.json({ ok: false, error: messages.error }, { status: 500 });
  }
  await markSupportCaseReadForAdmin(sb, caseId);
  return NextResponse.json({ ok: true, case: gate.case, messages: messages.messages });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ caseId: string }> }
) {
  if (!(await isRouteAdmin())) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const auth = await requireAuthenticatedUserId();
  if (!auth.ok) return auth.response;
  const { caseId } = await context.params;
  const sb = tryCreateSupabaseServiceClient();
  if (!sb) {
    return NextResponse.json({ ok: false, error: "supabase_unconfigured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    body?: string;
    status?: string;
    priority?: string;
    assigneeAdminId?: string | null;
    internalNote?: boolean;
    closeAfter?: boolean;
  };

  if (body.action === "reply") {
    const res = await adminReplySupportCase(sb, {
      adminUserId: auth.userId,
      caseId,
      body: String(body.body ?? ""),
      internalNote: body.internalNote === true,
      closeAfter: body.closeAfter === true,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, message: res.message });
  }

  if (body.action === "assign") {
    const res = await adminAssignSupportCase(sb, {
      adminUserId: auth.userId,
      caseId,
      assigneeAdminId: body.assigneeAdminId ?? null,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, case: res.case });
  }

  if (body.action === "status" && body.status) {
    const res = await adminUpdateSupportCaseStatus(sb, {
      adminUserId: auth.userId,
      caseId,
      status: body.status as SupportCaseStatus,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, case: res.case });
  }

  if (body.action === "priority" && body.priority) {
    const res = await adminSetSupportCasePriority(sb, {
      adminUserId: auth.userId,
      caseId,
      priority: body.priority as SupportCasePriority,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, case: res.case });
  }

  if (body.action === "reopen") {
    const res = await reopenSupportCase(sb, {
      userId: auth.userId,
      caseId,
      isAdmin: true,
    });
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, case: res.case });
  }

  return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
}
