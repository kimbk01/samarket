import { NextResponse } from "next/server";

import { requireAdminPermission } from "@/lib/admin/require-admin-permission";

import { appendAdminRouteAudit } from "@/lib/admin/audit/append-admin-route-audit";

import {

  DELIVERY_OPERATION_RECOVERY_ACTIONS,

  type DeliveryOperationRecoveryAction,

} from "@/lib/admin/delivery-operation-recovery-actions";

import { getSupabaseServer } from "@/lib/chat/supabase-server";
import { internalErrorResponse } from "@/lib/security/internal-error-response";



export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {

  const admin = await requireAdminPermission("business");

  if (!admin.ok) return admin.response;



  let body: unknown;

  try {

    body = await req.json();

  } catch {

    return NextResponse.json({ error: "invalid_json" }, { status: 400 });

  }



  const actionRaw =

    body != null && typeof body === "object" && !Array.isArray(body) && "action" in body

      ? String((body as { action?: unknown }).action ?? "").trim()

      : "";



  // 일괄 복구 = L3 (사유 필수 · 대상 재입력은 화면에서) — 사유는 작업 기록에 남긴다 (DEF-22)
  const reason =
    body != null && typeof body === "object" && !Array.isArray(body) && typeof (body as { reason?: unknown }).reason === "string"
      ? String((body as { reason: string }).reason).trim().slice(0, 600)
      : "";
  if (reason.length < 2) {
    return NextResponse.json({ error: "reason_required" }, { status: 400 });
  }

  if (!DELIVERY_OPERATION_RECOVERY_ACTIONS.includes(actionRaw as DeliveryOperationRecoveryAction)) {

    return NextResponse.json(

      {

        error: "bad_action",

        allowed: [...DELIVERY_OPERATION_RECOVERY_ACTIONS],

      },

      { status: 400 }

    );

  }



  let sb: ReturnType<typeof getSupabaseServer>;

  try {

    sb = getSupabaseServer();

  } catch {

    return NextResponse.json({ error: "server_config" }, { status: 500 });

  }



  const sbAny = sb as any;

  const { data, error } = await sbAny.rpc("admin_delivery_operation_recovery_execute", {

    p_action: actionRaw,

    p_actor: admin.actor.userId,

  });



  if (error) {

    const msg = String(error.message ?? "");

    if (/function .* does not exist|Could not find the function/i.test(msg)) {

      return NextResponse.json(

        { error: "rpc_missing", hint: "Apply migration 20260516120000_delivery_operations_recovery_center" },

        { status: 503 }

      );

    }

    return internalErrorResponse("rpc_failed", "[/api/admin/delivery-operations/recovery POST]", msg, 500);

  }



  await appendAdminRouteAudit(admin.sb, req, {

    actorId: admin.actor.userId,

    targetType: "delivery_operations",

    targetId: actionRaw,

    action: "delivery_operations.recovery_execute",

    after: {

      recovery_action: actionRaw,

      reason,

      result: data != null && typeof data === "object" ? (data as Record<string, unknown>) : null,

    },

  });



  // RPC 는 실패도 200 + `{ ok: false, error | result: "error" }` 로 돌려준다 → HTTP 오류로 변환해
  // 화면이 「완료」로 오인하지 않게 한다 (동시 실행 잠금·권한·내부 예외).
  const out = data != null && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (!out || out.ok !== true) {
    const rpcErr = typeof out?.error === "string" ? out.error : "";
    if (rpcErr === "concurrent_recovery") {
      return NextResponse.json({ ok: false, error: "concurrent_recovery" }, { status: 409 });
    }
    if (rpcErr === "not_platform_admin") {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    if (rpcErr === "bad_action" || rpcErr === "unknown_action") {
      return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: "rpc_failed" }, { status: 500 });
  }

  return NextResponse.json(out);

}


