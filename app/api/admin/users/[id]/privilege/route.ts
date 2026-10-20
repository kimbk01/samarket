/**
 * R6 Admin Privilege API — promote / revoke on the independent privilege axis.
 * Privilege-only path: never soft-deletes accounts or mutates Store / verification / classification.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/admin/require-admin-permission";
import {
  executeMemberPrivilegePromote,
  executeMemberPrivilegeRevoke,
} from "@/lib/admin-users/member-admin-privilege-mutation";
import { ADMIN_REASON_REQUIRED_CODE, parseAdminReason } from "@/lib/admin/operator-ux/admin-reason";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PrivilegeBody = {
  op?: string;
  reason?: unknown;
};

async function parseBody(req: NextRequest): Promise<PrivilegeBody | null> {
  try {
    return (await req.json()) as PrivilegeBody;
  } catch {
    return null;
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;

  const { id } = await context.params;
  const targetUserId = String(id ?? "").trim();
  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const body = await parseBody(req);
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const op = String(body.op ?? "").trim().toLowerCase();
  const { sb, actor } = gate;

  try {
    if (op === "promote") {
      const result = await executeMemberPrivilegePromote(sb, {
        actor: { userId: actor.userId },
        targetUserId,
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        ok: true,
        op: result.op,
        before: result.before,
        after: result.after,
      });
    }

    if (op === "revoke") {
      // 권한 해제 = delete(L3) — 두 호출자(회원 상세 권한 대화상자 · 관리자 계정 화면) 모두 확인창 사유를 보낸다 → 필수.
      const reason = parseAdminReason(body.reason);
      if (!reason) {
        return NextResponse.json({ ok: false, error: ADMIN_REASON_REQUIRED_CODE }, { status: 400 });
      }
      const result = await executeMemberPrivilegeRevoke(sb, {
        actor: { userId: actor.userId },
        targetUserId,
        reason,
      });
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
      }
      return NextResponse.json({
        ok: true,
        op: result.op,
        before: result.before,
        after: result.after,
      });
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { ok: false, error: "privilege_mutation_failed", detail: detail.slice(0, 300) },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: false, error: "invalid_op" }, { status: 400 });
}
