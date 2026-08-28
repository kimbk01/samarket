import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/admin/require-admin-permission";
import { GIFT_RPCS } from "@/lib/gift-certificate/gift-certificate-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

function s(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** POST /api/admin/gift-certificates/instances/[id]/corrective — dedicated Instance admin actions. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const gate = await requireAdminPermission("business");
  if (!gate.ok) return gate.response;

  const id = s((await ctx.params).id);
  if (!id) return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const action = s(body.action).toLowerCase();
  const reason = s(body.reason);
  if (!reason) {
    return NextResponse.json({ ok: false, error: "reason_required" }, { status: 400 });
  }

  let rpcName: string | null = null;
  let args: Record<string, unknown> = {
    p_instance_id: id,
    p_operator_id: gate.actor.userId,
    p_reason: reason,
  };

  if (action === "suspend") {
    rpcName = GIFT_RPCS.instanceSuspend;
  } else if (action === "resume") {
    rpcName = GIFT_RPCS.instanceResume;
  } else if (action === "adjust_validity") {
    rpcName = GIFT_RPCS.instanceAdjustValidity;
    const untilRaw = body.validUntil ?? body.valid_until;
    args = {
      ...args,
      p_valid_until:
        untilRaw == null || s(untilRaw) === ""
          ? null
          : s(untilRaw).slice(0, 10),
    };
  } else {
    return NextResponse.json({ ok: false, error: "invalid_action" }, { status: 400 });
  }

  const { data, error } = await gate.sb.rpc(rpcName, args);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const result = data as { ok?: boolean; error?: string } | null;
  if (result && result.ok === false) {
    return NextResponse.json({ ok: false, error: result.error || "rpc_failed" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, result: data });
}
