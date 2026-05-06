import { NextResponse } from "next/server";

import { requireAdminApiUser } from "@/lib/admin/require-admin-api";

import {

  DELIVERY_OPERATION_RECOVERY_ACTIONS,

  type DeliveryOperationRecoveryAction,

} from "@/lib/admin/delivery-operation-recovery-actions";

import { getSupabaseServer } from "@/lib/chat/supabase-server";



export const runtime = "nodejs";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {

  const admin = await requireAdminApiUser();

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

    p_actor: admin.userId,

  });



  if (error) {

    const msg = String(error.message ?? "");

    if (/function .* does not exist|Could not find the function/i.test(msg)) {

      return NextResponse.json(

        { error: "rpc_missing", hint: "Apply migration 20260516120000_delivery_operations_recovery_center" },

        { status: 503 }

      );

    }

    return NextResponse.json({ error: "rpc_failed", message: msg.slice(0, 240) }, { status: 500 });

  }



  return NextResponse.json(data ?? { ok: false });

}


